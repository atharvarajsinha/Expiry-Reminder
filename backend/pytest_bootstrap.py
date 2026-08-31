"""Test environment bootstrap.

Loaded as a pytest plugin (``-p pytest_bootstrap`` in ``pytest.ini``) so that
these variables are in place *before* pytest-django imports
``config.settings``.  The suite therefore never touches a real MongoDB,
Redis, FireAPI or Brevo endpoint.
"""

from __future__ import annotations

import os

TEST_ENV = {
    "DEBUG": "False",
    "SECRET_KEY": "test-secret-key-value",
    "ALLOWED_HOSTS": "localhost,127.0.0.1,testserver",
    "APP_USERNAME": "admin",
    "APP_PASSWORD": "super-secret-test-password",
    "JWT_SECRET_KEY": "test-jwt-secret-key-value",
    "MONGODB_URI": "mongodb://localhost:27017/",
    "MONGODB_DATABASE": "vehicle_reminder_test",
    "MONGODB_TIMEOUT_MS": "500",
    "REDIS_URL": "redis://localhost:6379/15",
    "USE_REDIS_CACHE": "False",
    "CELERY_TASK_ALWAYS_EAGER": "True",
    "FIREAPI_URL": "https://api.fireapi.io/secure-app/rc-vehicle-info/v1",
    "FIREAPI_API_KEY": "test-fireapi-key",
    "FIREAPI_API_KEY_HEADER": "Authorization",
    "FIREAPI_API_KEY_PREFIX": "Bearer",
    "FIREAPI_TIMEOUT": "60",
    "FIREAPI_CONNECT_TIMEOUT": "10",
    "BREVO_API_KEY": "test-brevo-key",
    "BREVO_SENDER_EMAIL": "sender@example.com",
    "REMINDER_EMAIL": "owner@example.com",
    "REMINDER_OFFSETS_INSURANCE": "7,1,0",
    "REMINDER_OFFSETS_PUCC": "7,1,0",
    "AUTH_COOKIE_SECURE": "False",
    "AUTH_COOKIE_SAMESITE": "Lax",
    "TIME_ZONE": "Asia/Kolkata",
    "LOG_LEVEL": "CRITICAL",
    # Throttling must not interfere with the test suite.
    "THROTTLE_LOGIN": "1000/min",
    "THROTTLE_VEHICLE_FETCH": "1000/min",
    "THROTTLE_VEHICLE_REFRESH": "1000/min",
    "THROTTLE_READ": "1000/min",
}

# Override anything a developer happens to have exported locally.
for key, value in TEST_ENV.items():
    os.environ[key] = value

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
