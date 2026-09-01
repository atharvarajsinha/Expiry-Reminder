"""Project package.

Deliberately empty: there is no Celery application to import here.  The daily
reminder sweep is driven by ``core.middleware.ReminderSweepMiddleware`` and by
``POST /api/reminders/run/``, so a single web process is the whole backend.
"""
