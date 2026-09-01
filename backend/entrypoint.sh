#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# One role: the web server. The daily reminder sweep runs inside it (see
# core.middleware.ReminderSweepMiddleware), so there is nothing else to start.
#
# Anything other than `web` is executed verbatim, so `docker run ... sh` still
# works for a shell in the image.
# ---------------------------------------------------------------------------
set -e

ROLE="${1:-web}"
PORT="${PORT:-8000}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-3}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-60}"

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
  *)
    exec "$@"
    ;;
esac
