"""``GET /api/health/`` -- the one public endpoint.

Returns ``503`` when MongoDB is unreachable so platform health checks (Render,
Railway, uptime monitors) react correctly.  There is no worker or broker to
report on; ``?sweep=1`` adds when the daily reminder sweep last ran.
"""

from __future__ import annotations

import logging

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import mongo
from core.dates import iso_datetime, now_utc

logger = logging.getLogger(__name__)


def _sweep_status():
    """When the reminder sweep last ran.  Never raises."""
    try:
        from reminders.services import sweep_state

        return sweep_state()
    except Exception as exc:
        logger.warning("Sweep status unavailable: %s", exc.__class__.__name__)
        return {"last_run_date": None, "last_run_at": None}


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        database_ok = mongo.ping()

        payload = {
            "status": "healthy" if database_ok else "unhealthy",
            "database": "connected" if database_ok else "disconnected",
            "timestamp": iso_datetime(now_utc()),
            "timezone": settings.TIME_ZONE,
        }

        if request.query_params.get("sweep") in ("1", "true", "yes"):
            payload["sweep"] = _sweep_status()

        status_code = 200 if database_ok else 503
        # Health checks are intentionally *not* wrapped in the success/error
        # envelope so that any uptime monitor can read them directly.
        return Response(payload, status=status_code)
