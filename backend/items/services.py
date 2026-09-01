"""Item persistence, validation and API serialisation.

One collection holds everything the user tracks.  A stored item looks like::

    {
      "category": "vehicle",
      "name": "Honda CB Twister",
      "identifier": "UP25AK4922",
      "identifier_key": "up25ak4922",     # lower-cased, for duplicate checks
      "issuer": "National Insurance",
      "holder": "Rohit",
      "notes": null,
      "expiries": [
        {"key": "insurance", "label": "Insurance",
         "expires_on": <datetime>, "reference": "2602...", "issued_on": null}
      ],
      "next_expiry_on": <datetime>,       # denormalised: the soonest of the above
      "created_at": ..., "updated_at": ...
    }

``next_expiry_on`` is written on every save so the reminder sweep and the "what
is expiring" queries can be answered by an index rather than by loading every
item and sorting in Python.
"""

from __future__ import annotations

import logging

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

from core import mongo
from core.dates import (
    expiry_status,
    iso_date,
    iso_datetime,
    now_utc,
    to_storage,
    worst_status,
)
from core.errors import ApiError, ErrorCode
from core.validators import (
    clean_identifier,
    mask_identifier,
    validate_card_last4,
    validate_vehicle_number,
)
from items import categories

logger = logging.getLogger(__name__)

MAX_EXPIRIES_PER_ITEM = 12


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def normalize_identifier(category_key, raw):
    """Category-aware identifier handling.

    Vehicles are normalised to canonical plate form, cards are reduced to (and
    validated as) four digits, everything else is trimmed.
    """
    if categories.is_card(category_key):
        return validate_card_last4(raw)

    if category_key == "vehicle":
        definition = categories.get_category(category_key)
        if raw is None or not str(raw).strip():
            if definition["identifier_required"]:
                raise ApiError(
                    ErrorCode.INVALID_VEHICLE_NUMBER,
                    "A registration number is required for a vehicle.",
                    status_code=400,
                )
            return None
        return validate_vehicle_number(raw)

    return clean_identifier(raw)


def identifier_key(value):
    """The comparison form used to spot duplicates.  ``None`` stays ``None``."""
    if value is None:
        return None
    collapsed = "".join(str(value).split()).lower()
    return collapsed or None


def normalize_expiries(category_key, raw_expiries):
    """Validate the expiry list and convert it to its stored shape.

    Raises when the list is empty, oversized, has a malformed key, a duplicate
    key or an unparseable date -- an item with no usable date could never
    produce a reminder, which is the entire point of storing it.
    """
    if not isinstance(raw_expiries, (list, tuple)) or not raw_expiries:
        raise ApiError(
            ErrorCode.INVALID_EXPIRY,
            "Add at least one expiry date.",
            status_code=400,
        )
    if len(raw_expiries) > MAX_EXPIRIES_PER_ITEM:
        raise ApiError(
            ErrorCode.INVALID_EXPIRY,
            "An item can track at most %d expiry dates." % MAX_EXPIRIES_PER_ITEM,
            status_code=400,
        )

    seen = set()
    cleaned = []

    for entry in raw_expiries:
        if not isinstance(entry, dict):
            raise ApiError(
                ErrorCode.INVALID_EXPIRY,
                "Each expiry must be an object with a key and a date.",
                status_code=400,
            )

        key = str(entry.get("key") or "").strip().lower()
        if not categories.EXPIRY_KEY_RE.match(key):
            raise ApiError(
                ErrorCode.INVALID_EXPIRY,
                "'%s' is not a valid expiry key. Use lowercase letters, "
                "digits and underscores." % (entry.get("key") or ""),
                status_code=400,
            )
        if key in seen:
            raise ApiError(
                ErrorCode.INVALID_EXPIRY,
                "The expiry '%s' is listed twice." % key,
                status_code=400,
            )
        seen.add(key)

        expires_on = to_storage(entry.get("expires_on"))
        if expires_on is None:
            raise ApiError(
                ErrorCode.INVALID_EXPIRY,
                "'%s' needs a valid expiry date."
                % categories.expiry_label(category_key, key, entry.get("label")),
                status_code=400,
            )

        label = str(entry.get("label") or "").strip()[:60] or None
        reference = clean_identifier(entry.get("reference"))

        cleaned.append(
            {
                "key": key,
                "label": categories.expiry_label(category_key, key, label),
                "expires_on": expires_on,
                "issued_on": to_storage(entry.get("issued_on")),
                "reference": reference,
            }
        )

    cleaned.sort(key=lambda item: item["expires_on"])
    return cleaned


def build_document(payload):
    """Turn a validated request body into the stored item shape."""
    category_key = str(payload.get("category") or "").strip()
    categories.get_category(category_key)

    name = " ".join(str(payload.get("name") or "").split())[:120]
    if not name:
        raise ApiError(
            ErrorCode.VALIDATION_ERROR, "Give this item a name.", status_code=400
        )

    identifier = normalize_identifier(category_key, payload.get("identifier"))
    expiries = normalize_expiries(category_key, payload.get("expiries"))

    return {
        "category": category_key,
        "name": name,
        "identifier": identifier,
        "identifier_key": identifier_key(identifier),
        "issuer": clean_identifier(payload.get("issuer")),
        "holder": clean_identifier(payload.get("holder")),
        "notes": (str(payload.get("notes")).strip()[:1000] or None)
        if payload.get("notes")
        else None,
        "expiries": expiries,
        "next_expiry_on": expiries[0]["expires_on"],
    }


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
def to_object_id(item_id):
    try:
        return ObjectId(str(item_id))
    except (InvalidId, TypeError):
        raise ApiError(ErrorCode.ITEM_NOT_FOUND, "Item not found.", status_code=404)


def get_by_id(item_id, required=True):
    object_id = to_object_id(item_id)
    try:
        document = mongo.items_collection().find_one({"_id": object_id})
    except PyMongoError as exc:
        raise mongo.database_error(exc)
    if document is None and required:
        raise ApiError(ErrorCode.ITEM_NOT_FOUND, "Item not found.", status_code=404)
    return document


def find_duplicate(category_key, key, exclude_id=None):
    """An existing item of the same category with the same identifier."""
    if not key:
        return None
    query = {"category": category_key, "identifier_key": key}
    if exclude_id is not None:
        query["_id"] = {"$ne": ObjectId(str(exclude_id))}
    try:
        return mongo.items_collection().find_one(query)
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def list_items(category=None):
    """Every item, soonest expiry first, undated items last."""
    query = {}
    if category:
        categories.get_category(category)
        query["category"] = category
    try:
        cursor = (
            mongo.items_collection()
            .find(query)
            .sort([("next_expiry_on", ASCENDING), ("created_at", DESCENDING)])
        )
        return list(cursor)
    except PyMongoError as exc:
        raise mongo.database_error(exc)


def iter_items_with_expiry():
    """Every item that has at least one expiry date (the reminder sweep)."""
    try:
        return list(mongo.items_collection().find({"next_expiry_on": {"$ne": None}}))
    except PyMongoError as exc:
        raise mongo.database_error(exc)


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------
def _reject_duplicate(document, existing):
    definition = categories.get_category(document["category"])
    raise ApiError(
        ErrorCode.ITEM_ALREADY_EXISTS,
        "%s '%s' is already saved as \"%s\"."
        % (
            definition["identifier_label"],
            document["identifier"],
            existing.get("name"),
        ),
        status_code=409,
        details={"item_id": str(existing["_id"])},
    )


def create_item(payload):
    """Validate and insert one item.  Returns the stored document."""
    mongo.ensure_indexes()
    document = build_document(payload)

    existing = find_duplicate(document["category"], document["identifier_key"])
    if existing is not None:
        _reject_duplicate(document, existing)

    timestamp = now_utc()
    document.update({"created_at": timestamp, "updated_at": timestamp})

    try:
        result = mongo.items_collection().insert_one(document)
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    document["_id"] = result.inserted_id
    logger.info(
        "Created %s item %s (id=%s)",
        document["category"],
        mask_identifier(document.get("identifier")),
        result.inserted_id,
    )
    return document


def update_item(item_id, payload):
    """Replace the editable fields of an item.  Returns the stored document."""
    existing = get_by_id(item_id)
    # The category is part of an item's identity: changing it would change
    # which labels, identifier rules and reminder offsets apply, so a payload
    # that omits it keeps the stored one.
    merged = dict(payload)
    merged.setdefault("category", existing.get("category"))

    document = build_document(merged)

    clash = find_duplicate(
        document["category"], document["identifier_key"], exclude_id=existing["_id"]
    )
    if clash is not None:
        _reject_duplicate(document, clash)

    document["updated_at"] = now_utc()

    try:
        mongo.items_collection().update_one(
            {"_id": existing["_id"]}, {"$set": document}
        )
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info("Updated item id=%s", item_id)
    document["_id"] = existing["_id"]
    document["created_at"] = existing.get("created_at")
    return document


def delete_item(item_id):
    """Delete an item and every reminder record that belongs to it."""
    object_id = to_object_id(item_id)
    try:
        result = mongo.items_collection().delete_one({"_id": object_id})
        if result.deleted_count == 0:
            raise ApiError(ErrorCode.ITEM_NOT_FOUND, "Item not found.", status_code=404)
        removed = mongo.reminders_collection().delete_many(
            {"item_id": str(object_id)}
        )
    except PyMongoError as exc:
        raise mongo.database_error(exc)

    logger.info(
        "Deleted item id=%s along with %s reminder record(s)",
        item_id,
        removed.deleted_count,
    )
    return True


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def serialize_expiry(item, entry, today=None):
    status = expiry_status(entry.get("expires_on"), today)
    return {
        "key": entry.get("key"),
        "label": categories.expiry_label(
            item.get("category"), entry.get("key"), entry.get("label")
        ),
        "expires_on": status["expires_on"],
        "issued_on": iso_date(entry.get("issued_on")),
        "reference": entry.get("reference"),
        "status": status["status"],
        "status_label": status["label"],
        "days_remaining": status["days_remaining"],
    }


def serialize(item, today=None):
    """One payload shape for both the list and the detail endpoint.

    There is nothing to hide between the two here: unlike the old vehicle
    lookup, every field was typed in by the user, and cards only ever hold four
    digits.  One shape means the list and the detail screen can never disagree
    about an item's status.
    """
    expiries = [
        serialize_expiry(item, entry, today) for entry in item.get("expiries") or []
    ]
    overall = worst_status([entry["status"] for entry in expiries])

    # The soonest *upcoming* date is what the card headlines; when everything
    # has expired, the most recent lapse is the more useful thing to show.
    upcoming = [entry for entry in expiries if (entry["days_remaining"] or 0) >= 0]
    headline = upcoming[0] if upcoming else (expiries[0] if expiries else None)

    return {
        "id": str(item.get("_id")),
        "category": item.get("category"),
        "category_label": categories.category_label(item.get("category")),
        "name": item.get("name"),
        "identifier": item.get("identifier"),
        "issuer": item.get("issuer"),
        "holder": item.get("holder"),
        "notes": item.get("notes"),
        "expiries": expiries,
        "next_expiry": headline,
        "overall_status": overall,
        "created_at": iso_datetime(item.get("created_at")),
        "updated_at": iso_datetime(item.get("updated_at")),
    }
