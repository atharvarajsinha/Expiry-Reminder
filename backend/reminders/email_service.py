"""Brevo transactional email integration.

``send_reminder_email`` renders the HTML/text templates and posts them to the
Brevo API.  The API key lives in the environment, is sent only in the
``api-key`` request header and is never logged or returned by the API.
"""

from __future__ import annotations

import logging

import requests
from django.conf import settings
from django.template.loader import render_to_string

from core.dates import display_date
from core.errors import ApiError, ErrorCode

logger = logging.getLogger(__name__)

DOCUMENT_LABELS = {"insurance": "Insurance", "pucc": "PUC"}


class EmailError(ApiError):
    """Raised when the reminder email could not be handed to Brevo."""


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


def build_subject(vehicle_no, document_type, days_remaining):
    label = DOCUMENT_LABELS.get(document_type, document_type.title())
    if days_remaining == 0:
        window = "expires today"
    elif days_remaining == 1:
        window = "expires tomorrow"
    elif days_remaining is not None and days_remaining > 1:
        window = "expires in %d days" % days_remaining
    else:
        window = "has expired"
    return "Vehicle %s %s %s" % (vehicle_no, label, window)


def build_context(vehicle, document_type, expiry_date, days_remaining):
    """Everything the email templates need, already humanised."""
    block = vehicle.get(document_type) or {}
    label = DOCUMENT_LABELS.get(document_type, document_type.title())

    if days_remaining == 0:
        urgency = "expires today"
    elif days_remaining == 1:
        urgency = "expires tomorrow"
    else:
        urgency = "expires in %d days" % days_remaining

    maker_model = " ".join(
        part for part in [vehicle.get("maker"), vehicle.get("model")] if part
    )

    return {
        "vehicle_no": vehicle.get("vehicle_no"),
        "maker_model": maker_model or "Not available",
        "document_label": label,
        "document_type": document_type,
        "company": block.get("company"),
        "reference_label": "Policy Number" if document_type == "insurance" else "Certificate Number",
        "reference_no": block.get("policy_no") or block.get("certificate_no"),
        "expiry_date": display_date(expiry_date),
        "days_remaining": days_remaining,
        "urgency": urgency,
        "frontend_url": settings.FRONTEND_URL,
    }


def send_reminder_email(vehicle, document_type, expiry_date, days_remaining, recipient):
    """Send one reminder through Brevo.  Returns the Brevo message id."""
    _require_configuration(recipient)

    context = build_context(vehicle, document_type, expiry_date, days_remaining)
    subject = build_subject(
        vehicle.get("vehicle_no"), document_type, days_remaining
    )
    payload = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME,
            "email": settings.BREVO_SENDER_EMAIL,
        },
        "to": [{"email": recipient}],
        "subject": subject,
        "htmlContent": render_to_string("emails/reminder.html", context),
        "textContent": render_to_string("emails/reminder.txt", context),
        "tags": ["vehicle-reminder", document_type],
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
        # Status code only: the body may echo request details.
        logger.error("Brevo rejected the reminder (HTTP %s)", response.status_code)
        raise EmailError(
            ErrorCode.EMAIL_SEND_FAILED,
            "The email service returned an error (HTTP %s)." % response.status_code,
            status_code=502,
        )

    message_id = None
    try:
        body = response.json()
        if isinstance(body, dict):
            message_id = body.get("messageId")
    except ValueError:  # pragma: no cover - Brevo always returns JSON
        message_id = None

    logger.info(
        "Reminder email sent for vehicle %s (%s, %s day(s) remaining)",
        vehicle.get("vehicle_no"),
        document_type,
        days_remaining,
    )
    return message_id
