#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# One role: the web server. Nothing in this image runs on a timer -- reminder
# email is sent when an external scheduler or uptime monitor hits
# /api/reminders/run/, so there is nothing else to start.
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
    # The access log format is the stock one with the query string removed
    # (%(U)s in place of %(r)s). The daily-check endpoint accepts its token as
    # ?token= for monitors that cannot send headers, and that secret must not
    # be written into the log line of every request.
    exec gunicorn config.wsgi:application \
      --bind "0.0.0.0:${PORT}" \
      --workers "${WEB_CONCURRENCY}" \
      --timeout "${GUNICORN_TIMEOUT}" \
      --graceful-timeout 30 \
      --access-logfile - \
      --access-logformat '%(h)s %(l)s %(u)s %(t)s "%(m)s %(U)s %(H)s" %(s)s %(b)s "%(f)s" "%(a)s"' \
      --error-logfile - \
      --log-level info
    ;;
  *)
    exec "$@"
    ;;
esac
