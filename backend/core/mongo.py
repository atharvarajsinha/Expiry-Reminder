"""MongoDB access layer.

A single lazily created :class:`~pymongo.mongo_client.MongoClient` per process
(re-created after a fork so multi-worker gunicorn stays safe).  Collections are
exposed through tiny accessor functions instead of a repository class -- this
project is small enough that a service layer is plenty.
"""

from __future__ import annotations

import datetime as dt
import logging
import os

from django.conf import settings
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError

from core.errors import ApiError, ErrorCode

logger = logging.getLogger(__name__)

ITEMS = "items"
REMINDERS = "reminders"
SETTINGS = "settings"

_client = None
_client_pid = None
_indexes_ready = False

# Tests inject a mongomock database here; production never touches it.
_override_db = None


def set_override_db(database):
    """Point every accessor at ``database`` (used by the test suite)."""
    global _override_db, _indexes_ready
    _override_db = database
    _indexes_ready = False


def get_client():
    global _client, _client_pid
    pid = os.getpid()
    if _client is None or _client_pid != pid:
        _client = MongoClient(
            settings.MONGODB_URI,
            tz_aware=True,
            tzinfo=dt.timezone.utc,
            serverSelectionTimeoutMS=settings.MONGODB_TIMEOUT_MS,
            connectTimeoutMS=settings.MONGODB_TIMEOUT_MS,
            appname="expiry-reminder",
        )
        _client_pid = pid
    return _client


def get_db():
    if _override_db is not None:
        return _override_db
    return get_client()[settings.MONGODB_DATABASE]


def close_client():
    """Dispose of the cached client (used on shutdown and in tests)."""
    global _client, _client_pid
    if _client is not None:
        try:
            _client.close()
        except Exception:  # pragma: no cover - best effort
            pass
    _client = None
    _client_pid = None


def items_collection():
    return get_db()[ITEMS]


def reminders_collection():
    return get_db()[REMINDERS]


def settings_collection():
    return get_db()[SETTINGS]


def ensure_indexes(force=False):
    """Create the indexes the application relies on.

    The compound reminder index is what makes duplicate reminder emails
    impossible even when the sweep runs more than once in a day, or when two
    web workers reach it at the same moment.
    """
    global _indexes_ready
    if _indexes_ready and not force:
        return
    db = get_db()
    db[ITEMS].create_index([("category", ASCENDING)], name="item_category")
    db[ITEMS].create_index(
        [("category", ASCENDING), ("identifier_key", ASCENDING)],
        name="item_category_identifier",
    )
    db[ITEMS].create_index([("created_at", DESCENDING)], name="item_created_at")
    # Sorting the sweep's candidate set by soonest expiry keeps it cheap.
    db[ITEMS].create_index([("next_expiry_on", ASCENDING)], name="item_next_expiry")
    db[REMINDERS].create_index(
        [
            ("item_id", ASCENDING),
            ("expiry_key", ASCENDING),
            ("expiry_date", ASCENDING),
            ("reminder_type", ASCENDING),
        ],
        unique=True,
        name="uniq_reminder",
    )
    db[REMINDERS].create_index([("created_at", DESCENDING)], name="reminder_created_at")
    _indexes_ready = True
    logger.info("MongoDB indexes verified on database %s", db.name)


def ping():
    """Return ``True`` when the database answers, ``False`` otherwise."""
    try:
        database = get_db()
    except Exception as exc:  # pragma: no cover - bad configuration
        logger.error("MongoDB is not reachable: %s", exc.__class__.__name__)
        return False

    try:
        database.client.admin.command("ping")
        return True
    except PyMongoError as exc:
        logger.error("MongoDB ping failed: %s", exc.__class__.__name__)
        return False
    except Exception:
        # Some drivers/doubles do not implement the admin command; listing
        # collections is an equally good liveness probe.
        pass

    try:
        database.list_collection_names()
        return True
    except Exception as exc:
        logger.error("MongoDB ping failed: %s", exc.__class__.__name__)
        return False


def database_error(exc):
    """Convert a pymongo failure into a safe :class:`ApiError`."""
    logger.error("MongoDB operation failed: %s", exc.__class__.__name__)
    return ApiError(
        ErrorCode.DATABASE_UNAVAILABLE,
        "The database is currently unavailable. Please try again.",
        status_code=503,
    )
