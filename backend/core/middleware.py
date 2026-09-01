"""Small middlewares: security headers, request logging and the sweep tick."""

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


class ReminderSweepMiddleware:
    """The whole scheduler, in one middleware.

    With no worker and no cron there is nothing to run the daily reminder
    check, so the first request of each day runs it instead.  Three properties
    make that safe to hang off a user's request:

    * it is claimed atomically, so exactly one request per calendar day does
      the work and the rest cost one indexed lookup that matches nothing;
    * it runs *after* the response has been built, so nothing the user is
      waiting for is blocked behind an email send;
    * it can never fail a request -- a broken sweep is logged and swallowed,
      because a database hiccup at 9am should not turn the dashboard into a
      500.

    The trade-off is honest: email only goes out on days the app is used. Point
    an external scheduler at ``POST /api/reminders/run/`` with ``X-Cron-Token``
    if reminders must arrive whether or not anyone opens it.
    """

    # Health checks and preflights must stay as cheap as they look.
    SKIP_PREFIXES = ("/api/health", "/api/auth")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.method == "OPTIONS" or not request.path.startswith("/api/"):
            return response
        if request.path.startswith(self.SKIP_PREFIXES):
            return response
        # A failing request is a poor moment to start sending email.
        if response.status_code >= 500:
            return response

        try:
            from reminders.services import maybe_run_sweep

            summary = maybe_run_sweep()
            if summary is not None:
                logger.info(
                    "Sweep ran on request: %s due, %s sent, %s failed",
                    summary.get("due"),
                    summary.get("sent"),
                    summary.get("failed"),
                )
        except Exception as exc:  # never break the response
            logger.error(
                "Reminder sweep failed during a request: %s", exc.__class__.__name__
            )

        return response
