"""The catalogue of things this app can track.

Everything the user owns -- a car, a passport, a credit card, a health policy
-- is stored in one ``items`` collection and told apart by ``category``.  A
category contributes three things:

* **labels** for the shared fields, so a vehicle asks for a "Registration
  number" where a credit card asks for the "Last 4 digits";
* **expiry presets**, the dates that kind of item usually has.  They seed the
  form only -- the API accepts any expiry key, so a user can add "Extended
  warranty" to a laptop without a code change;
* **card handling**, which is what stops a full card number ever being stored.

Adding a category means adding one entry here: the API exposes the whole
catalogue at ``GET /api/items/categories/`` and the frontend builds its forms,
icons and filters from that response.
"""

from __future__ import annotations

import re

from core.errors import ApiError, ErrorCode

# A key we accept for an expiry entry: lowercase, digits, underscores.
EXPIRY_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")

# Categories that must never hold more than the last four digits of a card.
CARD_CATEGORIES = ("credit_card", "debit_card")


def _expiry(key, label, reference_label=None):
    return {"key": key, "label": label, "reference_label": reference_label}


CATEGORIES = {
    "vehicle": {
        "label": "Vehicle",
        "plural": "Vehicles",
        "icon": "car",
        "description": "Cars, bikes and anything else with papers to renew.",
        "name_label": "Vehicle name",
        "name_placeholder": "Honda CB Twister",
        "identifier_label": "Registration number",
        "identifier_placeholder": "UP25AK4922",
        "identifier_required": True,
        "issuer_label": "Insurer",
        "holder_label": "Owner",
        "expiries": [
            _expiry("insurance", "Insurance", "Policy number"),
            _expiry("pucc", "PUC certificate", "Certificate number"),
            _expiry("fitness", "Fitness certificate", "Certificate number"),
            _expiry("road_tax", "Road tax", "Receipt number"),
            _expiry("permit", "Permit", "Permit number"),
        ],
        "default_expiries": ["insurance", "pucc"],
    },
    "credit_card": {
        "label": "Credit card",
        "plural": "Credit cards",
        "icon": "credit-card",
        "description": "The expiry printed on the card, and the annual fee date.",
        "name_label": "Card name",
        "name_placeholder": "HDFC Millennia",
        "identifier_label": "Last 4 digits",
        "identifier_placeholder": "4321",
        "identifier_required": False,
        "issuer_label": "Bank",
        "holder_label": "Cardholder",
        "expiries": [
            _expiry("card_expiry", "Card expiry"),
            _expiry("annual_fee", "Annual fee due", "Fee amount"),
        ],
        "default_expiries": ["card_expiry"],
    },
    "debit_card": {
        "label": "Debit card",
        "plural": "Debit cards",
        "icon": "credit-card",
        "description": "The expiry printed on the card.",
        "name_label": "Card name",
        "name_placeholder": "SBI Classic",
        "identifier_label": "Last 4 digits",
        "identifier_placeholder": "8890",
        "identifier_required": False,
        "issuer_label": "Bank",
        "holder_label": "Cardholder",
        "expiries": [_expiry("card_expiry", "Card expiry")],
        "default_expiries": ["card_expiry"],
    },
    "document": {
        "label": "Document",
        "plural": "Documents",
        "icon": "file-text",
        "description": "Passport, licence, visa, ID -- anything with a valid-until date.",
        "name_label": "Document name",
        "name_placeholder": "Passport",
        "identifier_label": "Document number",
        "identifier_placeholder": "M1234567",
        "identifier_required": False,
        "issuer_label": "Issuing authority",
        "holder_label": "Held by",
        "expiries": [
            _expiry("valid_until", "Valid until"),
            _expiry("renewal_window", "Renewal opens"),
        ],
        "default_expiries": ["valid_until"],
    },
    "insurance": {
        "label": "Insurance policy",
        "plural": "Insurance policies",
        "icon": "shield",
        "description": "Health, life, home and travel cover.",
        "name_label": "Policy name",
        "name_placeholder": "Family health cover",
        "identifier_label": "Policy number",
        "identifier_placeholder": "POL-2291045",
        "identifier_required": False,
        "issuer_label": "Insurer",
        "holder_label": "Policy holder",
        "expiries": [
            _expiry("policy", "Policy expiry"),
            _expiry("premium", "Premium due", "Premium amount"),
        ],
        "default_expiries": ["policy"],
    },
    "subscription": {
        "label": "Subscription",
        "plural": "Subscriptions",
        "icon": "repeat",
        "description": "Domains, memberships and anything that renews on a date.",
        "name_label": "Subscription name",
        "name_placeholder": "Domain renewal",
        "identifier_label": "Account or reference",
        "identifier_placeholder": "example.com",
        "identifier_required": False,
        "issuer_label": "Provider",
        "holder_label": "Account holder",
        "expiries": [_expiry("renewal", "Renews on", "Plan")],
        "default_expiries": ["renewal"],
    },
    "warranty": {
        "label": "Warranty",
        "plural": "Warranties",
        "icon": "package",
        "description": "Appliance and device warranties.",
        "name_label": "Product name",
        "name_placeholder": "Washing machine",
        "identifier_label": "Serial number",
        "identifier_placeholder": "SN-88213",
        "identifier_required": False,
        "issuer_label": "Brand or seller",
        "holder_label": "Purchased by",
        "expiries": [
            _expiry("warranty", "Warranty ends", "Invoice number"),
            _expiry("amc", "AMC ends", "Contract number"),
        ],
        "default_expiries": ["warranty"],
    },
    "other": {
        "label": "Other",
        "plural": "Other",
        "icon": "circle-dot",
        "description": "Anything else with a date you must not miss.",
        "name_label": "Name",
        "name_placeholder": "Fire extinguisher refill",
        "identifier_label": "Reference",
        "identifier_placeholder": "",
        "identifier_required": False,
        "issuer_label": "Provider",
        "holder_label": "Belongs to",
        "expiries": [_expiry("expires", "Expires on")],
        "default_expiries": ["expires"],
    },
}

CATEGORY_KEYS = tuple(CATEGORIES.keys())

# Reminder offsets fall back to this key when a category has no explicit entry.
DEFAULT_OFFSET_KEY = "default"


def get_category(key):
    """The category definition, or an :class:`ApiError` for an unknown key."""
    category = CATEGORIES.get(key)
    if category is None:
        raise ApiError(
            ErrorCode.UNKNOWN_CATEGORY,
            "'%s' is not a category this app knows about." % key,
            status_code=400,
            details={"allowed": list(CATEGORY_KEYS)},
        )
    return category


def is_card(category_key):
    return category_key in CARD_CATEGORIES


def category_label(key):
    definition = CATEGORIES.get(key)
    return definition["label"] if definition else "Item"


def expiry_label(category_key, expiry_key, stored_label=None):
    """The friendliest label available for one expiry entry.

    The label saved with the entry wins (the user may have renamed it), the
    category preset is the fallback, and a title-cased key the last resort.
    """
    if stored_label:
        return stored_label
    definition = CATEGORIES.get(category_key) or {}
    for preset in definition.get("expiries", []):
        if preset["key"] == expiry_key:
            return preset["label"]
    return str(expiry_key or "").replace("_", " ").strip().title() or "Expiry"


def catalogue():
    """The whole catalogue, shaped for ``GET /api/items/categories/``."""
    return [
        {
            "key": key,
            "label": definition["label"],
            "plural": definition["plural"],
            "icon": definition["icon"],
            "description": definition["description"],
            "name_label": definition["name_label"],
            "name_placeholder": definition["name_placeholder"],
            "identifier_label": definition["identifier_label"],
            "identifier_placeholder": definition["identifier_placeholder"],
            "identifier_required": definition["identifier_required"],
            "issuer_label": definition["issuer_label"],
            "holder_label": definition["holder_label"],
            "is_card": is_card(key),
            "expiries": definition["expiries"],
            "default_expiries": definition["default_expiries"],
        }
        for key, definition in CATEGORIES.items()
    ]
