# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Production image.  One image, three roles (web / worker / beat) selected by
# the container command -- see entrypoint.sh and the README deployment notes.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings

WORKDIR /app

# curl is only needed for the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Never run as root.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/staticfiles /var/run/celery \
    && chown -R appuser:appuser /app /var/run/celery
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8000}/api/health/ || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["web"]
