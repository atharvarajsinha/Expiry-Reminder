"""Date parsing, storage conversion and expiry logic.

All expiry maths is done on plain ``datetime.date`` objects in the configured
project timezone (``TIME_ZONE``, default ``Asia/Kolkata``) so a reminder that
should fire "7 days before" fires on the right calendar day regardless of the
server timezone.
"""

from __future__ import annotations

import datetime as dt

from django.conf import settings

try:  # Python 3.9+
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - not reachable on 3.9+
    ZoneInfo = None

UTC = dt.timezone.utc

# Everything a person might reasonably type, plus the ISO form the UI sends.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d-%b-%Y",
    "%d-%B-%Y",
    "%Y/%m/%d",
    "%d.%m.%Y",
)

STATUS_VALID = "valid"
STATUS_EXPIRING_SOON = "expiring_soon"
STATUS_EXPIRES_TODAY = "expires_today"
STATUS_EXPIRED = "expired"
STATUS_UNKNOWN = "unknown"

STATUS_LABELS = {
    STATUS_VALID: "Valid",
    STATUS_EXPIRING_SOON: "Expiring Soon",
    STATUS_EXPIRES_TODAY: "Expires Today",
    STATUS_EXPIRED: "Expired",
    STATUS_UNKNOWN: "Unknown",
}

# Worst status wins when summarising an item.
_STATUS_SEVERITY = {
    STATUS_UNKNOWN: 0,
    STATUS_VALID: 1,
    STATUS_EXPIRING_SOON: 2,
    STATUS_EXPIRES_TODAY: 3,
    STATUS_EXPIRED: 4,
}


def project_timezone():
    if ZoneInfo is None:  # pragma: no cover
        return UTC
    try:
        return ZoneInfo(settings.TIME_ZONE)
    except Exception:  # pragma: no cover - misconfigured TIME_ZONE
        return UTC


def now_utc():
    return dt.datetime.now(tz=UTC)


def today_local():
    """Today's date in the project timezone."""
    return dt.datetime.now(tz=project_timezone()).date()


def parse_date(value):
    """Parse the many shapes a date can arrive in.  ``None`` when unusable."""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value

    text = str(value).strip()
    if not text or text.lower() in {"na", "n/a", "null", "none", "-"}:
        return None

    # Trim an ISO timestamp down to its date part.
    if "T" in text:
        text = text.split("T", 1)[0]

    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def to_storage(value):
    """Store a date as a BSON datetime pinned to midnight UTC."""
    parsed = parse_date(value)
    if parsed is None:
        return None
    return dt.datetime(parsed.year, parsed.month, parsed.day, tzinfo=UTC)


def from_storage(value):
    """Read a stored BSON datetime (or string) back as a ``date``."""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    return parse_date(value)


def iso_date(value):
    """ISO ``YYYY-MM-DD`` string for API output (``None`` stays ``None``)."""
    parsed = from_storage(value)
    return parsed.isoformat() if parsed else None


def iso_datetime(value):
    """ISO 8601 timestamp for API output."""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return str(value)


def display_date(value):
    """Human friendly date used in reminder emails, e.g. ``12 August 2027``."""
    parsed = from_storage(value)
    if parsed is None:
        return "Not available"
    return "%d %s %d" % (parsed.day, parsed.strftime("%B"), parsed.year)


def days_remaining(expiry, today=None):
    """Whole days between today and ``expiry`` (negative once expired)."""
    parsed = from_storage(expiry)
    if parsed is None:
        return None
    reference = today or today_local()
    return (parsed - reference).days


def expiring_soon_days():
    return getattr(settings, "EXPIRING_SOON_DAYS", 30)


def expiry_status(expiry, today=None):
    """Status block for one expiry date.

    Returns ``status``, a human label, the number of days remaining and the
    ISO expiry date -- everything the UI needs to render a badge.
    """
    parsed = from_storage(expiry)
    if parsed is None:
        return {
            "status": STATUS_UNKNOWN,
            "label": STATUS_LABELS[STATUS_UNKNOWN],
            "days_remaining": None,
            "expires_on": None,
        }

    remaining = days_remaining(parsed, today=today)
    if remaining < 0:
        status = STATUS_EXPIRED
    elif remaining == 0:
        status = STATUS_EXPIRES_TODAY
    elif remaining <= expiring_soon_days():
        status = STATUS_EXPIRING_SOON
    else:
        status = STATUS_VALID

    return {
        "status": status,
        "label": STATUS_LABELS[status],
        "days_remaining": remaining,
        "expires_on": parsed.isoformat(),
    }


def worst_status(statuses):
    """Overall item status: the most urgent of the given statuses."""
    known = [s for s in statuses if s]
    if not known:
        return STATUS_UNKNOWN
    return max(known, key=lambda status: _STATUS_SEVERITY.get(status, 0))


def reminder_type_for_offset(offset):
    """Map a day offset to the stored reminder type."""
    if offset == 0:
        return "expiry_day"
    if offset == 1:
        return "1_day"
    return "%d_days" % offset


def scheduled_for(expiry, offset):
    """The calendar date on which the reminder for ``offset`` should be sent."""
    parsed = from_storage(expiry)
    if parsed is None:
        return None
    return parsed - dt.timedelta(days=offset)
