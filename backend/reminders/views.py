"""Reminder endpoints: what is coming, what was sent, and the manual sweep."""

from __future__ import annotations

import hmac
import logging

from django.conf import settings as django_settings
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.dates import parse_date, today_local
from core.errors import ApiError, ErrorCode
from core.responses import success
from items import services as item_services
from reminders import services

logger = logging.getLogger(__name__)


class ReminderUpcomingView(APIView):
    """``GET /api/reminders/upcoming/`` -- the schedule, computed on the fly.

    Nothing is stored to answer this: it is derived from the items and the
    configured offsets, so it always matches what the sweep will actually do.
    """

    throttle_scope = "read"

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 100))
        except (TypeError, ValueError):
            limit = 100
        limit = max(1, min(limit, 500))

        today = today_local()
        return success(
            {
                "today": today.isoformat(),
                "upcoming": services.upcoming_reminders(today=today, limit=limit),
                "sweep": services.sweep_state(),
            }
        )


class ReminderListView(APIView):
    """``GET /api/reminders/`` -- what has been sent (and what failed)."""

    throttle_scope = "read"

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, 200))

        item_id = request.query_params.get("item_id")
        reminders = services.list_reminders(limit=limit, item_id=item_id)

        # One extra read resolves every item name in the page, instead of one
        # lookup per row.
        items_by_id = {
            str(item["_id"]): item for item in item_services.list_items()
        }
        return success(
            [services.serialize(entry, items_by_id) for entry in reminders]
        )


class ReminderRunView(APIView):
    """``POST /api/reminders/run/`` -- run the sweep right now.

    Two callers are allowed, and they are authenticated differently:

    * the signed-in user, pressing "Send due reminders now";
    * an external scheduler (Render Cron, cron-job.org, a GitHub Action)
      presenting ``X-Cron-Token``.  That is what makes email arrive on a day
      nobody opens the app.

    Either way the sweep is idempotent, so a cron ping and a button press on
    the same day cannot produce two emails.
    """

    # Authentication is decided in `post` so the cron token can stand in for a
    # session; DRF's own check would reject the tokened request first.
    permission_classes = [AllowAny]
    throttle_scope = "write"

    def _cron_authorised(self, request):
        expected = getattr(django_settings, "CRON_TOKEN", None)
        if not expected:
            return False
        presented = request.META.get("HTTP_X_CRON_TOKEN", "")
        if not presented:
            return False
        return hmac.compare_digest(str(presented), str(expected))

    def post(self, request):
        by_cron = self._cron_authorised(request)
        if not by_cron and not request.user:
            raise ApiError(
                ErrorCode.AUTHENTICATION_REQUIRED,
                "Sign in, or present a valid X-Cron-Token header.",
                status_code=401,
            )

        # `for_date` is a testing aid for the signed-in user only: it lets you
        # confirm the wiring without waiting for a real expiry to come round.
        for_date = None
        if not by_cron:
            for_date = parse_date(request.data.get("for_date"))

        logger.info("Reminder sweep requested (%s)", "cron" if by_cron else "user")
        summary = services.run_sweep(today=for_date)
        return success({"triggered_by": "cron" if by_cron else "user", **summary})
