"""Reminder engine.

The daily sweep is intentionally idempotent: a reminder row is *claimed*
through a unique compound index
(``vehicle_id + document_type + expiry_date + reminder_type``) before the
email is sent, so running the task twice -- or running two workers -- can
never produce a duplicate email.
"""

from __future__ import annotations

import logging

from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

from appsettings import services as settings_services
from core import mongo
from core.dates import (
    days_remaining,
    iso_date,
    iso_datetime,
    now_utc,
    reminder_type_for_offset,
    scheduled_for,
    to_storage,
    today_local,
)
from reminders.email_service import EmailError, send_reminder_email
from vehicles import services as vehicle_services

logger = logging.getLogger(__name__)

DOCUMENT_TYPES = ("insurance", "pucc")


# ---------------------------------------------------------------------------
# Reminder records
# ---------------------------------------------------------------------------
def _key(vehicle_id, document_type, expiry_date, reminder_type):
    return {
        "vehicle_id": str(vehicle_id),
        "document_type": document_type,
        "expiry_date": to_storage(expiry_date),
        "reminder_type": reminder_type,
    }


def claim_reminder(vehicle_id, document_type, expiry_date, reminder_type, offset):
    """Reserve the right to send this exact reminder.

    Returns the reminder document to send, or ``None`` when it has already
    been sent (the duplicate-prevention rule).
    """
    mongo.ensure_indexes()
    key = _key(vehicle_id, document_type, expiry_date, reminder_type)
    collection = mongo.reminders_collection()

    try:
        existing = collection.find_one(key)
        if existing is not None:
            if existing.get("sent"):
                return None
            return existing  # previous attempt failed; allow a retry

        document = dict(key)
        document.update(
            {
                "scheduled_for": to_storage(scheduled_for(expiry_date, offset)),
                "sent": False,
                "sent_at": None,
                "attempts": 0,
                "last_error": None,
                "message_id": None,
                "created_at": now_utc(),
            }
        )
        collection.insert_one(document)
        return document
    except DuplicateKeyError:
        # Another worker claimed it a moment ago.
        existing = collection.find_one(key)
        if existing is None or existing.get("sent"):
            return None
        return existing
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def mark_sent(reminder, message_id=None):
    try:
        mongo.reminders_collection().update_one(
            _key(
                reminder["vehicle_id"],
                reminder["document_type"],
                reminder["expiry_date"],
                reminder["reminder_type"],
            ),
            {
                "$set": {
                    "sent": True,
                    "sent_at": now_utc(),
                    "last_error": None,
                    "message_id": message_id,
                },
                "$inc": {"attempts": 1},
            },
        )
    except PyMongoError as exc:  # pragma: no cover - defensive
        raise mongo.database_error(exc)


def mark_attempt_failed(reminder, message):
    try:
        mongo.reminders_collection().update_one(
            _key(
                reminder["vehicle_id"],
                reminder["document_type"],
                reminder["expiry_date"],
                reminder["reminder_type"],
            ),
            {"$set": {"last_error": message}, "$inc": {"attempts": 1}},
        )
    except PyMongoError as exc:  # pragma: no cover - defensive
        raise mongo.database_error(exc)


def list_reminders(limit=50, vehicle_id=None):
    query = {}
    if vehicle_id:
        query["vehicle_id"] = str(vehicle_id)
    try:
        cursor = (
            mongo.reminders_collection()
            .find(query)
            .sort("created_at", DESCENDING)
            .limit(limit)
        )
        return list(cursor)
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def serialize(reminder):
    return {
        "vehicle_id": reminder.get("vehicle_id"),
        "document_type": reminder.get("document_type"),
        "expiry_date": iso_date(reminder.get("expiry_date")),
        "reminder_type": reminder.get("reminder_type"),
        "scheduled_for": iso_date(reminder.get("scheduled_for")),
        "sent": bool(reminder.get("sent")),
        "sent_at": iso_datetime(reminder.get("sent_at")),
        "attempts": reminder.get("attempts", 0),
        "last_error": reminder.get("last_error"),
        "created_at": iso_datetime(reminder.get("created_at")),
    }


# ---------------------------------------------------------------------------
# The daily sweep
# ---------------------------------------------------------------------------
def due_reminders(vehicle, today, offsets_by_type):
    """Reminders that fall due *today* for one vehicle.

    ``days_remaining`` is matched exactly against the configured offsets, so
    an already expired document (negative days) never triggers another
    expiry-day email.
    """
    due = []
    for document_type in DOCUMENT_TYPES:
        expiry = (vehicle.get(document_type) or {}).get("expires_on")
        if not expiry:
            continue
        remaining = days_remaining(expiry, today)
        if remaining is None or remaining < 0:
            continue
        for offset in offsets_by_type.get(document_type, []):
            if remaining == offset:
                due.append(
                    {
                        "document_type": document_type,
                        "expiry_date": expiry,
                        "offset": offset,
                        "days_remaining": remaining,
                        "reminder_type": reminder_type_for_offset(offset),
                    }
                )
    return due


def run_daily_check(today=None):
    """Check every vehicle and send whatever is due.  Safe to run repeatedly."""
    today = today or today_local()
    app_settings = settings_services.get_settings()
    recipient = app_settings.get("reminder_email")
    offsets_by_type = app_settings.get("reminders") or {}

    summary = {
        "date": today.isoformat(),
        "vehicles_checked": 0,
        "due": 0,
        "sent": 0,
        "skipped_already_sent": 0,
        "failed": 0,
    }

    if not recipient:
        logger.error("No reminder recipient configured; skipping the daily check")
        summary["failed"] = 0
        summary["error"] = "REMINDER_EMAIL is not configured"
        return summary

    vehicles = vehicle_services.iter_vehicles_with_expiry()
    summary["vehicles_checked"] = len(vehicles)

    for vehicle in vehicles:
        vehicle_id = str(vehicle.get("_id"))
        for item in due_reminders(vehicle, today, offsets_by_type):
            summary["due"] += 1

            reminder = claim_reminder(
                vehicle_id,
                item["document_type"],
                item["expiry_date"],
                item["reminder_type"],
                item["offset"],
            )
            if reminder is None:
                summary["skipped_already_sent"] += 1
                logger.info(
                    "Reminder skipped (already sent): vehicle=%s document=%s type=%s",
                    vehicle.get("vehicle_no"),
                    item["document_type"],
                    item["reminder_type"],
                )
                continue

            try:
                message_id = send_reminder_email(
                    vehicle,
                    item["document_type"],
                    item["expiry_date"],
                    item["days_remaining"],
                    recipient,
                )
            except EmailError as exc:
                summary["failed"] += 1
                mark_attempt_failed(reminder, exc.message)
                logger.error(
                    "Reminder email failed: vehicle=%s document=%s type=%s (%s)",
                    vehicle.get("vehicle_no"),
                    item["document_type"],
                    item["reminder_type"],
                    exc.code,
                )
                continue
            except Exception as exc:  # pragma: no cover - unexpected
                summary["failed"] += 1
                mark_attempt_failed(reminder, "Unexpected error: %s" % type(exc).__name__)
                logger.exception("Unexpected error while sending a reminder email")
                continue

            mark_sent(reminder, message_id=message_id)
            summary["sent"] += 1
            logger.info(
                "Reminder sent: vehicle=%s document=%s type=%s days=%s",
                vehicle.get("vehicle_no"),
                item["document_type"],
                item["reminder_type"],
                item["days_remaining"],
            )

    logger.info(
        "Daily reminder check finished for %s: %s due, %s sent, %s skipped, %s failed",
        summary["date"],
        summary["due"],
        summary["sent"],
        summary["skipped_already_sent"],
        summary["failed"],
    )
    return summary
