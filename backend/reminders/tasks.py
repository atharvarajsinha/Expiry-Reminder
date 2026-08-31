"""Scheduled reminder tasks.

``daily_reminder_check`` is registered with Celery Beat in
``config/celery.py`` and runs once a day at the configured local time.  It
does not depend on the frontend being open or on any HTTP traffic.
"""

from __future__ import annotations

import logging

from celery import shared_task

from core.dates import parse_date
from reminders import services

logger = logging.getLogger(__name__)


@shared_task(name="reminders.daily_reminder_check", bind=True, max_retries=1)
def daily_reminder_check(self, for_date=None):
    """Check every vehicle and send whatever reminder is due today.

    ``for_date`` (``YYYY-MM-DD``) is only used for manual re-runs; the
    scheduled invocation always uses today in the project timezone.
    """
    today = parse_date(for_date) if for_date else None
    logger.info("Daily reminder check starting (for_date=%s)", for_date or "today")
    try:
        return services.run_daily_check(today=today)
    except Exception as exc:
        logger.exception("Daily reminder check failed")
        # One retry in 5 minutes; the sweep is idempotent so this is safe.
        raise self.retry(exc=exc, countdown=300)
