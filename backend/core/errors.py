"""Application error codes and the single exception type the API raises."""

from __future__ import annotations


class ErrorCode:
    """Stable, machine readable error codes returned to the frontend."""

    # Generic
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"

    # Authentication
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_INVALID = "TOKEN_INVALID"
    CSRF_FAILED = "CSRF_FAILED"
    AUTH_NOT_CONFIGURED = "AUTH_NOT_CONFIGURED"

    # Items
    ITEM_NOT_FOUND = "ITEM_NOT_FOUND"
    ITEM_ALREADY_EXISTS = "ITEM_ALREADY_EXISTS"
    UNKNOWN_CATEGORY = "UNKNOWN_CATEGORY"
    INVALID_EXPIRY = "INVALID_EXPIRY"
    INVALID_VEHICLE_NUMBER = "INVALID_VEHICLE_NUMBER"
    # Raised when a full card number is submitted: only the last four digits
    # are ever accepted, and the request is rejected rather than truncated.
    CARD_NUMBER_REJECTED = "CARD_NUMBER_REJECTED"

    # Email / infrastructure
    EMAIL_NOT_CONFIGURED = "EMAIL_NOT_CONFIGURED"
    EMAIL_SEND_FAILED = "EMAIL_SEND_FAILED"
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"


class ApiError(Exception):
    """Raised anywhere in the project; rendered by ``core.exception_handler``.

    ``message`` is safe to show to the user: it never contains credentials or
    upstream response bodies.
    """

    def __init__(self, code, message, status_code=400, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details

    def to_dict(self):
        error = {"code": self.code, "message": self.message}
        if self.details:
            error["details"] = self.details
        return {"success": False, "error": error}

    def __repr__(self):  # pragma: no cover - debugging helper
        return "ApiError(code=%s, status=%s)" % (self.code, self.status_code)
