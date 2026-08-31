"""Reminder settings: recipient address and per-document day offsets.

Defaults come from the environment; anything saved through the API is stored
in a single MongoDB document.  No secret (Brevo key, FireAPI key, JWT secret)
is ever stored or returned here.
"""

from __future__ import annotations

import logging

from django.conf import settings as django_settings
from pymongo.errors import PyMongoError

from core import mongo
from core.dates import iso_datetime, now_utc

logger = logging.getLogger(__name__)

SETTINGS_ID = "app_settings"
DOCUMENT_TYPES = ("insurance", "pucc")


def default_settings():
    return {
        "reminder_email": django_settings.REMINDER_EMAIL,
        "reminders": {
            "insurance": list(django_settings.DEFAULT_REMINDER_OFFSETS["insurance"]),
            "pucc": list(django_settings.DEFAULT_REMINDER_OFFSETS["pucc"]),
        },
    }


def get_settings():
    """Stored settings merged over the environment defaults."""
    defaults = default_settings()
    try:
        stored = mongo.settings_collection().find_one({"_id": SETTINGS_ID})
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    if not stored:
        return {**defaults, "updated_at": None}

    reminders = dict(defaults["reminders"])
    for document_type in DOCUMENT_TYPES:
        offsets = (stored.get("reminders") or {}).get(document_type)
        if isinstance(offsets, list) and offsets:
            reminders[document_type] = [int(value) for value in offsets]

    return {
        "reminder_email": stored.get("reminder_email") or defaults["reminder_email"],
        "reminders": reminders,
        "updated_at": iso_datetime(stored.get("updated_at")),
    }


def update_settings(payload):
    """Persist validated settings and return the merged result."""
    changes = {"updated_at": now_utc()}

    if "reminder_email" in payload:
        changes["reminder_email"] = payload["reminder_email"]

    if "reminders" in payload:
        current = get_settings()["reminders"]
        reminders = dict(current)
        for document_type, offsets in (payload["reminders"] or {}).items():
            if document_type in DOCUMENT_TYPES:
                reminders[document_type] = sorted(
                    {int(value) for value in offsets}, reverse=True
                )
        changes["reminders"] = reminders

    try:
        mongo.settings_collection().update_one(
            {"_id": SETTINGS_ID}, {"$set": changes}, upsert=True
        )
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info("Reminder settings updated")
    return get_settings()


def reminder_offsets(document_type):
    return get_settings()["reminders"].get(document_type, [])


def reminder_recipient():
    return get_settings().get("reminder_email")
