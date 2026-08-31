"""Vehicle registration number normalisation and validation."""

from __future__ import annotations

import re

from core.errors import ApiError, ErrorCode

# ``up25 ak 4922`` / ``UP-25-AK-4922`` -> ``UP25AK4922``
_NON_ALNUM = re.compile(r"[^A-Za-z0-9]")

# Classic series: state code + RTO code + optional letters + running number.
_STANDARD = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$")
# Bharat (BH) series: 22BH1234AB
_BH_SERIES = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")
# Older / defence style plates such as 12A123456 or 09AB1234A.
_DEFENCE = re.compile(r"^[0-9]{2}[A-Z]{1,2}[0-9]{4,6}[A-Z]?$")


def normalize_vehicle_number(value):
    """Upper-case and strip every separator.  Never raises."""
    if value is None:
        return ""
    return _NON_ALNUM.sub("", str(value)).upper()


def is_valid_vehicle_number(value):
    normalized = normalize_vehicle_number(value)
    if not 5 <= len(normalized) <= 12:
        return False
    return bool(
        _STANDARD.match(normalized)
        or _BH_SERIES.match(normalized)
        or _DEFENCE.match(normalized)
    )


def validate_vehicle_number(value):
    """Return the normalised number or raise :class:`ApiError`."""
    normalized = normalize_vehicle_number(value)
    if not normalized:
        raise ApiError(
            ErrorCode.INVALID_VEHICLE_NUMBER,
            "A vehicle number is required.",
            status_code=400,
        )
    if not is_valid_vehicle_number(normalized):
        raise ApiError(
            ErrorCode.INVALID_VEHICLE_NUMBER,
            "'%s' does not look like a valid Indian registration number."
            % normalized,
            status_code=400,
        )
    return normalized


def mask_vehicle_number(value):
    """Partially masked number for log lines (avoids full PII in logs)."""
    normalized = normalize_vehicle_number(value)
    if len(normalized) <= 4:
        return normalized or "unknown"
    hidden = max(0, len(normalized) - 6)
    return "%s%s%s" % (normalized[:4], "*" * hidden, normalized[-2:])
