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
    database = client["vehicle_reminder_test"]
    mongo.set_override_db(database)
    mongo.ensure_indexes(force=True)
    yield database
    client.drop_database("vehicle_reminder_test")
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
@pytest.fixture
def fireapi_payload():
    """A realistic FireAPI success response."""
    return {
        "status": "success",
        "data": {
            "rc_version": "2.0.0",
            "rc_state_code": "UP",
            "rc_rto_code": "UP25",
            "rc_vehicle_no": "UP25AK4922",
            "rc_is_bh_no_plate": None,
            "rc_data_source": "MASTER_SERVER",
            "rc_regn_no": "UP25AK4922",
            "rc_regn_dt": "14/12/2010",
            "rc_owner_sr": "1",
            "rc_registered_at": "UP25, RTO",
            "rc_fit_upto": None,
            "rc_tax_upto": None,
            "rc_status_as_on": "30-Aug-2026",
            "rc_financer": None,
            "rc_insurance_comp": "National Insurance Company Ltd",
            "rc_insurance_policy_no": "26020131266730212340",
            "rc_insurance_upto": "2027-08-12",
            "rc_vch_catg": "2W",
            "rc_vh_class_desc": None,
            "rc_manu_month_yr": None,
            "rc_chasi_no": "JC47E0133748",
            "rc_eng_no": "ME4JC472LA8086146",
            "rc_cubic_cap": "50.00",
            "rc_maker_desc": "HONDA",
            "rc_maker_model": "CB TWISTER",
            "rc_owner_name": "ROHIT SRIVASTAVA",
            "rc_father_name": None,
            "rc_present_address": ", 999999",
            "rc_permanent_address": ", 999999",
            "rc_fuel_desc": "PETROL",
            "rc_wheelbase": None,
            "rc_seat_cap": "2",
            "rc_pucc_no": "UP02500590046455",
            "rc_pucc_upto": "22/02/2027",
        },
        "message": "Data found!",
    }


@pytest.fixture
def stored_vehicle(mongo_database):
    """Insert one vehicle directly and return its document."""
    from core import mongo
    from core.dates import now_utc, to_storage

    document = {
        "vehicle_no": "UP25AK4922",
        "registration_date": to_storage("2010-12-14"),
        "insurance": {
            "company": "National Insurance Company Ltd",
            "policy_no": "26020131266730212340",
            "expires_on": to_storage("2027-08-12"),
        },
        "vehicle_category": "2W",
        "chassis_no": "JC47E0133748",
        "engine_no": "ME4JC472LA8086146",
        "cubic_capacity": 50.0,
        "maker": "HONDA",
        "model": "CB TWISTER",
        "owner_name": "ROHIT SRIVASTAVA",
        "father_name": None,
        "fuel": "PETROL",
        "wheelbase": None,
        "seat_capacity": 2,
        "pucc": {
            "certificate_no": "UP02500590046455",
            "expires_on": to_storage("2027-02-22"),
        },
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "last_fetched_at": now_utc(),
    }
    result = mongo.vehicles_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return document


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
