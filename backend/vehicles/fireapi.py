"""FireAPI client.

The API key and the header it travels in are both configurable because the
provider may rename the header.  The key is only ever read from settings, is
never returned to the frontend and is never written to a log line.
"""

from __future__ import annotations

import logging

import requests
from django.conf import settings

from core.errors import ApiError, ErrorCode
from core.validators import mask_vehicle_number

logger = logging.getLogger(__name__)

# Upstream messages that mean "no such vehicle" rather than "we broke".
_NOT_FOUND_HINTS = (
    "not found",
    "no data",
    "no record",
    "invalid vehicle",
    "does not exist",
)


class FireApiError(ApiError):
    """Any failure while talking to FireAPI."""


def _headers():
    if not settings.FIREAPI_API_KEY:
        raise FireApiError(
            ErrorCode.VEHICLE_API_NOT_CONFIGURED,
            "The vehicle information service is not configured.",
            status_code=503,
        )
    prefix = (settings.FIREAPI_API_KEY_PREFIX or "").strip()
    value = "%s %s" % (prefix, settings.FIREAPI_API_KEY) if prefix else settings.FIREAPI_API_KEY
    return {
        settings.FIREAPI_API_KEY_HEADER: value,
        "Accept": "application/json",
        "User-Agent": "vehicle-reminder/1.0",
    }


def fetch_vehicle_info(vehicle_no):
    """Return the ``data`` object from FireAPI for ``vehicle_no``.

    Raises :class:`FireApiError` for every failure mode with a user-safe
    message and a stable error code.
    """
    masked = mask_vehicle_number(vehicle_no)
    params = {settings.FIREAPI_QUERY_PARAM: vehicle_no}

    try:
        response = requests.get(
            settings.FIREAPI_URL,
            params=params,
            headers=_headers(),
            timeout=(settings.FIREAPI_CONNECT_TIMEOUT, settings.FIREAPI_TIMEOUT),
        )
    except requests.exceptions.Timeout:
        logger.warning("FireAPI timeout for vehicle %s", masked)
        raise FireApiError(
            ErrorCode.VEHICLE_API_TIMEOUT,
            "The vehicle information service did not respond in time.",
            status_code=504,
        )
    except requests.exceptions.ConnectionError:
        logger.warning("FireAPI connection error for vehicle %s", masked)
        raise FireApiError(
            ErrorCode.VEHICLE_API_UNAVAILABLE,
            "The vehicle information service could not be reached.",
            status_code=502,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning(
            "FireAPI request failed for vehicle %s: %s", masked, exc.__class__.__name__
        )
        raise FireApiError(
            ErrorCode.VEHICLE_API_ERROR,
            "The vehicle information service request failed.",
            status_code=502,
        )

    # Status only -- never the headers (they carry the API key).
    logger.info("FireAPI responded %s for vehicle %s", response.status_code, masked)

    _raise_for_status(response, masked)
    payload = _parse_json(response, masked)
    return _extract_data(payload, masked)


def _raise_for_status(response, masked):
    status = response.status_code
    if status == 429:
        raise FireApiError(
            ErrorCode.VEHICLE_API_RATE_LIMITED,
            "The vehicle information service rate limit was reached. "
            "Please try again later.",
            status_code=429,
        )
    if status in (401, 403):
        logger.error("FireAPI rejected our credentials (HTTP %s)", status)
        raise FireApiError(
            ErrorCode.VEHICLE_API_ERROR,
            "The vehicle information service rejected the request.",
            status_code=502,
        )
    if status == 404:
        raise FireApiError(
            ErrorCode.VEHICLE_NOT_FOUND_UPSTREAM,
            "No record was found for this vehicle number.",
            status_code=404,
        )
    if status >= 500:
        raise FireApiError(
            ErrorCode.VEHICLE_API_UNAVAILABLE,
            "The vehicle information service is temporarily unavailable.",
            status_code=502,
        )
    if status >= 400:
        raise FireApiError(
            ErrorCode.VEHICLE_API_ERROR,
            "The vehicle information service returned an error (HTTP %s)." % status,
            status_code=502,
        )


def _parse_json(response, masked):
    try:
        payload = response.json()
    except ValueError:
        logger.warning("FireAPI returned non-JSON content for vehicle %s", masked)
        raise FireApiError(
            ErrorCode.VEHICLE_API_INVALID_RESPONSE,
            "The vehicle information service returned an unreadable response.",
            status_code=502,
        )
    if not isinstance(payload, dict):
        raise FireApiError(
            ErrorCode.VEHICLE_API_INVALID_RESPONSE,
            "The vehicle information service returned an unexpected response.",
            status_code=502,
        )
    return payload


def _extract_data(payload, masked):
    status = str(payload.get("status", "")).lower()
    message = str(payload.get("message", "") or "")

    if status and status not in {"success", "ok", "true"}:
        lowered = message.lower()
        if any(hint in lowered for hint in _NOT_FOUND_HINTS):
            raise FireApiError(
                ErrorCode.VEHICLE_NOT_FOUND_UPSTREAM,
                "No record was found for this vehicle number.",
                status_code=404,
            )
        logger.warning("FireAPI reported a failure for vehicle %s", masked)
        raise FireApiError(
            ErrorCode.VEHICLE_API_ERROR,
            "The vehicle information service could not return this vehicle.",
            status_code=502,
        )

    data = payload.get("data")
    if not isinstance(data, dict) or not data:
        logger.warning("FireAPI returned no usable data for vehicle %s", masked)
        raise FireApiError(
            ErrorCode.VEHICLE_API_INVALID_RESPONSE,
            "The vehicle information service returned an incomplete response.",
            status_code=502,
        )
    return data
