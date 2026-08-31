#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# One image, three roles.  Pick the role with the container command:
#
#   docker run ... vehicle-reminder web      -> Gunicorn (Django)
#   docker run ... vehicle-reminder worker   -> Celery worker
#   docker run ... vehicle-reminder beat     -> Celery Beat scheduler
#
# Anything else is executed verbatim, so `docker run ... sh` still works.
# ---------------------------------------------------------------------------
set -e

ROLE="${1:-web}"
PORT="${PORT:-8000}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-3}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-60}"
CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-2}"
CELERY_LOGLEVEL="${CELERY_LOGLEVEL:-info}"

case "$ROLE" in
  web)
    echo "Starting Gunicorn on port ${PORT}"
    exec gunicorn config.wsgi:application \
      --bind "0.0.0.0:${PORT}" \
      --workers "${WEB_CONCURRENCY}" \
      --timeout "${GUNICORN_TIMEOUT}" \
      --graceful-timeout 30 \
      --access-logfile - \
      --error-logfile - \
      --log-level info
    ;;
  worker)
    echo "Starting Celery worker"
    exec celery -A config worker \
      --loglevel "${CELERY_LOGLEVEL}" \
      --concurrency "${CELERY_CONCURRENCY}"
    ;;
  beat)
    echo "Starting Celery Beat"
    # The schedule file lives in /tmp so the container filesystem stays clean.
    exec celery -A config beat \
      --loglevel "${CELERY_LOGLEVEL}" \
      --schedule /tmp/celerybeat-schedule
    ;;
  *)
    exec "$@"
    ;;
esac
