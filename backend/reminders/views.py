"""Reminder endpoints: what is coming, what was sent, and the daily check."""

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
    configured offsets, so it always matches what the daily check will do.
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
        items_by_id = {str(item["_id"]): item for item in item_services.list_items()}
        return success([services.serialize(entry, items_by_id) for entry in reminders])


class ReminderRunView(APIView):
    """``GET`` / ``POST`` ``/api/reminders/run/`` -- the daily check.

    Two callers, authenticated differently and behaving differently:

    **A scheduler or uptime monitor**, presenting ``CRON_TOKEN``. This is how
    reminder email actually gets sent. The call is *gated*: it does real work
    at most once per calendar day, and not before ``REMINDER_HOUR``. That gate
    lives here rather than in the caller because the realistic free trigger is
    an uptime monitor, which pings every few minutes rather than at a set time
    -- so this endpoint has to be cheap to hit constantly and still send the
    day's reminders at nine in the morning.

    **The signed-in user**, pressing "Send Due Now". Ungated: it runs there and
    then, which is the whole point of a manual override, and it deliberately
    does not touch the daily marker so it cannot cause the scheduled run to be
    skipped.

    Either way the sweep is idempotent, so a monitor ping and a button press on
    the same morning cannot produce two emails.
    """

    # Authentication is decided in `_dispatch` so the token can stand in for a
    # session; DRF's own check would reject the tokened request first.
    permission_classes = [AllowAny]
    throttle_scope = "write"

    def _cron_authorised(self, request):
        """True when a valid ``CRON_TOKEN`` was presented.

        The header is the right way to send it. The query parameter exists
        because free uptime monitors -- UptimeRobot among them -- cannot attach
        custom headers, and a reminder that never fires is worse than a secret
        in an access log. Both are compared in constant time.
        """
        expected = getattr(django_settings, "CRON_TOKEN", None)
        if not expected:
            return False

        presented = request.META.get("HTTP_X_CRON_TOKEN") or request.query_params.get(
            "token", ""
        )
        if not presented:
            return False
        return hmac.compare_digest(str(presented), str(expected))

    def _dispatch(self, request):
        if self._cron_authorised(request):
            # Always 200, including "nothing to do yet": an uptime monitor
            # reads any non-2xx as the site being down and will page the user
            # at 3am to report that it is not yet 9am.
            outcome = services.run_scheduled_sweep()
            logger.info(
                "Scheduled reminder check: %s", outcome.get("reason", "unknown")
            )
            return success({"triggered_by": "cron", **outcome})

        if not request.user:
            raise ApiError(
                ErrorCode.AUTHENTICATION_REQUIRED,
                "Sign in, or present a valid cron token.",
                status_code=401,
            )

        # `for_date` is a testing aid for the signed-in user only: it lets you
        # confirm the wiring without waiting for a real expiry to come round.
        for_date = parse_date(request.data.get("for_date")) if request.data else None

        logger.info("Manual reminder check requested")
        summary = services.run_sweep(today=for_date)
        return success({"triggered_by": "user", "ran": True, **summary})

    def get(self, request):
        # GET is here for uptime monitors, which default to it and often
        # cannot be switched. It is not a safe method by HTTP's definition --
        # it sends email -- but only for a caller holding the token.
        if not self._cron_authorised(request):
            raise ApiError(
                ErrorCode.AUTHENTICATION_REQUIRED,
                "Present a valid cron token, or use POST while signed in.",
                status_code=401,
            )
        return self._dispatch(request)

    def post(self, request):
        return self._dispatch(request)
