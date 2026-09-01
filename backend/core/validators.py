"""Identifier normalisation and validation.

Two kinds of identifier get special treatment:

* **vehicle registration numbers**, which are normalised to the canonical
  ``UP25AK4922`` form so the same plate typed three different ways is the same
  item;
* **card identifiers**, where the rule is the security-relevant one -- a full
  card number is *rejected*, never silently truncated, so a user who pastes 16
  digits is told plainly that only the last four are stored.

Every other identifier is stored as typed (trimmed and length-capped).
"""

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

# Anything that is only digits and separators is treated as a card number.
_CARD_LIKE = re.compile(r"^[0-9][0-9 \-]*[0-9]$")

MAX_IDENTIFIER_LENGTH = 60


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
            "A registration number is required for a vehicle.",
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


def validate_card_last4(value):
    """Return the last four digits of a card, or raise.

    A submitted PAN is refused outright.  Truncating it here would mean the
    full number had already travelled through the request body and the logs on
    its way to being shortened, and it would teach the user that pasting the
    whole card is fine.  It is not.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    digits = re.sub(r"[^0-9]", "", text)
    if _CARD_LIKE.match(text) and len(digits) > 4:
        raise ApiError(
            ErrorCode.CARD_NUMBER_REJECTED,
            "Enter only the last 4 digits of the card. Full card numbers are "
            "never stored by this app.",
            status_code=400,
        )
    if not digits or len(digits) != len(text.replace(" ", "").replace("-", "")):
        raise ApiError(
            ErrorCode.CARD_NUMBER_REJECTED,
            "Enter the last 4 digits of the card, digits only.",
            status_code=400,
        )
    if len(digits) != 4:
        raise ApiError(
            ErrorCode.CARD_NUMBER_REJECTED,
            "Enter exactly 4 digits -- the last four printed on the card.",
            status_code=400,
        )
    return digits


def clean_identifier(value):
    """Trim and length-cap a free-form identifier.  Never raises."""
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    return text[:MAX_IDENTIFIER_LENGTH]


def mask_identifier(value):
    """Partially masked identifier for log lines (avoids full PII in logs)."""
    text = normalize_vehicle_number(value)
    if len(text) <= 4:
        return text or "unknown"
    hidden = max(0, len(text) - 6)
    return "%s%s%s" % (text[:4], "*" * hidden, text[-2:])
