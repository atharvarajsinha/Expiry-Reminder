"""Vehicle REST endpoints.

Note that neither ``fetch`` nor ``refresh`` ever waits for FireAPI: both queue
a Celery job and answer ``202 Accepted`` straight away.
"""

from __future__ import annotations

import logging

from rest_framework.views import APIView

from core.dates import today_local
from core.errors import ApiError, ErrorCode
from core.responses import success
from core.validators import validate_vehicle_number
from jobs import services as job_services
from vehicles import services
from vehicles.serializers import VehicleFetchSerializer
from vehicles.tasks import fetch_vehicle_details

logger = logging.getLogger(__name__)


def _queue(job, vehicle_id=None):
    """Queue the fetch task; a broken broker fails the job loudly but safely."""
    try:
        fetch_vehicle_details.delay(job["job_id"], job["vehicle_no"], vehicle_id)
    except Exception as exc:  # broker unreachable
        logger.error(
            "Could not queue job %s: %s", job["job_id"], exc.__class__.__name__
        )
        job_services.mark_failed(
            job["job_id"],
            ErrorCode.QUEUE_UNAVAILABLE,
            "The background worker queue is unavailable. Please try again.",
        )
        raise ApiError(
            ErrorCode.QUEUE_UNAVAILABLE,
            "The background worker queue is unavailable. Please try again.",
            status_code=503,
        )


class VehicleListView(APIView):
    """``GET /api/vehicles/`` -- summary list (no owner/chassis/policy data)."""

    throttle_scope = "read"

    def get(self, request):
        today = today_local()
        documents = services.list_vehicles()
        return success([services.serialize_summary(doc, today) for doc in documents])


class VehicleDetailView(APIView):
    """``GET /api/vehicles/{id}/`` and ``DELETE /api/vehicles/{id}/``."""

    throttle_scope = "read"

    def get(self, request, vehicle_id):
        document = services.get_by_id(vehicle_id)
        return success(services.serialize_detail(document, today_local()))

    def delete(self, request, vehicle_id):
        services.delete_vehicle(vehicle_id)
        return success({"deleted": True, "id": str(vehicle_id)})


class VehicleFetchView(APIView):
    """``POST /api/vehicles/fetch/`` -- queue a first time lookup."""

    throttle_scope = "vehicle_fetch"

    def post(self, request):
        serializer = VehicleFetchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vehicle_no = validate_vehicle_number(serializer.validated_data["vehicle_no"])

        existing = services.get_by_number(vehicle_no)
        if existing is not None:
            raise ApiError(
                ErrorCode.VEHICLE_ALREADY_EXISTS,
                "Vehicle %s is already saved. Use the refresh endpoint to "
                "update it." % vehicle_no,
                status_code=409,
                details={
                    "vehicle_id": str(existing["_id"]),
                    "vehicle_no": vehicle_no,
                    "refresh_url": "/api/vehicles/%s/refresh/" % existing["_id"],
                },
            )

        job = job_services.create_job(job_services.JOB_TYPE_FETCH, vehicle_no)
        _queue(job)

        return success(
            {
                "job_id": job["job_id"],
                "vehicle_no": vehicle_no,
                "status": job["status"],
                "poll_url": "/api/jobs/%s/" % job["job_id"],
            },
            status_code=202,
        )


class VehicleRefreshView(APIView):
    """``POST /api/vehicles/{id}/refresh/`` -- queue an update of stored data."""

    throttle_scope = "vehicle_refresh"

    def post(self, request, vehicle_id):
        vehicle = services.get_by_id(vehicle_id)
        vehicle_no = vehicle["vehicle_no"]

        job = job_services.create_job(
            job_services.JOB_TYPE_REFRESH, vehicle_no, vehicle_id=vehicle["_id"]
        )
        _queue(job, vehicle_id=str(vehicle["_id"]))

        return success(
            {
                "job_id": job["job_id"],
                "vehicle_no": vehicle_no,
                "vehicle_id": str(vehicle["_id"]),
                "status": job["status"],
                "poll_url": "/api/jobs/%s/" % job["job_id"],
            },
            status_code=202,
        )
