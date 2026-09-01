"""Brevo transactional email integration.

``send_reminder_email`` renders the HTML/text templates and posts them to the
Brevo API.  The API key lives in the environment, is sent only in the
``api-key`` request header and is never logged or returned by the API.

This is the one outbound HTTP call the backend makes.  If email is not
configured the sweep still runs and the in-app reminder list still works -- the
send simply fails with :class:`EmailError` and is recorded for a retry.
"""

from __future__ import annotations

import logging

import requests
from django.conf import settings
from django.template.loader import render_to_string

from core.dates import display_date
from core.errors import ApiError, ErrorCode
from items import categories

logger = logging.getLogger(__name__)


class EmailError(ApiError):
    """Raised when the reminder email could not be handed to Brevo."""


# Brevo error bodies look like {"code": "unauthorized", "message": "..."}.
# Only these two fields are ever read, and only this much of the message.
MAX_UPSTREAM_REASON = 200


def upstream_reason(response):
    """Brevo's own explanation of a rejection, or ``None``.

    A bare status code is not actionable: Brevo answers 401 both for a key it
    does not recognise and for a key used from an IP that is not on the
    account's allow-list, and those have completely different fixes. Its
    message says which -- it even names the offending IP -- so throwing that
    away leaves the user guessing at the one moment they need to know.

    Only the ``code`` and ``message`` fields are read, capped in length, and
    the API key is redacted on the way out in case a future error shape ever
    echoes the request back.
    """
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None

    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        return None

    reason = " ".join(message.split())[:MAX_UPSTREAM_REASON]

    key = settings.BREVO_API_KEY
    if key and key in reason:
        reason = reason.replace(key, "***")
    return reason


def _require_configuration(recipient):
    missing = []
    if not settings.BREVO_API_KEY:
        missing.append("BREVO_API_KEY")
    if not settings.BREVO_SENDER_EMAIL:
        missing.append("BREVO_SENDER_EMAIL")
    if not recipient:
        missing.append("REMINDER_EMAIL")
    if missing:
        raise EmailError(
            ErrorCode.EMAIL_NOT_CONFIGURED,
            "Email delivery is not configured (missing: %s)." % ", ".join(missing),
            status_code=503,
        )


def urgency_phrase(days_remaining):
    if days_remaining == 0:
        return "expires today"
    if days_remaining == 1:
        return "expires tomorrow"
    if days_remaining is not None and days_remaining > 1:
        return "expires in %d days" % days_remaining
    return "has expired"


def build_subject(item, entry):
    """e.g. ``Passport (Valid until) expires in 7 days``."""
    name = item.get("name") or categories.category_label(item.get("category"))
    return "%s -- %s %s" % (
        name,
        entry["expiry_label"],
        urgency_phrase(entry["days_remaining"]),
    )


def build_context(item, entry):
    """Everything the email templates need, already humanised."""
    identifier = item.get("identifier")
    category_key = item.get("category")

    # A card identifier is four digits; showing it as ****4321 makes clear
    # which card is meant without implying more was stored.
    if identifier and categories.is_card(category_key):
        identifier = "**** %s" % identifier

    return {
        "item_name": item.get("name"),
        "category_label": categories.category_label(category_key),
        "identifier": identifier,
        "issuer": item.get("issuer"),
        "holder": item.get("holder"),
        "expiry_label": entry["expiry_label"],
        "reference": entry.get("reference"),
        "expiry_date": display_date(entry["expiry_date"]),
        "days_remaining": entry["days_remaining"],
        "urgency": urgency_phrase(entry["days_remaining"]),
        "frontend_url": settings.FRONTEND_URL,
    }


def send_reminder_email(item, entry, recipient):
    """Send one reminder through Brevo.  Returns the Brevo message id.

    ``entry`` is one element of :func:`reminders.services.due_reminders`.
    """
    _require_configuration(recipient)

    context = build_context(item, entry)
    payload = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME,
            "email": settings.BREVO_SENDER_EMAIL,
        },
        "to": [{"email": recipient}],
        "subject": build_subject(item, entry),
        "htmlContent": render_to_string("emails/reminder.html", context),
        "textContent": render_to_string("emails/reminder.txt", context),
        "tags": ["expiry-reminder", item.get("category") or "other"],
    }

    headers = {
        "api-key": settings.BREVO_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
    }

    try:
        response = requests.post(
            settings.BREVO_API_URL,
            json=payload,
            headers=headers,
            timeout=settings.BREVO_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        raise EmailError(
            ErrorCode.EMAIL_SEND_FAILED,
            "The email service did not respond in time.",
            status_code=504,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("Brevo request failed: %s", exc.__class__.__name__)
        raise EmailError(
            ErrorCode.EMAIL_SEND_FAILED,
            "The email service could not be reached.",
            status_code=502,
        )

    if response.status_code not in (200, 201, 202):
        reason = upstream_reason(response)
        logger.error(
            "Brevo rejected the reminder (HTTP %s)%s",
            response.status_code,
            ": %s" % reason if reason else "",
        )
        detail = "The email service returned an error (HTTP %s)." % response.status_code
        if reason:
            detail = "%s %s" % (detail, reason)
        raise EmailError(ErrorCode.EMAIL_SEND_FAILED, detail, status_code=502)

    message_id = None
    try:
        body = response.json()
        if isinstance(body, dict):
            message_id = body.get("messageId")
    except ValueError:  # pragma: no cover - Brevo always returns JSON
        message_id = None

    logger.info(
        "Reminder email sent for item %s (%s, %s day(s) remaining)",
        item.get("_id"),
        entry["expiry_key"],
        entry["days_remaining"],
    )
    return message_id
