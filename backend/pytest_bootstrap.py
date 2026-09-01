"""Test environment bootstrap.

Loaded as a pytest plugin (``-p pytest_bootstrap`` in ``pytest.ini``) so that
these variables are in place *before* pytest-django imports ``config.settings``.
The suite therefore never touches a real MongoDB or Brevo endpoint.
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
    "MONGODB_DATABASE": "expiry_reminder_test",
    "MONGODB_TIMEOUT_MS": "500",
    "BREVO_API_KEY": "test-brevo-key",
    "BREVO_SENDER_EMAIL": "sender@example.com",
    "REMINDER_EMAIL": "owner@example.com",
    "REMINDER_OFFSETS": "30,7,1,0",
    "CRON_TOKEN": "test-cron-token",
    # The sweep is triggered explicitly in the tests that care about it; a
    # middleware firing on every request would hide which call did what.
    "REMINDER_SWEEP_ON_REQUEST": "False",
    "AUTH_COOKIE_SECURE": "False",
    "AUTH_COOKIE_SAMESITE": "Lax",
    "TIME_ZONE": "Asia/Kolkata",
    "LOG_LEVEL": "CRITICAL",
    # Throttling must not interfere with the test suite.
    "THROTTLE_LOGIN": "1000/min",
    "THROTTLE_READ": "1000/min",
    "THROTTLE_WRITE": "1000/min",
}

# Override anything a developer happens to have exported locally.
for key, value in TEST_ENV.items():
    os.environ[key] = value

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
