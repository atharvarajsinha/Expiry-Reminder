"""The reminder engine: derived schedules, duplicate prevention, delivery.

The interesting property under test is that nothing here needs a worker or a
scheduler.  "What is due" is a pure function of the items and the offsets, and
running the sweep twice in a day sends one email, not two.
"""

from __future__ import annotations

import datetime as dt

import pytest
import requests

from appsettings import services as settings_services
from core import mongo
from core.dates import project_timezone, to_storage, today_local
from items import services as item_services
from reminders import services
from reminders.email_service import EmailError, build_subject, send_reminder_email

TODAY = dt.date(2026, 8, 31)


def make_item(expiries, category="vehicle", name="Honda CB Twister", identifier=None):
    """Insert an item directly, dodging the API so dates can be in the past."""
    entries = [
        {
            "key": key,
            "label": None,
            "expires_on": to_storage(date),
            "issued_on": None,
            "reference": None,
        }
        for key, date in expiries
    ]
    entries.sort(key=lambda entry: entry["expires_on"])
    document = {
        "category": category,
        "name": name,
        "identifier": identifier,
        "identifier_key": identifier.lower() if identifier else None,
        "issuer": "National Insurance Company Ltd",
        "holder": None,
        "notes": None,
        "expiries": entries,
        "next_expiry_on": entries[0]["expires_on"] if entries else None,
    }
    result = mongo.items_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return document


def offsets(**by_category):
    by_category.setdefault("default", [7, 1, 0])
    return by_category


class TestDueCalculation:
    def test_a_reminder_is_due_exactly_on_its_offset_day(self):
        item = make_item([("insurance", TODAY + dt.timedelta(days=7))])

        due = services.due_reminders(item, TODAY, offsets())

        assert len(due) == 1
        assert due[0]["reminder_type"] == "7_days"
        assert due[0]["days_remaining"] == 7
        assert due[0]["expiry_label"] == "Insurance"

    @pytest.mark.parametrize("days", [2, 3, 6, 8, 30])
    def test_nothing_is_due_between_the_offsets(self, days):
        item = make_item([("insurance", TODAY + dt.timedelta(days=days))])
        assert services.due_reminders(item, TODAY, offsets()) == []

    def test_the_expiry_day_itself_is_due(self):
        item = make_item([("insurance", TODAY)])
        due = services.due_reminders(item, TODAY, offsets())
        assert [entry["reminder_type"] for entry in due] == ["expiry_day"]

    def test_an_already_expired_date_never_emails_again(self):
        # It stays visible in the app as "expired"; it just stops nagging.
        item = make_item([("insurance", TODAY - dt.timedelta(days=1))])
        assert services.due_reminders(item, TODAY, offsets()) == []

    def test_every_expiry_on_one_item_is_considered(self):
        item = make_item(
            [
                ("insurance", TODAY + dt.timedelta(days=7)),
                ("pucc", TODAY + dt.timedelta(days=1)),
                ("fitness", TODAY + dt.timedelta(days=400)),
            ]
        )

        due = services.due_reminders(item, TODAY, offsets())

        assert {entry["expiry_key"] for entry in due} == {"insurance", "pucc"}

    def test_offsets_are_looked_up_per_category(self):
        card = make_item(
            [("card_expiry", TODAY + dt.timedelta(days=30))],
            category="credit_card",
            name="HDFC Millennia",
        )
        by_category = offsets(credit_card=[30], vehicle=[7, 1, 0])

        assert len(services.due_reminders(card, TODAY, by_category)) == 1

    def test_a_category_with_no_offsets_is_left_alone(self):
        card = make_item(
            [("card_expiry", TODAY)], category="credit_card", name="HDFC Millennia"
        )
        assert services.due_reminders(card, TODAY, offsets(credit_card=[])) == []

    def test_an_unlisted_category_falls_back_to_the_default(self):
        item = make_item(
            [("renewal", TODAY + dt.timedelta(days=1))],
            category="subscription",
            name="example.com",
        )
        assert len(services.due_reminders(item, TODAY, offsets())) == 1


class TestUpcomingSchedule:
    """The schedule is derived, so it always matches what the sweep will do."""

    def test_it_lists_every_future_send_date(self):
        make_item([("insurance", TODAY + dt.timedelta(days=10))])
        settings_services.update_settings({"reminders": {"default": [7, 1, 0]}})

        upcoming = services.upcoming_reminders(today=TODAY)

        assert [entry["days_until_send"] for entry in upcoming] == [3, 9, 10]
        assert [entry["send_on"] for entry in upcoming] == [
            (TODAY + dt.timedelta(days=3)).isoformat(),
            (TODAY + dt.timedelta(days=9)).isoformat(),
            (TODAY + dt.timedelta(days=10)).isoformat(),
        ]
        assert upcoming[0]["item_name"] == "Honda CB Twister"
        assert upcoming[0]["expiry_label"] == "Insurance"

    def test_send_dates_that_have_already_passed_are_left_out(self):
        # Expiring in 3 days: the 7-day reminder's send date is behind us.
        make_item([("insurance", TODAY + dt.timedelta(days=3))])
        settings_services.update_settings({"reminders": {"default": [7, 1, 0]}})

        upcoming = services.upcoming_reminders(today=TODAY)

        assert [entry["offset"] for entry in upcoming] == [1, 0]

    def test_expired_items_contribute_nothing(self):
        make_item([("insurance", TODAY - dt.timedelta(days=5))])
        assert services.upcoming_reminders(today=TODAY) == []

    def test_it_is_sorted_by_send_date(self):
        make_item([("insurance", TODAY + dt.timedelta(days=20))], identifier="UP25AK4922")
        make_item(
            [("valid_until", TODAY + dt.timedelta(days=2))],
            category="document",
            name="Passport",
        )
        settings_services.update_settings({"reminders": {"default": [7, 1, 0]}})

        upcoming = services.upcoming_reminders(today=TODAY)

        send_dates = [entry["send_on"] for entry in upcoming]
        assert send_dates == sorted(send_dates)
        assert upcoming[0]["item_name"] == "Passport"


class TestSweep:
    def test_a_due_reminder_is_sent_and_recorded(self, sent_emails):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        summary = services.run_sweep(today=TODAY)

        assert summary["due"] == 1
        assert summary["sent"] == 1
        assert summary["failed"] == 0
        assert len(sent_emails) == 1
        assert sent_emails[0]["recipient"] == "owner@example.com"

        record = mongo.reminders_collection().find_one({})
        assert record["sent"] is True
        assert record["attempts"] == 1
        assert record["reminder_type"] == "7_days"

    def test_running_it_twice_sends_one_email(self, sent_emails):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        first = services.run_sweep(today=TODAY)
        second = services.run_sweep(today=TODAY)

        assert first["sent"] == 1
        assert second["sent"] == 0
        assert second["skipped_already_sent"] == 1
        assert len(sent_emails) == 1
        assert mongo.reminders_collection().count_documents({}) == 1

    def test_each_offset_produces_its_own_reminder(self, sent_emails):
        item = make_item([("insurance", TODAY + dt.timedelta(days=7))])
        expiry = TODAY + dt.timedelta(days=7)

        services.run_sweep(today=TODAY)  # 7 days before
        services.run_sweep(today=expiry - dt.timedelta(days=1))  # 1 day before
        services.run_sweep(today=expiry)  # on the day

        assert len(sent_emails) == 3
        assert {r["reminder_type"] for r in mongo.reminders_collection().find({})} == {
            "7_days",
            "1_day",
            "expiry_day",
        }

    def test_a_failed_send_is_retried_on_the_next_run(self, monkeypatch):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        attempts = {"count": 0}

        def flaky(item, entry, recipient):
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise EmailError("EMAIL_SEND_FAILED", "Brevo is down.", 502)
            return "message-2"

        monkeypatch.setattr(services, "send_reminder_email", flaky)

        first = services.run_sweep(today=TODAY)
        assert first["failed"] == 1
        record = mongo.reminders_collection().find_one({})
        assert record["sent"] is False
        assert record["last_error"] == "Brevo is down."

        second = services.run_sweep(today=TODAY)
        assert second["sent"] == 1
        record = mongo.reminders_collection().find_one({})
        assert record["sent"] is True
        assert record["attempts"] == 2

    def test_one_failure_does_not_stop_the_others(self, monkeypatch):
        make_item([("insurance", TODAY + dt.timedelta(days=7))], identifier="UP25AK4922")
        make_item(
            [("valid_until", TODAY + dt.timedelta(days=7))],
            category="document",
            name="Passport",
        )

        def selective(item, entry, recipient):
            if item["name"] == "Passport":
                raise EmailError("EMAIL_SEND_FAILED", "Nope.", 502)
            return "message-1"

        monkeypatch.setattr(services, "send_reminder_email", selective)

        summary = services.run_sweep(today=TODAY)

        assert summary["due"] == 2
        assert summary["sent"] == 1
        assert summary["failed"] == 1

    def test_no_recipient_means_no_send_and_no_crash(
        self, sent_emails, settings_override
    ):
        settings_override(REMINDER_EMAIL=None)
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        summary = services.run_sweep(today=TODAY)

        assert summary["sent"] == 0
        assert "error" in summary
        assert sent_emails == []


def at(hour, day=None):
    """A timezone-aware "now" in the project timezone, for the sweep gate."""
    base = day or TODAY
    return dt.datetime(base.year, base.month, base.day, hour, tzinfo=project_timezone())


class TestScheduledSweep:
    """The gate that turns an interval pinger into a 9am daily job.

    The realistic trigger is an uptime monitor hitting the endpoint every few
    minutes, so "once a day, not before REMINDER_HOUR" has to hold here.
    """

    def test_nothing_happens_before_the_configured_hour(self, sent_emails):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        outcome = services.run_scheduled_sweep(now=at(8))

        assert outcome["ran"] is False
        assert outcome["reason"] == "before_window"
        assert outcome["runs_at_hour"] == 9
        assert sent_emails == []
        # Nothing was claimed, so the 9am run still happens.
        assert services.sweep_state()["last_run_date"] is None

    def test_it_runs_at_the_configured_hour(self, sent_emails):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        outcome = services.run_scheduled_sweep(now=at(9))

        assert outcome["ran"] is True
        assert outcome["sent"] == 1
        assert len(sent_emails) == 1
        assert services.sweep_state()["last_run_date"] == TODAY.isoformat()

    def test_a_pinger_hitting_it_all_day_sends_once(self, sent_emails):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        # Every five minutes from 08:00 to 23:00, near enough.
        outcomes = [services.run_scheduled_sweep(now=at(hour)) for hour in range(8, 24)]

        assert sum(1 for o in outcomes if o["ran"]) == 1
        assert len(sent_emails) == 1
        assert outcomes[0]["reason"] == "before_window"   # 08:00
        assert outcomes[1]["reason"] == "ran"             # 09:00
        assert outcomes[2]["reason"] == "already_ran"     # 10:00

    def test_the_next_day_runs_again(self, sent_emails):
        expiry = TODAY + dt.timedelta(days=7)
        make_item([("insurance", expiry)])

        assert services.run_scheduled_sweep(now=at(9))["ran"] is True
        assert services.run_scheduled_sweep(now=at(15))["ran"] is False

        # Six days on, the "1 day before" reminder falls due.
        tomorrow = services.run_scheduled_sweep(
            now=at(9, day=expiry - dt.timedelta(days=1))
        )
        assert tomorrow["ran"] is True
        assert tomorrow["sent"] == 1

    def test_the_hour_is_configurable(self, sent_emails, settings_override):
        settings_override(REMINDER_HOUR=6)
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        assert services.run_scheduled_sweep(now=at(5))["ran"] is False
        assert services.run_scheduled_sweep(now=at(6))["ran"] is True

    def test_a_manual_run_does_not_consume_the_days_slot(self, sent_emails):
        # Pressing "Send Due Now" at 08:00 must not cancel the 09:00 check --
        # an item added in between would otherwise wait until tomorrow.
        services.run_sweep(today=TODAY)

        assert services.sweep_state()["last_run_date"] is None
        assert services.run_scheduled_sweep(now=at(9))["ran"] is True


class TestSweepState:
    """The cron job is the only scheduled caller, so "did it run?" matters."""

    def test_a_scheduled_run_records_when_it_happened(self, sent_emails):
        assert services.sweep_state() == {"last_run_date": None, "last_run_at": None}

        services.run_scheduled_sweep(now=at(9))

        state = services.sweep_state()
        assert state["last_run_date"] == TODAY.isoformat()
        assert state["last_run_at"] is not None

    def test_a_run_with_nothing_due_still_records(self, sent_emails):
        # Otherwise a quiet week is indistinguishable from a pinger that has
        # stopped firing, which is the failure this marker exists to surface.
        make_item([("insurance", TODAY + dt.timedelta(days=200))])

        outcome = services.run_scheduled_sweep(now=at(9))

        assert outcome["sent"] == 0
        assert services.sweep_state()["last_run_date"] == TODAY.isoformat()

    def test_the_marker_moves_forward_on_the_next_run(self, sent_emails):
        services.run_scheduled_sweep(now=at(9))
        services.run_scheduled_sweep(now=at(9, day=TODAY + dt.timedelta(days=1)))

        assert services.sweep_state()["last_run_date"] == (
            TODAY + dt.timedelta(days=1)
        ).isoformat()

    def test_running_the_sweep_twice_still_sends_once(self, sent_emails):
        # The unique reminder index is what prevents duplicate mail -- not the
        # marker -- so two overlapping runs are harmless.
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        services.run_sweep(today=TODAY)
        services.run_sweep(today=TODAY)

        assert len(sent_emails) == 1


class TestEmailComposition:
    def test_the_subject_names_the_item_and_the_urgency(self):
        item = {"name": "Passport", "category": "document"}
        entry = {"expiry_label": "Valid until", "days_remaining": 7}

        assert build_subject(item, entry) == "Passport -- Valid until expires in 7 days"

    @pytest.mark.parametrize(
        "days,expected",
        [(0, "expires today"), (1, "expires tomorrow"), (30, "expires in 30 days")],
    )
    def test_urgency_wording(self, days, expected):
        item = {"name": "Passport", "category": "document"}
        entry = {"expiry_label": "Valid until", "days_remaining": days}
        assert expected in build_subject(item, entry)

    def test_a_card_identifier_is_shown_masked(self, monkeypatch, fake_response):
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update(json)
            return fake_response(201, {"messageId": "abc"})

        monkeypatch.setattr("reminders.email_service.requests.post", fake_post)

        send_reminder_email(
            {"name": "HDFC Millennia", "category": "credit_card", "identifier": "4321"},
            {
                "expiry_key": "card_expiry",
                "expiry_label": "Card expiry",
                "expiry_date": TODAY,
                "days_remaining": 7,
                "reference": None,
            },
            "owner@example.com",
        )

        assert "**** 4321" in captured["htmlContent"]


class TestBrevoDelivery:
    def _entry(self):
        return {
            "expiry_key": "insurance",
            "expiry_label": "Insurance",
            "expiry_date": TODAY,
            "days_remaining": 7,
            "reference": "26020131266730212340",
        }

    def _item(self):
        return {"name": "Honda CB Twister", "category": "vehicle", "identifier": "UP25AK4922"}

    def test_a_successful_send_returns_the_message_id(self, monkeypatch, fake_response):
        monkeypatch.setattr(
            "reminders.email_service.requests.post",
            lambda *a, **k: fake_response(201, {"messageId": "brevo-123"}),
        )
        assert (
            send_reminder_email(self._item(), self._entry(), "owner@example.com")
            == "brevo-123"
        )

    def test_the_api_key_travels_only_in_the_header(self, monkeypatch, fake_response):
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update({"json": json, "headers": headers})
            return fake_response(201, {"messageId": "brevo-123"})

        monkeypatch.setattr("reminders.email_service.requests.post", fake_post)

        send_reminder_email(self._item(), self._entry(), "owner@example.com")

        assert captured["headers"]["api-key"] == "test-brevo-key"
        assert "test-brevo-key" not in str(captured["json"])

    def test_a_timeout_is_reported_as_a_send_failure(self, monkeypatch):
        monkeypatch.setattr(
            "reminders.email_service.requests.post",
            lambda *a, **k: (_ for _ in ()).throw(requests.exceptions.Timeout()),
        )
        with pytest.raises(EmailError) as excinfo:
            send_reminder_email(self._item(), self._entry(), "owner@example.com")
        assert excinfo.value.code == "EMAIL_SEND_FAILED"

    def test_an_error_response_never_leaks_the_key(self, monkeypatch, fake_response):
        monkeypatch.setattr(
            "reminders.email_service.requests.post",
            lambda *a, **k: fake_response(401, {"message": "bad key"}),
        )
        with pytest.raises(EmailError) as excinfo:
            send_reminder_email(self._item(), self._entry(), "owner@example.com")
        assert "test-brevo-key" not in excinfo.value.message

    def test_missing_configuration_is_reported_clearly(
        self, monkeypatch, settings_override
    ):
        settings_override(BREVO_API_KEY=None)
        with pytest.raises(EmailError) as excinfo:
            send_reminder_email(self._item(), self._entry(), "owner@example.com")
        assert excinfo.value.code == "EMAIL_NOT_CONFIGURED"
        assert "BREVO_API_KEY" in excinfo.value.message


class TestReminderApi:
    def test_the_routes_need_a_session(self, api_client):
        assert api_client.get("/api/reminders/").status_code == 401
        assert api_client.get("/api/reminders/upcoming/").status_code == 401
        assert api_client.post("/api/reminders/run/", {}, format="json").status_code == 401

    def test_upcoming_is_computed_on_the_fly(self, auth_client):
        # The endpoint uses the real today, so anchor the item to it.
        make_item([("insurance", today_local() + dt.timedelta(days=10))])
        settings_services.update_settings({"reminders": {"default": [7, 1, 0]}})

        response = auth_client.get("/api/reminders/upcoming/")

        assert response.status_code == 200
        data = response.data["data"]
        assert "today" in data and "sweep" in data
        # Nothing has been sent, yet the schedule is fully populated.
        assert len(data["upcoming"]) > 0
        assert mongo.reminders_collection().count_documents({}) == 0

    def test_history_lists_what_was_sent_with_item_names(
        self, auth_client, sent_emails
    ):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])
        services.run_sweep(today=TODAY)

        response = auth_client.get("/api/reminders/")

        assert response.status_code == 200
        entry = response.data["data"][0]
        assert entry["sent"] is True
        assert entry["item_name"] == "Honda CB Twister"
        assert entry["expiry_label"] == "Insurance"

    def test_the_run_button_sends_what_is_due(self, auth_client, sent_emails):
        make_item([("insurance", TODAY + dt.timedelta(days=7))])

        response = auth_client.post(
            "/api/reminders/run/", {"for_date": TODAY.isoformat()}, format="json"
        )

        assert response.status_code == 200
        assert response.data["data"]["triggered_by"] == "user"
        assert response.data["data"]["sent"] == 1
        assert len(sent_emails) == 1

    def test_a_cron_token_stands_in_for_a_session(
        self, api_client, sent_emails, settings_override
    ):
        settings_override(CRON_TOKEN="test-cron-token")
        make_item([("insurance", today_local() + dt.timedelta(days=7))])

        response = api_client.post(
            "/api/reminders/run/",
            {},
            format="json",
            HTTP_X_CRON_TOKEN="test-cron-token",
        )

        assert response.status_code == 200
        data = response.data["data"]
        assert data["triggered_by"] == "cron"
        # Gated: whether it actually swept depends on the hour the suite runs
        # at, which is exactly the behaviour under test.
        assert data["reason"] in ("ran", "before_window", "already_ran")
        assert data["runs_at_hour"] == 9

    def test_a_wrong_cron_token_is_rejected(
        self, api_client, sent_emails, settings_override
    ):
        settings_override(CRON_TOKEN="test-cron-token")
        make_item([("insurance", today_local() + dt.timedelta(days=7))])

        response = api_client.post(
            "/api/reminders/run/", {}, format="json", HTTP_X_CRON_TOKEN="guess"
        )

        assert response.status_code == 401
        assert sent_emails == []

    def test_no_cron_token_configured_means_signed_in_users_only(
        self, api_client, settings_override
    ):
        settings_override(CRON_TOKEN=None)
        response = api_client.post(
            "/api/reminders/run/", {}, format="json", HTTP_X_CRON_TOKEN=""
        )
        assert response.status_code == 401

    def test_a_get_request_is_accepted_with_a_token(
        self, api_client, settings_override
    ):
        # Uptime monitors default to GET and often cannot be switched to POST.
        settings_override(CRON_TOKEN="test-cron-token")

        response = api_client.get(
            "/api/reminders/run/", HTTP_X_CRON_TOKEN="test-cron-token"
        )

        assert response.status_code == 200
        assert response.data["data"]["triggered_by"] == "cron"

    def test_a_get_request_without_a_token_is_rejected(self, api_client):
        assert api_client.get("/api/reminders/run/").status_code == 401

    def test_the_token_may_travel_as_a_query_parameter(
        self, api_client, settings_override
    ):
        # UptimeRobot's free plan cannot attach custom headers, so the query
        # form has to work or the daily check never fires.
        settings_override(CRON_TOKEN="test-cron-token")

        response = api_client.get("/api/reminders/run/?token=test-cron-token")

        assert response.status_code == 200
        assert response.data["data"]["triggered_by"] == "cron"

    def test_a_wrong_query_token_is_rejected(self, api_client, settings_override):
        settings_override(CRON_TOKEN="test-cron-token")
        assert api_client.get("/api/reminders/run/?token=guess").status_code == 401

    def test_an_early_ping_is_a_200_not_an_error(
        self, api_client, sent_emails, settings_override, monkeypatch
    ):
        # A monitor treats any non-2xx as the site being down. "It is not 9am
        # yet" must not page the user at three in the morning.
        #
        # The clock is pinned to 03:00: reading the real one would make this
        # pass or fail depending on when the suite runs.
        settings_override(CRON_TOKEN="test-cron-token")
        monkeypatch.setattr(services, "local_now", lambda: at(3, day=today_local()))
        make_item([("insurance", today_local() + dt.timedelta(days=7))])

        response = api_client.get("/api/reminders/run/?token=test-cron-token")

        assert response.status_code == 200
        assert response.data["data"]["reason"] == "before_window"
        assert sent_emails == []

    def test_a_ping_inside_the_window_runs_and_reports_what_it_sent(
        self, api_client, sent_emails, settings_override, monkeypatch
    ):
        settings_override(CRON_TOKEN="test-cron-token")
        monkeypatch.setattr(services, "local_now", lambda: at(9, day=today_local()))
        make_item([("insurance", today_local() + dt.timedelta(days=7))])

        first = api_client.get("/api/reminders/run/?token=test-cron-token")
        second = api_client.get("/api/reminders/run/?token=test-cron-token")

        assert first.data["data"]["reason"] == "ran"
        assert first.data["data"]["sent"] == 1
        # The monitor keeps pinging; the rest of the day is a cheap no-op.
        assert second.data["data"]["reason"] == "already_ran"
        assert len(sent_emails) == 1

    def test_cron_cannot_backdate_the_sweep(
        self, api_client, sent_emails, settings_override
    ):
        # `for_date` is a signed-in testing aid; an unauthenticated caller must
        # not be able to replay reminders for an arbitrary day.
        settings_override(CRON_TOKEN="test-cron-token")
        backdated = today_local() - dt.timedelta(days=30)
        make_item([("insurance", backdated + dt.timedelta(days=7))])

        response = api_client.post(
            "/api/reminders/run/",
            {"for_date": backdated.isoformat()},
            format="json",
            HTTP_X_CRON_TOKEN="test-cron-token",
        )

        assert response.status_code == 200
        # `for_date` was ignored: the scheduled path always uses the real
        # today, where that long expired date is due for nothing.
        assert sent_emails == []


class TestItemDeletionCleansUp:
    def test_reminder_records_go_with_the_item(self, sent_emails):
        item = make_item([("insurance", TODAY + dt.timedelta(days=7))])
        services.run_sweep(today=TODAY)
        assert mongo.reminders_collection().count_documents({}) == 1

        item_services.delete_item(str(item["_id"]))

        assert mongo.reminders_collection().count_documents({}) == 0
