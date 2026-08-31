"""Small middlewares: extra security headers and request logging."""

from __future__ import annotations

import logging
import time

logger = logging.getLogger("api.request")


class SecurityHeadersMiddleware:
    """Headers Django does not set on its own for a pure JSON API."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("X-Frame-Options", "DENY")
        response.setdefault("Referrer-Policy", "same-origin")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        # The API returns JSON only; nothing should ever be rendered.
        response.setdefault(
            "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
        )
        response.setdefault("Cache-Control", "no-store")
        return response


class RequestLogMiddleware:
    """One structured line per request.

    Only the method, path, status and duration are logged -- never headers,
    cookies or request bodies.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        duration_ms = (time.monotonic() - started) * 1000
        logger.info(
            "%s %s -> %s (%.0fms)",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
        )
        return response
