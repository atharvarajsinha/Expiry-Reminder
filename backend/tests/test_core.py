"""Expiry logic, vehicle number normalisation and FireAPI response mapping."""

from __future__ import annotations

import datetime as dt

import pytest
import requests

from core.dates import (
    display_date,
    document_status,
    days_remaining,
    parse_date,
    reminder_type_for_offset,
    scheduled_for,
    worst_status,
)
from core.errors import ApiError
from core.validators import is_valid_vehicle_number, normalize_vehicle_number, validate_vehicle_number
from vehicles.fireapi import FireApiError, fetch_vehicle_info
from vehicles.normalizers import merge_for_refresh, normalize_vehicle_payload

TODAY = dt.date(2027, 8, 5)
EXPIRY = dt.date(2027, 8, 12)


class TestVehicleNumber:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("up25ak4922", "UP25AK4922"),
            ("UP25 AK 4922", "UP25AK4922"),
            ("up-25-ak-4922", "UP25AK4922"),
            ("  UP25AK4922  ", "UP25AK4922"),
        ],
    )
    def test_normalisation(self, raw, expected):
        assert normalize_vehicle_number(raw) == expected

    @pytest.mark.parametrize(
        "number",
        ["UP25AK4922", "DL8CAF5031", "MH12AB1234", "KA01A1234", "22BH1234AB"],
    )
    def test_valid_formats_are_accepted(self, number):
        assert is_valid_vehicle_number(number) is True

    @pytest.mark.parametrize("number", ["", "AB", "!!!!", "1234567890123", "$$UP25$$"])
    def test_invalid_formats_are_rejected(self, number):
        assert is_valid_vehicle_number(number) is False

    def test_validate_raises_for_garbage(self):
        with pytest.raises(ApiError) as excinfo:
            validate_vehicle_number("???")
        assert excinfo.value.code == "INVALID_VEHICLE_NUMBER"


class TestDates:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("2027-08-12", dt.date(2027, 8, 12)),
            ("14/12/2010", dt.date(2010, 12, 14)),
            ("22/02/2027", dt.date(2027, 2, 22)),
            ("30-Aug-2026", dt.date(2026, 8, 30)),
            ("2027-08-12T00:00:00Z", dt.date(2027, 8, 12)),
        ],
    )
    def test_parsing_the_fireapi_date_shapes(self, raw, expected):
        assert parse_date(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "NA", "null", "not a date"])
    def test_unusable_dates_become_none(self, raw):
        assert parse_date(raw) is None

    def test_days_remaining(self):
        assert days_remaining(EXPIRY, today=dt.date(2027, 8, 5)) == 7
        assert days_remaining(EXPIRY, today=dt.date(2027, 8, 11)) == 1
        assert days_remaining(EXPIRY, today=dt.date(2027, 8, 12)) == 0
        assert days_remaining(EXPIRY, today=dt.date(2027, 8, 13)) == -1

    def test_status_transitions(self):
        assert document_status(EXPIRY, dt.date(2026, 1, 1))["status"] == "valid"
        assert document_status(EXPIRY, dt.date(2027, 8, 5))["status"] == "expiring_soon"
        assert document_status(EXPIRY, dt.date(2027, 8, 12))["status"] == "expires_today"
        assert document_status(EXPIRY, dt.date(2027, 8, 13))["status"] == "expired"
        assert document_status(None)["status"] == "unknown"

    def test_status_labels_and_days(self):
        status = document_status(EXPIRY, TODAY)
        assert status["label"] == "Expiring Soon"
        assert status["days_remaining"] == 7
        assert status["expires_on"] == "2027-08-12"

    def test_worst_status_wins(self):
        assert worst_status(["valid", "expired"]) == "expired"
        assert worst_status(["valid", "expiring_soon"]) == "expiring_soon"
        assert worst_status(["valid", "valid"]) == "valid"
        assert worst_status([]) == "unknown"

    def test_reminder_type_naming(self):
        assert reminder_type_for_offset(7) == "7_days"
        assert reminder_type_for_offset(1) == "1_day"
        assert reminder_type_for_offset(0) == "expiry_day"

    def test_scheduled_dates(self):
        assert scheduled_for(EXPIRY, 7) == dt.date(2027, 8, 5)
        assert scheduled_for(EXPIRY, 1) == dt.date(2027, 8, 11)
        assert scheduled_for(EXPIRY, 0) == EXPIRY

    def test_display_date(self):
        assert display_date("2027-08-12") == "12 August 2027"


class TestNormalizer:
    def test_fireapi_payload_is_mapped_to_app_fields(self, fireapi_payload):
        result = normalize_vehicle_payload(fireapi_payload["data"])

        assert result["vehicle_no"] == "UP25AK4922"
        assert result["registration_date"].date() == dt.date(2010, 12, 14)
        assert result["insurance"]["company"] == "National Insurance Company Ltd"
        assert result["insurance"]["expires_on"].date() == dt.date(2027, 8, 12)
        assert result["pucc"]["expires_on"].date() == dt.date(2027, 2, 22)
        assert result["cubic_capacity"] == 50.0
        assert result["seat_capacity"] == 2
        assert result["father_name"] is None
        assert result["wheelbase"] is None
        # No rc_* naming survives the mapping.
        assert not any(key.startswith("rc_") for key in result)

    def test_empty_placeholder_values_become_none(self):
        result = normalize_vehicle_payload(
            {"rc_regn_no": "UP25AK4922", "rc_maker_desc": "NA", "rc_seat_cap": ""}
        )
        assert result["maker"] is None
        assert result["seat_capacity"] is None

    def test_merge_never_overwrites_with_none(self):
        existing = {
            "maker": "HONDA",
            "insurance": {"company": "ABC", "policy_no": "123", "expires_on": None},
        }
        incoming = {
            "maker": None,
            "model": "CB TWISTER",
            "insurance": {"company": None, "policy_no": None, "expires_on": None},
            "pucc": {"certificate_no": "XYZ", "expires_on": None},
        }

        update = merge_for_refresh(existing, incoming)

        assert "maker" not in update
        assert update["model"] == "CB TWISTER"
        assert update["insurance"]["company"] == "ABC"
        assert update["insurance"]["policy_no"] == "123"
        assert update["pucc"]["certificate_no"] == "XYZ"


class TestFireApiClient:
    def _mock(self, monkeypatch, response=None, exception=None):
        def fake_get(*args, **kwargs):
            if exception is not None:
                raise exception
            return response

        monkeypatch.setattr("vehicles.fireapi.requests.get", fake_get)

    def test_success_returns_the_data_block(self, monkeypatch, fireapi_payload, fake_response):
        self._mock(monkeypatch, fake_response(200, fireapi_payload))

        data = fetch_vehicle_info("UP25AK4922")

        assert data["rc_maker_desc"] == "HONDA"

    def test_api_key_travels_in_the_configured_header(
        self, monkeypatch, fireapi_payload, fake_response
    ):
        captured = {}

        def fake_get(url, params=None, headers=None, timeout=None):
            captured.update(
                {"url": url, "params": params, "headers": headers, "timeout": timeout}
            )
            return fake_response(200, fireapi_payload)

        monkeypatch.setattr("vehicles.fireapi.requests.get", fake_get)

        fetch_vehicle_info("UP25AK4922")

        assert captured["params"] == {"vehicle_no": "UP25AK4922"}
        assert captured["headers"]["Authorization"] == "Bearer test-fireapi-key"
        # A sensible (connect, read) timeout is always applied.
        assert captured["timeout"] == (10, 60)

    def test_timeout(self, monkeypatch):
        self._mock(monkeypatch, exception=requests.exceptions.Timeout())
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert excinfo.value.code == "VEHICLE_API_TIMEOUT"

    def test_connection_error(self, monkeypatch):
        self._mock(monkeypatch, exception=requests.exceptions.ConnectionError())
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert excinfo.value.code == "VEHICLE_API_UNAVAILABLE"

    def test_rate_limited(self, monkeypatch, fake_response):
        self._mock(monkeypatch, fake_response(429, {"message": "slow down"}))
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert excinfo.value.code == "VEHICLE_API_RATE_LIMITED"

    def test_not_found(self, monkeypatch, fake_response):
        self._mock(monkeypatch, fake_response(404, {"message": "not found"}))
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP99XX9999")
        assert excinfo.value.code == "VEHICLE_NOT_FOUND_UPSTREAM"

    def test_invalid_json(self, monkeypatch, fake_response):
        self._mock(monkeypatch, fake_response(200, None, text="<html>oops</html>"))
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert excinfo.value.code == "VEHICLE_API_INVALID_RESPONSE"

    def test_unexpected_structure(self, monkeypatch, fake_response):
        self._mock(monkeypatch, fake_response(200, {"status": "success", "data": []}))
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert excinfo.value.code == "VEHICLE_API_INVALID_RESPONSE"

    def test_missing_api_key_is_reported(self, monkeypatch, settings_override):
        settings_override(FIREAPI_API_KEY=None)
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert excinfo.value.code == "VEHICLE_API_NOT_CONFIGURED"

    def test_errors_never_leak_the_api_key(self, monkeypatch, fake_response):
        self._mock(monkeypatch, fake_response(403, {"message": "forbidden"}))
        with pytest.raises(FireApiError) as excinfo:
            fetch_vehicle_info("UP25AK4922")
        assert "test-fireapi-key" not in excinfo.value.message
