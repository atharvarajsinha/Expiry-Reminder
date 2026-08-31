"""Reminder scheduling, duplicate prevention and Brevo delivery."""

from __future__ import annotations

import datetime as dt

import pytest
import requests

from appsettings import services as settings_services
from core import mongo
from core.dates import to_storage
from reminders import services
from reminders.email_service import EmailError, build_subject, send_reminder_email

TODAY = dt.date(2026, 8, 31)


@pytest.fixture
def sent_emails(monkeypatch):
    """Capture reminder emails instead of calling Brevo."""
    captured = []

    def fake_send(vehicle, document_type, expiry_date, days_remaining, recipient):
        captured.append(
            {
                "vehicle_no": vehicle.get("vehicle_no"),
                "document_type": document_type,
                "days_remaining": days_remaining,
                "recipient": recipient,
            }
        )
        return "message-%d" % len(captured)

    monkeypatch.setattr(services, "send_reminder_email", fake_send)
    return captured


def make_vehicle(insurance_expiry=None, pucc_expiry=None, vehicle_no="UP25AK4922"):
    document = {
        "vehicle_no": vehicle_no,
        "maker": "HONDA",
        "model": "CB TWISTER",
        "insurance": {
            "company": "National Insurance Company Ltd",
            "policy_no": "26020131266730212340",
            "expires_on": to_storage(insurance_expiry) if insurance_expiry else None,
        },
        "pucc": {
            "certificate_no": "UP02500590046455",
            "expires_on": to_storage(pucc_expiry) if pucc_expiry else None,
        },
    }
    result = mongo.vehicles_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return document


class TestDueCalculation:
    def test_seven_day_reminder_is_due(self, sent_emails):
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))

        summary = services.run_daily_check(today=TODAY)

        assert summary["sent"] == 1
        assert sent_emails[0]["days_remaining"] == 7
        stored = mongo.reminders_collection().find_one({"document_type": "insurance"})
        assert stored["reminder_type"] == "7_days"
        assert stored["sent"] is True
        assert stored["scheduled_for"].date() == TODAY

    def test_one_day_reminder_is_due(self, sent_emails):
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=1))

        services.run_daily_check(today=TODAY)

        stored = mongo.reminders_collection().find_one({})
        assert stored["reminder_type"] == "1_day"
        assert sent_emails[0]["days_remaining"] == 1

    def test_expiry_day_reminder_is_due(self, sent_emails):
        make_vehicle(insurance_expiry=TODAY)

        services.run_daily_check(today=TODAY)

        stored = mongo.reminders_collection().find_one({})
        assert stored["reminder_type"] == "expiry_day"
        assert sent_emails[0]["days_remaining"] == 0

    def test_nothing_is_sent_on_a_non_reminder_day(self, sent_emails):
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=5))

        summary = services.run_daily_check(today=TODAY)

        assert summary["due"] == 0
        assert summary["sent"] == 0
        assert sent_emails == []

    def test_expired_document_does_not_resend_the_expiry_day_reminder(self, sent_emails):
        make_vehicle(insurance_expiry=TODAY - dt.timedelta(days=3))

        summary = services.run_daily_check(today=TODAY)

        assert summary["due"] == 0
        assert sent_emails == []

    def test_pucc_reminders_are_independent(self, sent_emails):
        make_vehicle(
            insurance_expiry=TODAY + dt.timedelta(days=200),
            pucc_expiry=TODAY + dt.timedelta(days=7),
        )

        services.run_daily_check(today=TODAY)

        assert len(sent_emails) == 1
        assert sent_emails[0]["document_type"] == "pucc"

    def test_both_documents_can_be_due_on_the_same_day(self, sent_emails):
        make_vehicle(
            insurance_expiry=TODAY + dt.timedelta(days=7),
            pucc_expiry=TODAY + dt.timedelta(days=1),
        )

        summary = services.run_daily_check(today=TODAY)

        assert summary["sent"] == 2
        assert {item["document_type"] for item in sent_emails} == {"insurance", "pucc"}

    def test_configured_offsets_are_respected(self, sent_emails):
        settings_services.update_settings({"reminders": {"insurance": [3]}})
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=3))

        summary = services.run_daily_check(today=TODAY)

        assert summary["sent"] == 1
        stored = mongo.reminders_collection().find_one({})
        assert stored["reminder_type"] == "3_days"


class TestDuplicatePrevention:
    def test_running_twice_sends_only_one_email(self, sent_emails):
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))

        first = services.run_daily_check(today=TODAY)
        second = services.run_daily_check(today=TODAY)

        assert first["sent"] == 1
        assert second["sent"] == 0
        assert second["skipped_already_sent"] == 1
        assert len(sent_emails) == 1
        assert mongo.reminders_collection().count_documents({}) == 1

    def test_claiming_an_already_sent_reminder_returns_none(self):
        vehicle = make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))
        expiry = vehicle["insurance"]["expires_on"]

        first = services.claim_reminder(
            vehicle["_id"], "insurance", expiry, "7_days", 7
        )
        assert first is not None
        services.mark_sent(first, message_id="abc")

        assert services.claim_reminder(
            vehicle["_id"], "insurance", expiry, "7_days", 7
        ) is None

    def test_a_failed_send_can_be_retried_later(self, monkeypatch):
        def failing_send(*args, **kwargs):
            raise EmailError("EMAIL_SEND_FAILED", "Brevo is down", status_code=502)

        monkeypatch.setattr(services, "send_reminder_email", failing_send)
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))

        summary = services.run_daily_check(today=TODAY)

        assert summary["failed"] == 1
        assert summary["sent"] == 0
        stored = mongo.reminders_collection().find_one({})
        assert stored["sent"] is False
        assert stored["attempts"] == 1
        assert stored["last_error"] == "Brevo is down"

        # A later run retries the same reminder rather than skipping it.
        captured = []
        monkeypatch.setattr(
            services,
            "send_reminder_email",
            lambda *a, **k: captured.append(1) or "message-1",
        )
        retry_summary = services.run_daily_check(today=TODAY)

        assert retry_summary["sent"] == 1
        assert len(captured) == 1
        assert mongo.reminders_collection().count_documents({}) == 1

    def test_different_expiry_dates_are_separate_reminders(self, sent_emails):
        vehicle = make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))
        services.run_daily_check(today=TODAY)

        # Insurance renewed: a new expiry date means new reminders are allowed.
        new_expiry = TODAY + dt.timedelta(days=372)
        mongo.vehicles_collection().update_one(
            {"_id": vehicle["_id"]},
            {"$set": {"insurance.expires_on": to_storage(new_expiry)}},
        )
        later = new_expiry - dt.timedelta(days=7)

        summary = services.run_daily_check(today=later)

        assert summary["sent"] == 1
        assert mongo.reminders_collection().count_documents({}) == 2


class TestReminderApi:
    def test_history_endpoint_lists_reminders(self, auth_client, sent_emails):
        make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))
        services.run_daily_check(today=TODAY)

        response = auth_client.get("/api/reminders/")

        assert response.status_code == 200
        items = response.json()["data"]
        assert len(items) == 1
        assert items[0]["reminder_type"] == "7_days"
        assert items[0]["sent"] is True

    def test_history_requires_authentication(self, api_client):
        assert api_client.get("/api/reminders/").status_code == 401


class TestBrevoEmail:
    def test_subject_lines(self):
        assert build_subject("UP25AK4922", "insurance", 7) == (
            "Vehicle UP25AK4922 Insurance expires in 7 days"
        )
        assert build_subject("UP25AK4922", "insurance", 1) == (
            "Vehicle UP25AK4922 Insurance expires tomorrow"
        )
        assert build_subject("UP25AK4922", "pucc", 0) == (
            "Vehicle UP25AK4922 PUC expires today"
        )

    def test_payload_sent_to_brevo(self, monkeypatch, fake_response):
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return fake_response(201, {"messageId": "brevo-123"})

        monkeypatch.setattr("reminders.email_service.requests.post", fake_post)
        vehicle = make_vehicle(insurance_expiry=TODAY + dt.timedelta(days=7))

        message_id = send_reminder_email(
            vehicle, "insurance", vehicle["insurance"]["expires_on"], 7, "owner@example.com"
        )

        assert message_id == "brevo-123"
        assert captured["headers"]["api-key"] == "test-brevo-key"
        body = captured["json"]
        assert body["to"] == [{"email": "owner@example.com"}]
        assert body["subject"] == "Vehicle UP25AK4922 Insurance expires in 7 days"
        assert "UP25AK4922" in body["htmlContent"]
        assert "National Insurance Company Ltd" in body["htmlContent"]
        assert "26020131266730212340" in body["textContent"]
        assert "7 days" in body["textContent"]

    def test_brevo_error_is_wrapped(self, monkeypatch, fake_response):
        monkeypatch.setattr(
            "reminders.email_service.requests.post",
            lambda *a, **k: fake_response(400, {"message": "bad request"}),
        )
        vehicle = make_vehicle(insurance_expiry=TODAY)

        with pytest.raises(EmailError) as excinfo:
            send_reminder_email(
                vehicle, "insurance", vehicle["insurance"]["expires_on"], 0, "owner@example.com"
            )

        assert excinfo.value.code == "EMAIL_SEND_FAILED"

    def test_brevo_timeout_is_wrapped(self, monkeypatch):
        def raise_timeout(*args, **kwargs):
            raise requests.exceptions.Timeout()

        monkeypatch.setattr("reminders.email_service.requests.post", raise_timeout)
        vehicle = make_vehicle(insurance_expiry=TODAY)

        with pytest.raises(EmailError):
            send_reminder_email(
                vehicle, "insurance", vehicle["insurance"]["expires_on"], 0, "owner@example.com"
            )

    def test_missing_configuration_is_reported(self, monkeypatch, settings_override):
        vehicle = make_vehicle(insurance_expiry=TODAY)
        settings_override(BREVO_API_KEY=None)

        with pytest.raises(EmailError) as excinfo:
            send_reminder_email(
                vehicle, "insurance", vehicle["insurance"]["expires_on"], 0, "owner@example.com"
            )

        assert excinfo.value.code == "EMAIL_NOT_CONFIGURED"
