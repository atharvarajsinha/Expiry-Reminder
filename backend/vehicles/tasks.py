"""Celery tasks that talk to FireAPI.

The HTTP request to FireAPI can take a long time, which is exactly why it
never happens inside a web request: the API creates a job, returns ``202`` and
this task does the slow work.
"""

from __future__ import annotations

import logging

from celery import shared_task

from core.errors import ErrorCode
from core.validators import mask_vehicle_number
from jobs import services as job_services
from vehicles import services as vehicle_services
from vehicles.fireapi import FireApiError, fetch_vehicle_info
from vehicles.normalizers import normalize_vehicle_payload

logger = logging.getLogger(__name__)

# Failures worth retrying: the upstream service was slow, unreachable or busy.
RETRYABLE_CODES = {
    ErrorCode.VEHICLE_API_TIMEOUT,
    ErrorCode.VEHICLE_API_UNAVAILABLE,
    ErrorCode.VEHICLE_API_RATE_LIMITED,
}


@shared_task(
    bind=True,
    name="vehicles.fetch_vehicle_details",
    max_retries=2,
    default_retry_delay=30,
)
def fetch_vehicle_details(self, job_id, vehicle_no, vehicle_id=None):
    """Fetch a vehicle from FireAPI and store (or refresh) it in MongoDB.

    ``vehicle_id`` set  -> refresh an existing vehicle (old data is kept if
    the upstream call fails); unset -> first time fetch.
    """
    masked = mask_vehicle_number(vehicle_no)
    is_refresh = bool(vehicle_id)
    logger.info(
        "Job %s: %s vehicle %s",
        job_id,
        "refreshing" if is_refresh else "fetching",
        masked,
    )

    job_services.mark_processing(job_id)

    try:
        raw = fetch_vehicle_info(vehicle_no)
    except FireApiError as exc:
        if exc.code in RETRYABLE_CODES and self.request.retries < self.max_retries:
            logger.info(
                "Job %s: retrying after %s (attempt %s)",
                job_id,
                exc.code,
                self.request.retries + 1,
            )
            raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))
        # Refresh failures deliberately leave the stored vehicle untouched.
        job_services.mark_failed(job_id, exc.code, exc.message)
        return {"job_id": job_id, "status": job_services.FAILED, "error": exc.code}
    except Exception as exc:  # pragma: no cover - unexpected
        logger.exception("Job %s: unexpected error while calling the vehicle service", job_id)
        job_services.mark_failed(
            job_id,
            ErrorCode.INTERNAL_ERROR,
            "An unexpected error occurred while fetching the vehicle.",
        )
        return {"job_id": job_id, "status": job_services.FAILED, "error": str(type(exc).__name__)}

    try:
        payload = normalize_vehicle_payload(raw, fallback_vehicle_no=vehicle_no)
        if not payload.get("vehicle_no"):
            payload["vehicle_no"] = vehicle_no

        if is_refresh:
            stored_id = vehicle_services.update_vehicle(vehicle_id, payload)
        else:
            existing = vehicle_services.get_by_number(payload["vehicle_no"])
            if existing is not None:
                stored_id = vehicle_services.update_vehicle(existing["_id"], payload)
            else:
                stored_id = vehicle_services.create_vehicle(payload)
    except Exception as exc:
        logger.exception("Job %s: failed to store vehicle data", job_id)
        code = getattr(exc, "code", ErrorCode.INTERNAL_ERROR)
        message = getattr(exc, "message", "Could not save the vehicle information.")
        job_services.mark_failed(job_id, code, message)
        return {"job_id": job_id, "status": job_services.FAILED, "error": code}

    job_services.mark_completed(job_id, vehicle_id=stored_id)
    return {
        "job_id": job_id,
        "status": job_services.COMPLETED,
        "vehicle_id": stored_id,
    }
