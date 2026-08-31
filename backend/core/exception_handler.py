"""DRF exception handler producing the project wide error envelope."""

from __future__ import annotations

import logging

from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.errors import ApiError, ErrorCode

logger = logging.getLogger(__name__)

_STATUS_TO_CODE = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.AUTHENTICATION_REQUIRED,
    403: ErrorCode.AUTHENTICATION_REQUIRED,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    429: ErrorCode.RATE_LIMITED,
}


def _flatten_validation_details(detail):
    """Turn DRF validation detail structures into a plain dict/list."""
    if isinstance(detail, dict):
        return {key: _flatten_validation_details(value) for key, value in detail.items()}
    if isinstance(detail, list):
        return [_flatten_validation_details(item) for item in detail]
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, ApiError):
        return Response(exc.to_dict(), status=exc.status_code)

    if isinstance(exc, Http404):
        return Response(
            {
                "success": False,
                "error": {
                    "code": ErrorCode.NOT_FOUND,
                    "message": "The requested resource was not found.",
                },
            },
            status=404,
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        # Unhandled server error: log it (with traceback) but never leak the
        # internal message to the client.
        logger.exception("Unhandled server error")
        return Response(
            {
                "success": False,
                "error": {
                    "code": ErrorCode.INTERNAL_ERROR,
                    "message": "An unexpected error occurred.",
                },
            },
            status=500,
        )

    code = _STATUS_TO_CODE.get(response.status_code, ErrorCode.INTERNAL_ERROR)
    details = None
    message = "Request failed."

    if isinstance(exc, drf_exceptions.ValidationError):
        code = ErrorCode.VALIDATION_ERROR
        message = "The request payload is invalid."
        details = _flatten_validation_details(exc.detail)
    elif isinstance(exc, drf_exceptions.NotAuthenticated):
        code = ErrorCode.AUTHENTICATION_REQUIRED
        message = "Authentication credentials were not provided."
    elif isinstance(exc, drf_exceptions.AuthenticationFailed):
        code = getattr(exc, "error_code", ErrorCode.TOKEN_INVALID)
        message = str(exc.detail)
    elif isinstance(exc, drf_exceptions.PermissionDenied):
        code = ErrorCode.AUTHENTICATION_REQUIRED
        message = str(exc.detail)
    elif isinstance(exc, drf_exceptions.Throttled):
        code = ErrorCode.RATE_LIMITED
        message = "Too many requests. Please try again later."
        if exc.wait:
            details = {"retry_after_seconds": int(exc.wait)}
    elif isinstance(exc, drf_exceptions.MethodNotAllowed):
        code = ErrorCode.METHOD_NOT_ALLOWED
        message = str(exc.detail)
    elif isinstance(exc, drf_exceptions.NotFound):
        code = ErrorCode.NOT_FOUND
        message = str(exc.detail)
    else:
        message = str(getattr(exc, "detail", "Request failed."))

    body = {"success": False, "error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    response.data = body
    return response
