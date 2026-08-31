"""Vehicle persistence and API serialisation.

All MongoDB access for vehicles lives here so views and Celery tasks share
exactly the same behaviour.
"""

from __future__ import annotations

import logging

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

from core import mongo
from core.dates import (
    document_status,
    iso_date,
    iso_datetime,
    now_utc,
    worst_status,
)
from core.errors import ApiError, ErrorCode
from core.validators import mask_vehicle_number
from vehicles.normalizers import merge_for_refresh

logger = logging.getLogger(__name__)

DOCUMENT_TYPES = ("insurance", "pucc")


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
def to_object_id(vehicle_id):
    try:
        return ObjectId(str(vehicle_id))
    except (InvalidId, TypeError):
        raise ApiError(
            ErrorCode.VEHICLE_NOT_FOUND, "Vehicle not found.", status_code=404
        )


def get_by_number(vehicle_no):
    try:
        return mongo.vehicles_collection().find_one({"vehicle_no": vehicle_no})
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def get_by_id(vehicle_id, required=True):
    object_id = to_object_id(vehicle_id)
    try:
        document = mongo.vehicles_collection().find_one({"_id": object_id})
    except PyMongoError as exc:
        raise mongo.database_error(exc)
    if document is None and required:
        raise ApiError(
            ErrorCode.VEHICLE_NOT_FOUND, "Vehicle not found.", status_code=404
        )
    return document


def list_vehicles():
    try:
        cursor = mongo.vehicles_collection().find({}).sort("created_at", DESCENDING)
        return list(cursor)
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def iter_vehicles_with_expiry():
    """Every vehicle that has at least one expiry date (reminder sweep)."""
    query = {
        "$or": [
            {"insurance.expires_on": {"$ne": None}},
            {"pucc.expires_on": {"$ne": None}},
        ]
    }
    try:
        return list(mongo.vehicles_collection().find(query))
    except PyMongoError as exc:
        raise mongo.database_error(exc)


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------
def create_vehicle(payload):
    """Insert a freshly fetched vehicle.  Returns its id as a string."""
    mongo.ensure_indexes()
    timestamp = now_utc()
    document = dict(payload)
    document.update(
        {"created_at": timestamp, "updated_at": timestamp, "last_fetched_at": timestamp}
    )
    try:
        result = mongo.vehicles_collection().insert_one(document)
    except DuplicateKeyError:
        # Two fetches for the same number raced; treat it as a refresh.
        existing = get_by_number(payload["vehicle_no"])
        if existing is None:  # pragma: no cover - extremely unlikely
            raise ApiError(
                ErrorCode.VEHICLE_ALREADY_EXISTS,
                "This vehicle already exists.",
                status_code=409,
            )
        return update_vehicle(existing["_id"], payload)
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info(
        "Stored vehicle %s (id=%s)",
        mask_vehicle_number(payload.get("vehicle_no")),
        result.inserted_id,
    )
    return str(result.inserted_id)


def update_vehicle(vehicle_id, payload):
    """Apply a refresh without ever nulling out existing values."""
    object_id = ObjectId(str(vehicle_id))
    existing = mongo.vehicles_collection().find_one({"_id": object_id})
    if existing is None:
        raise ApiError(
            ErrorCode.VEHICLE_NOT_FOUND, "Vehicle not found.", status_code=404
        )

    update = merge_for_refresh(existing, payload)
    timestamp = now_utc()
    update["updated_at"] = timestamp
    update["last_fetched_at"] = timestamp

    try:
        mongo.vehicles_collection().update_one({"_id": object_id}, {"$set": update})
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info(
        "Refreshed vehicle %s (id=%s)",
        mask_vehicle_number(existing.get("vehicle_no")),
        vehicle_id,
    )
    return str(object_id)


def touch_fetched(vehicle_id):
    """Record a successful upstream call that produced no changes."""
    try:
        mongo.vehicles_collection().update_one(
            {"_id": ObjectId(str(vehicle_id))},
            {"$set": {"last_fetched_at": now_utc()}},
        )
    except PyMongoError as exc:  # pragma: no cover - defensive
        raise mongo.database_error(exc)


def delete_vehicle(vehicle_id):
    """Delete a vehicle and every reminder that belongs to it."""
    object_id = to_object_id(vehicle_id)
    try:
        result = mongo.vehicles_collection().delete_one({"_id": object_id})
        if result.deleted_count == 0:
            raise ApiError(
                ErrorCode.VEHICLE_NOT_FOUND, "Vehicle not found.", status_code=404
            )
        removed = mongo.reminders_collection().delete_many({"vehicle_id": str(object_id)})
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info(
        "Deleted vehicle id=%s along with %s reminder(s)",
        vehicle_id,
        removed.deleted_count,
    )
    return True


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def statuses_for(document, today=None):
    insurance = document_status((document.get("insurance") or {}).get("expires_on"), today)
    pucc = document_status((document.get("pucc") or {}).get("expires_on"), today)
    return insurance, pucc


def serialize_summary(document, today=None):
    """List payload -- deliberately free of owner/chassis/engine/policy data."""
    insurance, pucc = statuses_for(document, today)
    return {
        "id": str(document.get("_id")),
        "vehicle_no": document.get("vehicle_no"),
        "maker": document.get("maker"),
        "model": document.get("model"),
        "vehicle_category": document.get("vehicle_category"),
        "insurance_expires_on": insurance["expires_on"],
        "insurance_status": insurance["status"],
        "insurance_days_remaining": insurance["days_remaining"],
        "pucc_expires_on": pucc["expires_on"],
        "pucc_status": pucc["status"],
        "pucc_days_remaining": pucc["days_remaining"],
        "overall_status": worst_status([insurance["status"], pucc["status"]]),
        "last_fetched_at": iso_datetime(document.get("last_fetched_at")),
        "updated_at": iso_datetime(document.get("updated_at")),
    }


def serialize_detail(document, today=None):
    """Full authorised detail payload."""
    insurance_block = document.get("insurance") or {}
    pucc_block = document.get("pucc") or {}
    insurance, pucc = statuses_for(document, today)

    return {
        "id": str(document.get("_id")),
        "vehicle_no": document.get("vehicle_no"),
        "registration_date": iso_date(document.get("registration_date")),
        "registered_at": document.get("registered_at"),
        "insurance": {
            "company": insurance_block.get("company"),
            "policy_no": insurance_block.get("policy_no"),
            "expires_on": insurance["expires_on"],
            "status": insurance["status"],
            "status_label": insurance["label"],
            "days_remaining": insurance["days_remaining"],
        },
        "pucc": {
            "certificate_no": pucc_block.get("certificate_no"),
            "expires_on": pucc["expires_on"],
            "status": pucc["status"],
            "status_label": pucc["label"],
            "days_remaining": pucc["days_remaining"],
        },
        "vehicle_category": document.get("vehicle_category"),
        "vehicle_class": document.get("vehicle_class"),
        "chassis_no": document.get("chassis_no"),
        "engine_no": document.get("engine_no"),
        "cubic_capacity": document.get("cubic_capacity"),
        "maker": document.get("maker"),
        "model": document.get("model"),
        "owner_name": document.get("owner_name"),
        "father_name": document.get("father_name"),
        "fuel": document.get("fuel"),
        "wheelbase": document.get("wheelbase"),
        "seat_capacity": document.get("seat_capacity"),
        "fitness_upto": iso_date(document.get("fitness_upto")),
        "tax_upto": iso_date(document.get("tax_upto")),
        "overall_status": worst_status([insurance["status"], pucc["status"]]),
        "created_at": iso_datetime(document.get("created_at")),
        "updated_at": iso_datetime(document.get("updated_at")),
        "last_fetched_at": iso_datetime(document.get("last_fetched_at")),
    }
