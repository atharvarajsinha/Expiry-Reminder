"""Reminder engine.

There is no worker and no in-process scheduler.  Reminders exist in two forms:

**Derived.**  "What is due, and what is coming" is computed from the items and
the configured offsets every time it is asked for (:func:`due_reminders`,
:func:`upcoming_reminders`).  Nothing is stored to make the dashboard work, so
the answer is never stale and there is nothing to keep in sync.

**Recorded.**  A row is written only when an email is actually claimed for
sending.  The claim goes through a unique compound index
(``item_id + expiry_key + expiry_date + reminder_type``) *before* the message
leaves, so :func:`run_sweep` is safe to run twice, from two web workers, or
from a cron ping and a button press at the same moment -- the second one finds
the row taken and sends nothing.

:func:`run_sweep` is triggered from outside: something hits
``/api/reminders/run/``.  Nothing in this process runs it on a timer.

That trigger is usually an uptime monitor rather than a real cron daemon,
because free schedulers are scarce and free uptime monitors are not.  A monitor
pings on an *interval* -- UptimeRobot's floor is five minutes -- so the "once a
day, at nine in the morning" part cannot live in the caller.  It lives in
:func:`run_scheduled_sweep`, which is cheap to call as often as you like and
does real work at most once per calendar day.
"""

from __future__ import annotations

import datetime as dt
import logging

from django.conf import settings as django_settings
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

from appsettings import services as settings_services
from core import mongo
from core.dates import (
    days_remaining,
    iso_date,
    iso_datetime,
    now_utc,
    project_timezone,
    reminder_type_for_offset,
    scheduled_for,
    to_storage,
    today_local,
)
from items import categories
from items import services as item_services
from reminders.email_service import EmailError, send_reminder_email

logger = logging.getLogger(__name__)

# The sweep's own bookkeeping lives beside the user settings.
SWEEP_STATE_ID = "sweep_state"


# ---------------------------------------------------------------------------
# Reminder records
# ---------------------------------------------------------------------------
def _key(item_id, expiry_key, expiry_date, reminder_type):
    return {
        "item_id": str(item_id),
        "expiry_key": expiry_key,
        "expiry_date": to_storage(expiry_date),
        "reminder_type": reminder_type,
    }


def claim_reminder(item_id, expiry_key, expiry_date, reminder_type, offset):
    """Reserve the right to send this exact reminder.

    Returns the reminder document to send, or ``None`` when it has already
    gone out -- the duplicate-prevention rule.  A row that exists but was never
    successfully sent is handed back so the next sweep retries it.
    """
    mongo.ensure_indexes()
    key = _key(item_id, expiry_key, expiry_date, reminder_type)
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
        # Another request claimed it a moment ago.
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
                reminder["item_id"],
                reminder["expiry_key"],
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
                reminder["item_id"],
                reminder["expiry_key"],
                reminder["expiry_date"],
                reminder["reminder_type"],
            ),
            {"$set": {"last_error": message}, "$inc": {"attempts": 1}},
        )
    except PyMongoError as exc:  # pragma: no cover - defensive
        raise mongo.database_error(exc)


def list_reminders(limit=50, item_id=None):
    query = {}
    if item_id:
        query["item_id"] = str(item_id)
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


def serialize(reminder, items_by_id=None):
    """One sent/attempted reminder, enriched with its item's name when known."""
    item = (items_by_id or {}).get(reminder.get("item_id"))
    return {
        "item_id": reminder.get("item_id"),
        "item_name": item.get("name") if item else None,
        "category": item.get("category") if item else None,
        "expiry_key": reminder.get("expiry_key"),
        "expiry_label": categories.expiry_label(
            item.get("category") if item else None, reminder.get("expiry_key")
        ),
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
# Derived: what is due today, and what is still coming
# ---------------------------------------------------------------------------
def offsets_for(item, offsets_by_category):
    """The day offsets configured for an item's category."""
    category = item.get("category")
    if category in offsets_by_category:
        return offsets_by_category[category]
    return offsets_by_category.get(categories.DEFAULT_OFFSET_KEY, [])


def due_reminders(item, today, offsets_by_category):
    """Reminders that fall due *today* for one item.

    ``days_remaining`` is matched exactly against the configured offsets, so an
    already expired date (negative days) never triggers another email -- the
    dashboard keeps showing it as expired, but the inbox is left alone.
    """
    due = []
    offsets = offsets_for(item, offsets_by_category)
    if not offsets:
        return due

    for entry in item.get("expiries") or []:
        expiry = entry.get("expires_on")
        if not expiry:
            continue
        remaining = days_remaining(expiry, today)
        if remaining is None or remaining < 0:
            continue
        for offset in offsets:
            if remaining == offset:
                due.append(
                    {
                        "expiry_key": entry.get("key"),
                        "expiry_label": categories.expiry_label(
                            item.get("category"), entry.get("key"), entry.get("label")
                        ),
                        "expiry_date": expiry,
                        "reference": entry.get("reference"),
                        "offset": offset,
                        "days_remaining": remaining,
                        "reminder_type": reminder_type_for_offset(offset),
                    }
                )
    return due


def upcoming_reminders(today=None, limit=100):
    """Every reminder still to come, soonest send date first.

    Derived on the fly from the same two inputs the sweep uses -- each item's
    expiry dates and the configured offsets -- so the schedule the user sees is
    exactly the one that will fire.
    """
    today = today or today_local()
    offsets_by_category = settings_services.get_settings()["reminders"]

    upcoming = []
    for item in item_services.iter_items_with_expiry():
        item_id = str(item.get("_id"))
        offsets = offsets_for(item, offsets_by_category)
        if not offsets:
            continue

        for entry in item.get("expiries") or []:
            remaining = days_remaining(entry.get("expires_on"), today)
            if remaining is None or remaining < 0:
                continue

            for offset in offsets:
                # That send date is in the past; only today and later count.
                if offset > remaining:
                    continue
                send_on = scheduled_for(entry.get("expires_on"), offset)
                upcoming.append(
                    {
                        "key": "%s-%s-%s" % (item_id, entry.get("key"), offset),
                        "item_id": item_id,
                        "item_name": item.get("name"),
                        "category": item.get("category"),
                        "category_label": categories.category_label(
                            item.get("category")
                        ),
                        "identifier": item.get("identifier"),
                        "expiry_key": entry.get("key"),
                        "expiry_label": categories.expiry_label(
                            item.get("category"), entry.get("key"), entry.get("label")
                        ),
                        "expires_on": iso_date(entry.get("expires_on")),
                        "offset": offset,
                        "reminder_type": reminder_type_for_offset(offset),
                        "send_on": iso_date(send_on),
                        "days_until_send": remaining - offset,
                    }
                )

    upcoming.sort(key=lambda entry: (entry["send_on"], entry["item_name"] or ""))
    return upcoming[:limit]


# ---------------------------------------------------------------------------
# The sweep
# ---------------------------------------------------------------------------
# At most this many distinct reasons travel back in a summary. One bad
# credential produces the same message for every item, and a caller only needs
# to see it once.
MAX_REPORTED_FAILURES = 3


def _record_failure(summary, message):
    failures = summary["failures"]
    if message not in failures and len(failures) < MAX_REPORTED_FAILURES:
        failures.append(message)


def run_sweep(today=None):
    """Check every item and send whatever is due.  Safe to run repeatedly."""
    today = today or today_local()
    app_settings = settings_services.get_settings()
    recipient = app_settings.get("reminder_email")
    offsets_by_category = app_settings.get("reminders") or {}

    summary = {
        "date": today.isoformat(),
        "items_checked": 0,
        "due": 0,
        "sent": 0,
        "skipped_already_sent": 0,
        "failed": 0,
        # Distinct reasons, so "3 failed" can say *why* instead of leaving the
        # user to guess. These messages are written by `email_service` and are
        # deliberately safe to show: a status code, never a response body and
        # never the API key.
        "failures": [],
    }

    if not recipient:
        logger.error("No reminder recipient configured; skipping the sweep")
        summary["error"] = "No reminder email is configured"
        return summary

    items = item_services.iter_items_with_expiry()
    summary["items_checked"] = len(items)

    for item in items:
        item_id = str(item.get("_id"))
        for entry in due_reminders(item, today, offsets_by_category):
            summary["due"] += 1

            reminder = claim_reminder(
                item_id,
                entry["expiry_key"],
                entry["expiry_date"],
                entry["reminder_type"],
                entry["offset"],
            )
            if reminder is None:
                summary["skipped_already_sent"] += 1
                logger.info(
                    "Reminder skipped (already sent): item=%s expiry=%s type=%s",
                    item_id,
                    entry["expiry_key"],
                    entry["reminder_type"],
                )
                continue

            try:
                message_id = send_reminder_email(item, entry, recipient)
            except EmailError as exc:
                summary["failed"] += 1
                _record_failure(summary, exc.message)
                mark_attempt_failed(reminder, exc.message)
                logger.error(
                    "Reminder email failed: item=%s expiry=%s type=%s (%s)",
                    item_id,
                    entry["expiry_key"],
                    entry["reminder_type"],
                    exc.code,
                )
                continue
            except Exception as exc:  # pragma: no cover - unexpected
                summary["failed"] += 1
                message = "Unexpected error: %s" % type(exc).__name__
                _record_failure(summary, message)
                mark_attempt_failed(reminder, message)
                logger.exception("Unexpected error while sending a reminder email")
                continue

            mark_sent(reminder, message_id=message_id)
            summary["sent"] += 1
            logger.info(
                "Reminder sent: item=%s expiry=%s type=%s days=%s",
                item_id,
                entry["expiry_key"],
                entry["reminder_type"],
                entry["days_remaining"],
            )

    logger.info(
        "Reminder sweep finished for %s: %s due, %s sent, %s skipped, %s failed",
        summary["date"],
        summary["due"],
        summary["sent"],
        summary["skipped_already_sent"],
        summary["failed"],
    )
    return summary


def sweep_state():
    """When the sweep last ran, for the settings screen and the health check."""
    try:
        stored = mongo.settings_collection().find_one({"_id": SWEEP_STATE_ID})
    except PyMongoError as exc:
        raise mongo.database_error(exc)
    if not stored:
        return {"last_run_date": None, "last_run_at": None}
    return {
        "last_run_date": iso_date(stored.get("last_run_date")),
        "last_run_at": iso_datetime(stored.get("last_run_at")),
    }


# ---------------------------------------------------------------------------
# The scheduling gate
# ---------------------------------------------------------------------------
def reminder_hour():
    return getattr(django_settings, "REMINDER_HOUR", 9)


def local_now():
    """Now, in the project timezone.

    A named seam rather than an inline call so tests can pin the clock: the
    scheduling gate is entirely about what hour it is, and a test that depends
    on when the suite happens to run is a test that fails once a day.
    """
    return dt.datetime.now(tz=project_timezone())


def claim_today(today):
    """Atomically win the right to run today's sweep.

    ``find_one_and_update`` with ``last_run_date`` in the filter means exactly
    one caller can move the marker forward per calendar day.  Every other ping
    that day matches nothing and does no work, which is what makes a monitor
    hitting this every five minutes harmless.

    Losing the race is the normal case, not an error.
    """
    stamp = to_storage(today)
    try:
        result = mongo.settings_collection().find_one_and_update(
            {"_id": SWEEP_STATE_ID, "last_run_date": {"$ne": stamp}},
            {"$set": {"last_run_date": stamp, "last_run_at": now_utc()}},
            upsert=True,
        )
    except DuplicateKeyError:
        # Two pings raced on the upsert; the other one won.
        return False
    except PyMongoError as exc:
        raise mongo.database_error(exc)
    # `result` is the pre-update document: None means we created the marker.
    return True if result is None else result.get("last_run_date") != stamp


def run_scheduled_sweep(now=None):
    """The externally triggered daily check.

    Answers one of three ways, and never raises for an ordinary "nothing to do
    yet" -- the caller is usually an uptime monitor that treats any non-2xx as
    the site being down:

    * ``ran``           -- the sweep happened, with its summary;
    * ``before_window`` -- it is earlier than ``REMINDER_HOUR`` today;
    * ``already_ran``   -- today's sweep is already done.
    """
    now = now or local_now()
    today = now.date()
    hour = reminder_hour()

    if now.hour < hour:
        return {
            "ran": False,
            "reason": "before_window",
            "date": today.isoformat(),
            "runs_at_hour": hour,
        }

    if not claim_today(today):
        return {
            "ran": False,
            "reason": "already_ran",
            "date": today.isoformat(),
            "runs_at_hour": hour,
        }

    logger.info("Running the daily reminder check for %s", today.isoformat())
    summary = run_sweep(today=today)

    # `claim_today` already stamped the marker so no concurrent ping could
    # start a second sweep; move `last_run_at` to the finish time now that we
    # know how long it took. Best effort -- the mail is already sent, and
    # failing here must not turn a successful run into an error.
    try:
        mongo.settings_collection().update_one(
            {"_id": SWEEP_STATE_ID}, {"$set": {"last_run_at": now_utc()}}
        )
    except PyMongoError as exc:  # pragma: no cover - defensive
        logger.error("Could not stamp the sweep finish: %s", exc.__class__.__name__)

    return {"ran": True, "reason": "ran", "runs_at_hour": hour, **summary}
