"""Project package.

Deliberately empty: there is no Celery application to import here, and nothing
in this process runs on a timer.  Reminder email is sent by an external cron
job that POSTs to ``/api/reminders/run/`` once a day, so a single web process
is the whole backend.
"""
