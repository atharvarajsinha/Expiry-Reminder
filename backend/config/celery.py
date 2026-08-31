"""Celery application.

Two things happen here:

* task auto discovery for every installed Django app, and
* the Celery Beat schedule for the daily reminder sweep.

Start the pieces with::

    celery -A config worker -l info
    celery -A config beat   -l info
"""

from __future__ import annotations

import os
from pathlib import Path

from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("vehicle_reminder")

# All Celery options live in Django settings prefixed with ``CELERY_``.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Task modules are found automatically in every app listed in INSTALLED_APPS
# (vehicles/tasks.py and reminders/tasks.py).
app.autodiscover_tasks()


def _beat_schedule():
    """Daily reminder sweep, expressed in the configured project timezone."""
    from django.conf import settings

    return {
        "daily-reminder-check": {
            # Referenced by name so this module never imports task code at
            # import time (Django apps may not be loaded yet).
            "task": "reminders.daily_reminder_check",
            "schedule": crontab(
                hour=settings.REMINDER_CHECK_HOUR,
                minute=settings.REMINDER_CHECK_MINUTE,
            ),
            "options": {"expires": 60 * 60 * 6},
        }
    }


app.conf.beat_schedule = _beat_schedule()


@app.task(bind=True, name="config.debug_task")
def debug_task(self):
    """Trivial task used to verify that a worker is alive."""
    return {"task_id": self.request.id, "status": "ok"}
