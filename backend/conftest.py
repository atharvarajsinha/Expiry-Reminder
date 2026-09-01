"""Shared pytest fixtures.

The test environment itself is set up in ``pytest_bootstrap.py`` (registered
through ``pytest.ini``) because it has to run before Django settings are
imported.
"""

from __future__ import annotations

import datetime as dt

import mongomock
import pytest
from rest_framework.test import APIClient

import pytest_bootstrap  # noqa: F401  (ensures the env is in place)

UTC = dt.timezone.utc


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def mongo_database():
    """Every test gets a clean in-memory MongoDB."""
    from core import mongo

    client = mongomock.MongoClient(tz_aware=True)
    database = client["expiry_reminder_test"]
    mongo.set_override_db(database)
    mongo.ensure_indexes(force=True)
    yield database
    client.drop_database("expiry_reminder_test")
    mongo.set_override_db(None)


@pytest.fixture(autouse=True)
def clear_cache():
    """Throttle counters must not leak between tests."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def settings_override():
    """Temporarily change Django settings inside one test."""
    from django.conf import settings as django_settings

    sentinel = object()
    originals = {}

    def apply(**changes):
        for key, value in changes.items():
            originals.setdefault(key, getattr(django_settings, key, sentinel))
            setattr(django_settings, key, value)

    yield apply

    for key, value in originals.items():
        if value is sentinel:
            delattr(django_settings, key)
        else:
            setattr(django_settings, key, value)


# ---------------------------------------------------------------------------
# HTTP clients
# ---------------------------------------------------------------------------
@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def credentials():
    return {"username": "admin", "password": "super-secret-test-password"}


@pytest.fixture
def auth_client(api_client, credentials):
    """A client authenticated through the cookie flow (CSRF header included)."""
    response = api_client.post("/api/auth/login/", credentials, format="json")
    assert response.status_code == 200, response.data
    csrf_token = response.data["data"]["csrf_token"]
    # Cookies are kept by the test client automatically; the CSRF header is
    # what a browser frontend would echo back.
    api_client.credentials(HTTP_X_CSRF_TOKEN=csrf_token)
    return api_client


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------
def days_from_now(days):
    """An ISO date ``days`` from today in the project timezone."""
    from core.dates import today_local

    return (today_local() + dt.timedelta(days=days)).isoformat()


@pytest.fixture
def iso_in():
    return days_from_now


@pytest.fixture
def vehicle_payload():
    """A valid ``POST /api/items/`` body for a vehicle."""
    return {
        "category": "vehicle",
        "name": "Honda CB Twister",
        "identifier": "UP25AK4922",
        "issuer": "National Insurance Company Ltd",
        "holder": "Rohit",
        "expiries": [
            {
                "key": "insurance",
                "expires_on": days_from_now(45),
                "reference": "26020131266730212340",
            },
            {"key": "pucc", "expires_on": days_from_now(200)},
        ],
    }


@pytest.fixture
def card_payload():
    return {
        "category": "credit_card",
        "name": "HDFC Millennia",
        "identifier": "4321",
        "issuer": "HDFC Bank",
        "expiries": [{"key": "card_expiry", "expires_on": days_from_now(90)}],
    }


@pytest.fixture
def stored_item(mongo_database, vehicle_payload):
    """Insert one item through the service layer and return the document."""
    from items import services

    return services.create_item(vehicle_payload)


class FakeResponse:
    """Minimal stand-in for ``requests.Response``."""

    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text

    def json(self):
        if self._json_data is None:
            raise ValueError("No JSON object could be decoded")
        return self._json_data


@pytest.fixture
def fake_response():
    return FakeResponse


@pytest.fixture
def sent_emails(monkeypatch):
    """Capture reminder emails instead of calling Brevo.

    Returns the list the sweep appends to, so a test can assert on exactly
    which reminders went out.
    """
    captured = []

    def fake_send(item, entry, recipient):
        captured.append(
            {
                "item": item,
                "entry": entry,
                "recipient": recipient,
            }
        )
        return "message-%d" % len(captured)

    monkeypatch.setattr("reminders.services.send_reminder_email", fake_send)
    return captured
