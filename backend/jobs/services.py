"""Job records for the asynchronous vehicle fetch/refresh flow.

A job is created by the API (status ``queued``), picked up by the Celery
worker (``processing``) and closed as ``completed`` or ``failed``.  Only
non-sensitive data is stored: never API keys, headers or credentials.
"""

from __future__ import annotations

import logging
import uuid

from pymongo import DESCENDING
from pymongo.errors import PyMongoError

from core import mongo
from core.dates import iso_datetime, now_utc
from core.errors import ApiError, ErrorCode

logger = logging.getLogger(__name__)

QUEUED = "queued"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"

JOB_TYPE_FETCH = "fetch_vehicle"
JOB_TYPE_REFRESH = "refresh_vehicle"


def create_job(job_type, vehicle_no, vehicle_id=None):
    mongo.ensure_indexes()
    job = {
        "job_id": uuid.uuid4().hex,
        "job_type": job_type,
        "vehicle_no": vehicle_no,
        "vehicle_id": str(vehicle_id) if vehicle_id else None,
        "status": QUEUED,
        "error": None,
        "error_code": None,
        "created_at": now_utc(),
        "started_at": None,
        "completed_at": None,
    }
    try:
        mongo.jobs_collection().insert_one(dict(job))
    except PyMongoError as exc:
        raise mongo.database_error(exc)
    logger.info("Job %s created (type=%s)", job["job_id"], job_type)
    return job


def get_job(job_id, required=True):
    try:
        document = mongo.jobs_collection().find_one({"job_id": str(job_id)})
    except PyMongoError as exc:
        raise mongo.database_error(exc)
    if document is None and required:
        raise ApiError(ErrorCode.JOB_NOT_FOUND, "Job not found.", status_code=404)
    return document


def list_jobs(limit=25):
    try:
        cursor = (
            mongo.jobs_collection().find({}).sort("created_at", DESCENDING).limit(limit)
        )
        return list(cursor)
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def _update(job_id, changes):
    try:
        mongo.jobs_collection().update_one({"job_id": str(job_id)}, {"$set": changes})
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def mark_processing(job_id):
    _update(job_id, {"status": PROCESSING, "started_at": now_utc()})
    logger.info("Job %s started", job_id)


def mark_completed(job_id, vehicle_id=None):
    changes = {
        "status": COMPLETED,
        "completed_at": now_utc(),
        "error": None,
        "error_code": None,
    }
    if vehicle_id:
        changes["vehicle_id"] = str(vehicle_id)
    _update(job_id, changes)
    logger.info("Job %s completed", job_id)


def mark_failed(job_id, code, message):
    _update(
        job_id,
        {
            "status": FAILED,
            "completed_at": now_utc(),
            "error": message,
            "error_code": code,
        },
    )
    logger.warning("Job %s failed (%s)", job_id, code)


def serialize(job):
    return {
        "job_id": job.get("job_id"),
        "job_type": job.get("job_type"),
        "vehicle_no": job.get("vehicle_no"),
        "vehicle_id": job.get("vehicle_id"),
        "status": job.get("status"),
        "error": job.get("error"),
        "error_code": job.get("error_code"),
        "created_at": iso_datetime(job.get("created_at")),
        "started_at": iso_datetime(job.get("started_at")),
        "completed_at": iso_datetime(job.get("completed_at")),
    }
