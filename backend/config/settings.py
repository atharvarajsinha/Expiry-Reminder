"""Django settings for the Vehicle Document Reminder backend.

Every secret and every environment specific value is read from the
environment (see ``.env.example``).  Nothing sensitive is hardcoded here.

This project deliberately does **not** use the Django ORM: MongoDB is the one
and only application database, so ``DATABASES`` is empty, there are no
migrations and ``django.contrib.auth`` / ``sessions`` / ``admin`` are not
installed.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


# ---------------------------------------------------------------------------
# Small env helpers
# ---------------------------------------------------------------------------
def env(name, default=None):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def env_bool(name, default=False):
    value = env(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name, default):
    value = env(name)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def env_list(name, default=""):
    raw = env(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_int_list(name, default):
    raw = env(name)
    if not raw:
        return list(default)
    values = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            values.append(int(item))
        except ValueError:
            continue
    return values or list(default)


# ---------------------------------------------------------------------------
# Core Django
# ---------------------------------------------------------------------------
SECRET_KEY = env("SECRET_KEY", "insecure-development-key-change-me")
DEBUG = env_bool("DEBUG", False)

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")
if DEBUG and not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["*"]

# Render / Railway inject the public hostname at runtime.
for _host_var in ("RENDER_EXTERNAL_HOSTNAME", "RAILWAY_PUBLIC_DOMAIN"):
    _host = env(_host_var)
    if _host and _host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_host)

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "authentication",
    "vehicles",
    "jobs",
    "reminders",
    "appsettings",
    "health",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "core.middleware.SecurityHeadersMiddleware",
    "core.middleware.RequestLogMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

# MongoDB is the only application database.  The Django ORM is unused, which
# is why this mapping is intentionally empty (no migrations, no SQLite file).
DATABASES = {}

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

TIME_ZONE = env("TIME_ZONE", "Asia/Kolkata")
USE_TZ = True
USE_I18N = False
LANGUAGE_CODE = "en-us"


# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGODB_URI = env("MONGODB_URI", "mongodb://localhost:27017/")
MONGODB_DATABASE = env("MONGODB_DATABASE", "vehicle_reminder")
MONGODB_TIMEOUT_MS = env_int("MONGODB_TIMEOUT_MS", 5000)


# ---------------------------------------------------------------------------
# Single-user authentication (credentials live in the environment only)
# ---------------------------------------------------------------------------
APP_USERNAME = env("APP_USERNAME", "admin")
APP_PASSWORD = env("APP_PASSWORD")

JWT_SECRET_KEY = env("JWT_SECRET_KEY") or SECRET_KEY
JWT_ALGORITHM = env("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_LIFETIME_MINUTES = env_int("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", 60)
JWT_REFRESH_TOKEN_LIFETIME_DAYS = env_int("JWT_REFRESH_TOKEN_LIFETIME_DAYS", 14)
JWT_ISSUER = env("JWT_ISSUER", "vehicle-reminder")

# Cookie based token storage (the frontend never touches localStorage).
AUTH_COOKIE_ACCESS_NAME = env("AUTH_COOKIE_ACCESS_NAME", "access_token")
AUTH_COOKIE_REFRESH_NAME = env("AUTH_COOKIE_REFRESH_NAME", "refresh_token")
AUTH_COOKIE_CSRF_NAME = env("AUTH_COOKIE_CSRF_NAME", "csrf_token")
AUTH_COOKIE_SECURE = env_bool("AUTH_COOKIE_SECURE", not DEBUG)
AUTH_COOKIE_SAMESITE = env("AUTH_COOKIE_SAMESITE", "Lax")
AUTH_COOKIE_DOMAIN = env("AUTH_COOKIE_DOMAIN")  # None => host-only cookie
AUTH_COOKIE_PATH = env("AUTH_COOKIE_PATH", "/")
# Also return the raw tokens in the login/refresh body (handy for curl and for
# non-browser clients).  Cookies are always set regardless of this flag.
AUTH_RETURN_TOKENS_IN_BODY = env_bool("AUTH_RETURN_TOKENS_IN_BODY", True)
# Double submit CSRF protection for cookie authenticated unsafe requests.
CSRF_PROTECTION_ENABLED = env_bool("CSRF_PROTECTION_ENABLED", True)
CSRF_HEADER_NAME = env("CSRF_HEADER_NAME", "X-CSRF-Token")


# ---------------------------------------------------------------------------
# FireAPI (external vehicle information provider)
# ---------------------------------------------------------------------------
FIREAPI_URL = env("FIREAPI_URL", "https://api.fireapi.io/secure-app/rc-vehicle-info/v1")
FIREAPI_API_KEY = env("FIREAPI_API_KEY")
# The exact header name may change, so it is configurable.
FIREAPI_API_KEY_HEADER = env("FIREAPI_API_KEY_HEADER", "Authorization")
# When the header is Authorization a scheme prefix is usually required.
FIREAPI_API_KEY_PREFIX = env("FIREAPI_API_KEY_PREFIX", "")
FIREAPI_QUERY_PARAM = env("FIREAPI_QUERY_PARAM", "vehicle_no")
FIREAPI_TIMEOUT = env_int("FIREAPI_TIMEOUT", 60)
FIREAPI_CONNECT_TIMEOUT = env_int("FIREAPI_CONNECT_TIMEOUT", 10)


# ---------------------------------------------------------------------------
# Brevo transactional email
# ---------------------------------------------------------------------------
BREVO_API_URL = env("BREVO_API_URL", "https://api.brevo.com/v3/smtp/email")
BREVO_API_KEY = env("BREVO_API_KEY")
BREVO_SENDER_EMAIL = env("BREVO_SENDER_EMAIL")
BREVO_SENDER_NAME = env("BREVO_SENDER_NAME", "Vehicle Reminder")
BREVO_TIMEOUT = env_int("BREVO_TIMEOUT", 30)
REMINDER_EMAIL = env("REMINDER_EMAIL")

# A document is shown as "Expiring Soon" this many days before expiry.
EXPIRING_SOON_DAYS = env_int("EXPIRING_SOON_DAYS", 30)

DEFAULT_REMINDER_OFFSETS = {
    "insurance": env_int_list("REMINDER_OFFSETS_INSURANCE", [7, 1, 0]),
    "pucc": env_int_list("REMINDER_OFFSETS_PUCC", [7, 1, 0]),
}


# ---------------------------------------------------------------------------
# Celery / Redis
# ---------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = env("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)
CELERY_TASK_TIME_LIMIT = env_int("CELERY_TASK_TIME_LIMIT", 300)
CELERY_TASK_SOFT_TIME_LIMIT = env_int("CELERY_TASK_SOFT_TIME_LIMIT", 270)

# Daily reminder sweep (local project timezone).
REMINDER_CHECK_HOUR = env_int("REMINDER_CHECK_HOUR", 9)
REMINDER_CHECK_MINUTE = env_int("REMINDER_CHECK_MINUTE", 0)


# ---------------------------------------------------------------------------
# Cache (used by DRF throttling; shared across processes when Redis is up)
# ---------------------------------------------------------------------------
if env_bool("USE_REDIS_CACHE", True) and REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "TIMEOUT": 300,
        }
    }
else:  # pragma: no cover - local fallback
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "vehicle-reminder",
        }
    }


# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "authentication.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "core.exception_handler.api_exception_handler",
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": env("THROTTLE_LOGIN", "10/min"),
        "vehicle_fetch": env("THROTTLE_VEHICLE_FETCH", "20/hour"),
        "vehicle_refresh": env("THROTTLE_VEHICLE_REFRESH", "30/hour"),
        "read": env("THROTTLE_READ", "240/min"),
    },
    "UNICODE_JSON": True,
}


# ---------------------------------------------------------------------------
# CORS (the frontend runs on a different origin and sends cookies)
# ---------------------------------------------------------------------------
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:5174")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS") or (
    [FRONTEND_URL] if FRONTEND_URL else []
)
print(CORS_ALLOWED_ORIGINS)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "origin",
    "user-agent",
    "x-requested-with",
    CSRF_HEADER_NAME.lower(),
]
CORS_ALLOW_METHODS = ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"]

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS") or [
    origin for origin in CORS_ALLOWED_ORIGINS if origin.startswith("http")
]


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", False)
if not DEBUG:
    SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True


# ---------------------------------------------------------------------------
# Logging.  ``core.logging.SensitiveDataFilter`` scrubs known secret values
# out of every log record as a last line of defence.
# ---------------------------------------------------------------------------
LOG_LEVEL = env("LOG_LEVEL", "INFO").upper()

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "scrub_secrets": {"()": "core.logging.SensitiveDataFilter"},
    },
    "formatters": {
        "standard": {"format": "%(asctime)s %(levelname)s [%(name)s] %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "filters": ["scrub_secrets"],
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "celery": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "pymongo": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "urllib3": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Setting names whose values must never appear in a log line.
SENSITIVE_SETTING_NAMES = [
    "SECRET_KEY",
    "JWT_SECRET_KEY",
    "APP_PASSWORD",
    "FIREAPI_API_KEY",
    "BREVO_API_KEY",
    "MONGODB_URI",
]
