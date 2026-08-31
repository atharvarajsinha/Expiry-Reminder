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

    # Vehicles / jobs
    INVALID_VEHICLE_NUMBER = "INVALID_VEHICLE_NUMBER"
    VEHICLE_ALREADY_EXISTS = "VEHICLE_ALREADY_EXISTS"
    VEHICLE_NOT_FOUND = "VEHICLE_NOT_FOUND"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"

    # FireAPI
    VEHICLE_API_TIMEOUT = "VEHICLE_API_TIMEOUT"
    VEHICLE_API_UNAVAILABLE = "VEHICLE_API_UNAVAILABLE"
    VEHICLE_API_ERROR = "VEHICLE_API_ERROR"
    VEHICLE_API_RATE_LIMITED = "VEHICLE_API_RATE_LIMITED"
    VEHICLE_API_INVALID_RESPONSE = "VEHICLE_API_INVALID_RESPONSE"
    VEHICLE_API_NOT_CONFIGURED = "VEHICLE_API_NOT_CONFIGURED"
    VEHICLE_NOT_FOUND_UPSTREAM = "VEHICLE_NOT_FOUND_UPSTREAM"

    # Email / infrastructure
    QUEUE_UNAVAILABLE = "QUEUE_UNAVAILABLE"
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
