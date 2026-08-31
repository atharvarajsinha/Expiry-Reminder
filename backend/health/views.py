"""``GET /api/health/`` -- the one public endpoint.

Returns ``503`` when MongoDB is unreachable so platform health checks (Render,
Railway, uptime monitors) react correctly.  Worker/scheduler status is
included when ``?workers=1`` is passed (it costs a broker round trip).
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


def _worker_status(timeout=1.0):
    """Ask the broker which workers answer.  Never raises."""
    try:
        from config.celery import app as celery_app

        replies = celery_app.control.ping(timeout=timeout) or []
        names = [name for reply in replies for name in reply.keys()]
        scheduled = celery_app.conf.beat_schedule or {}
        return {
            "broker": "connected" if replies else "unknown",
            "workers_online": len(names),
            "workers": names,
            "scheduled_tasks": sorted(scheduled.keys()),
        }
    except Exception as exc:
        logger.warning("Worker health check failed: %s", exc.__class__.__name__)
        return {
            "broker": "disconnected",
            "workers_online": 0,
            "workers": [],
            "scheduled_tasks": [],
        }


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

        if request.query_params.get("workers") in ("1", "true", "yes"):
            payload["celery"] = _worker_status()

        status_code = 200 if database_ok else 503
        # Health checks are intentionally *not* wrapped in the success/error
        # envelope so that any uptime monitor can read them directly.
        return Response(payload, status=status_code)
