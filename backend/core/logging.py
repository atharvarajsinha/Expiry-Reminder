"""Logging safety net.

Secrets are never passed to a logger on purpose anywhere in this project.
This filter is the second line of defence: if a configured secret value ever
appears in a formatted log record it is replaced with ``***REDACTED***``.
"""

from __future__ import annotations

import logging

from django.conf import settings

REDACTED = "***REDACTED***"

# Header/field names that must never be echoed into a log line.
SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "set-cookie",
    "api-key",
    "x-api-key",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "jwt_secret_key",
    "secret_key",
}


def _secret_values():
    values = []
    for name in getattr(settings, "SENSITIVE_SETTING_NAMES", []):
        value = getattr(settings, name, None)
        if isinstance(value, str) and len(value) >= 8:
            values.append(value)
    return values


def scrub(text):
    """Replace every known secret value inside ``text``."""
    if not text:
        return text
    for secret in _secret_values():
        if secret in text:
            text = text.replace(secret, REDACTED)
    return text


def safe_headers(headers):
    """Copy of ``headers`` with sensitive values masked (for debugging)."""
    result = {}
    for key, value in (headers or {}).items():
        result[key] = REDACTED if key.lower() in SENSITIVE_KEYS else value
    return result


class SensitiveDataFilter(logging.Filter):
    def filter(self, record):
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - broken record
            return True
        cleaned = scrub(message)
        if cleaned != message:
            record.msg = cleaned
            record.args = ()
        return True
