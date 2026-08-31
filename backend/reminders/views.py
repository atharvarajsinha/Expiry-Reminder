"""Reminder history and a manual trigger (useful for testing delivery)."""

from __future__ import annotations

import logging

from rest_framework.views import APIView

from core.errors import ApiError, ErrorCode
from core.responses import success
from reminders import services
from reminders.tasks import daily_reminder_check

logger = logging.getLogger(__name__)


class ReminderListView(APIView):
    """``GET /api/reminders/`` -- what has been sent (and what failed)."""

    throttle_scope = "read"

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, 200))
        vehicle_id = request.query_params.get("vehicle_id")
        reminders = services.list_reminders(limit=limit, vehicle_id=vehicle_id)
        return success([services.serialize(item) for item in reminders])


class ReminderRunView(APIView):
    """``POST /api/reminders/run/`` -- queue the daily check right now.

    Still idempotent: reminders already sent are not sent again.
    """

    throttle_scope = "vehicle_refresh"

    def post(self, request):
        try:
            async_result = daily_reminder_check.delay()
        except Exception as exc:
            logger.error("Could not queue the reminder check: %s", exc.__class__.__name__)
            raise ApiError(
                ErrorCode.QUEUE_UNAVAILABLE,
                "The background worker queue is unavailable. Please try again.",
                status_code=503,
            )
        return success({"queued": True, "task_id": str(async_result.id)}, status_code=202)
