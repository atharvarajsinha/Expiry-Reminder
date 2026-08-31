"""Translate the FireAPI ``rc_*`` payload into the application schema.

The ``rc_*`` naming stops here: nothing downstream (services, API responses,
emails) ever sees it.
"""

from __future__ import annotations

from core.dates import to_storage
from core.validators import normalize_vehicle_number

_EMPTY_VALUES = {"", "na", "n/a", "null", "none", "-", "nil", "not available"}


def clean_string(value):
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in _EMPTY_VALUES:
        return None
    return text


def clean_float(value):
    text = clean_string(value)
    if text is None:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def clean_int(value):
    number = clean_float(value)
    if number is None:
        return None
    try:
        return int(number)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return None


def normalize_vehicle_payload(data, fallback_vehicle_no=None):
    """Map one FireAPI ``data`` object onto the stored document shape.

    Dates become ``datetime`` values (midnight UTC) so MongoDB stores real
    dates instead of assorted strings.
    """
    data = data or {}

    vehicle_no = normalize_vehicle_number(
        clean_string(data.get("rc_regn_no"))
        or clean_string(data.get("rc_vehicle_no"))
        or fallback_vehicle_no
        or ""
    )

    return {
        "vehicle_no": vehicle_no,
        "registration_date": to_storage(data.get("rc_regn_dt")),
        "insurance": {
            "company": clean_string(data.get("rc_insurance_comp")),
            "policy_no": clean_string(data.get("rc_insurance_policy_no")),
            "expires_on": to_storage(data.get("rc_insurance_upto")),
        },
        "vehicle_category": clean_string(data.get("rc_vch_catg")),
        "vehicle_class": clean_string(data.get("rc_vh_class_desc")),
        "chassis_no": clean_string(data.get("rc_chasi_no")),
        "engine_no": clean_string(data.get("rc_eng_no")),
        "cubic_capacity": clean_float(data.get("rc_cubic_cap")),
        "maker": clean_string(data.get("rc_maker_desc")),
        "model": clean_string(data.get("rc_maker_model")),
        "owner_name": clean_string(data.get("rc_owner_name")),
        "father_name": clean_string(data.get("rc_father_name")),
        "fuel": clean_string(data.get("rc_fuel_desc")),
        "wheelbase": clean_float(data.get("rc_wheelbase")),
        "seat_capacity": clean_int(data.get("rc_seat_cap")),
        "pucc": {
            "certificate_no": clean_string(data.get("rc_pucc_no")),
            "expires_on": to_storage(data.get("rc_pucc_upto")),
        },
        "registered_at": clean_string(data.get("rc_registered_at")),
        "fitness_upto": to_storage(data.get("rc_fit_upto")),
        "tax_upto": to_storage(data.get("rc_tax_upto")),
    }


def merge_for_refresh(existing, incoming):
    """Build the ``$set`` document for a refresh.

    A refresh must never blank out data we already hold, so only non-empty
    incoming values are applied -- nested ``insurance`` / ``pucc`` blocks are
    merged field by field.
    """
    existing = existing or {}
    update = {}

    for key, value in incoming.items():
        if key in ("insurance", "pucc"):
            continue
        if value is None:
            continue
        update[key] = value

    for block in ("insurance", "pucc"):
        if block not in incoming:
            continue
        current = dict(existing.get(block) or {})
        merged = dict(current)
        for key, value in (incoming.get(block) or {}).items():
            if value is not None:
                merged[key] = value
            else:
                merged.setdefault(key, current.get(key))
        update[block] = merged

    return update
