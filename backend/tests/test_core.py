"""Expiry logic, identifier normalisation and the card-number guard."""

from __future__ import annotations

import datetime as dt

import pytest

from core.dates import (
    days_remaining,
    display_date,
    expiry_status,
    parse_date,
    reminder_type_for_offset,
    scheduled_for,
    worst_status,
)
from core.errors import ApiError
from core.validators import (
    clean_identifier,
    is_valid_vehicle_number,
    mask_identifier,
    normalize_vehicle_number,
    validate_card_last4,
    validate_vehicle_number,
)

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


class TestCardIdentifier:
    """A full card number must be refused, not quietly shortened."""

    @pytest.mark.parametrize("raw", ["4321", " 4321 ", "43 21", "43-21"])
    def test_four_digits_are_accepted(self, raw):
        assert validate_card_last4(raw) == "4321"

    @pytest.mark.parametrize(
        "raw",
        [
            "4111111111111111",
            "4111 1111 1111 1111",
            "4111-1111-1111-1111",
            "378282246310005",
        ],
    )
    def test_full_card_numbers_are_rejected(self, raw):
        with pytest.raises(ApiError) as excinfo:
            validate_card_last4(raw)
        assert excinfo.value.code == "CARD_NUMBER_REJECTED"
        # The rejection must not echo the number back to the caller.
        assert raw not in excinfo.value.message

    @pytest.mark.parametrize("raw", ["12", "12345", "abcd", "43a1"])
    def test_anything_that_is_not_four_digits_is_rejected(self, raw):
        with pytest.raises(ApiError) as excinfo:
            validate_card_last4(raw)
        assert excinfo.value.code == "CARD_NUMBER_REJECTED"

    @pytest.mark.parametrize("raw", [None, "", "   "])
    def test_blank_is_allowed(self, raw):
        assert validate_card_last4(raw) is None


class TestIdentifierHelpers:
    def test_whitespace_is_collapsed_and_length_capped(self):
        assert clean_identifier("  POL   2291045 ") == "POL 2291045"
        assert len(clean_identifier("x" * 200)) == 60

    def test_blank_becomes_none(self):
        assert clean_identifier("   ") is None
        assert clean_identifier(None) is None

    def test_masking_hides_the_middle(self):
        masked = mask_identifier("UP25AK4922")
        assert masked.startswith("UP25")
        assert masked.endswith("22")
        assert "AK49" not in masked


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
    def test_parsing_the_common_date_shapes(self, raw, expected):
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
        assert expiry_status(EXPIRY, dt.date(2026, 1, 1))["status"] == "valid"
        assert expiry_status(EXPIRY, dt.date(2027, 8, 5))["status"] == "expiring_soon"
        assert expiry_status(EXPIRY, dt.date(2027, 8, 12))["status"] == "expires_today"
        assert expiry_status(EXPIRY, dt.date(2027, 8, 13))["status"] == "expired"
        assert expiry_status(None)["status"] == "unknown"

    def test_status_labels_and_days(self):
        status = expiry_status(EXPIRY, TODAY)
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
