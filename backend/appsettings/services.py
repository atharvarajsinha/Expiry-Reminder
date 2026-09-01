"""Reminder settings: the recipient address and the day offsets per category.

Offsets are stored per category with a ``default`` entry as the fallback, so a
new category added to ``items.categories`` works immediately without a
migration or a settings edit.  Defaults come from the environment; anything
saved through the API lives in a single MongoDB document.

No secret (Brevo key, JWT secret, cron token) is stored or returned here.
"""

from __future__ import annotations

import logging

from django.conf import settings as django_settings
from pymongo.errors import PyMongoError

from core import mongo
from core.dates import iso_datetime, now_utc
from items.categories import CATEGORY_KEYS, DEFAULT_OFFSET_KEY

logger = logging.getLogger(__name__)

SETTINGS_ID = "app_settings"

# Every key an offsets map may carry.
OFFSET_KEYS = (DEFAULT_OFFSET_KEY,) + CATEGORY_KEYS

MAX_OFFSETS_PER_CATEGORY = 10
MAX_OFFSET_DAYS = 365


def default_settings():
    """Environment defaults: one shared list, per-category overrides on top."""
    base = list(django_settings.DEFAULT_REMINDER_OFFSETS)
    reminders = {DEFAULT_OFFSET_KEY: base}
    for key in CATEGORY_KEYS:
        override = django_settings.REMINDER_OFFSET_OVERRIDES.get(key)
        reminders[key] = list(override) if override else list(base)
    return {"reminder_email": django_settings.REMINDER_EMAIL, "reminders": reminders}


def clean_offsets(values):
    """De-duplicate, clamp and sort one list of day offsets (descending)."""
    cleaned = set()
    for value in values or []:
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= number <= MAX_OFFSET_DAYS:
            cleaned.add(number)
    return sorted(cleaned, reverse=True)[:MAX_OFFSETS_PER_CATEGORY]


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
    for key in OFFSET_KEYS:
        offsets = (stored.get("reminders") or {}).get(key)
        # An empty list is a real choice -- "never email me about cards" -- so
        # only a missing key falls back to the default.
        if isinstance(offsets, list):
            reminders[key] = clean_offsets(offsets)

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
        reminders = dict(get_settings()["reminders"])
        for key, offsets in (payload["reminders"] or {}).items():
            if key in OFFSET_KEYS:
                reminders[key] = clean_offsets(offsets)
        changes["reminders"] = reminders

    try:
        mongo.settings_collection().update_one(
            {"_id": SETTINGS_ID}, {"$set": changes}, upsert=True
        )
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info("Reminder settings updated")
    return get_settings()


def reminder_offsets(category):
    reminders = get_settings()["reminders"]
    if category in reminders:
        return reminders[category]
    return reminders.get(DEFAULT_OFFSET_KEY, [])


def reminder_recipient():
    return get_settings().get("reminder_email")
