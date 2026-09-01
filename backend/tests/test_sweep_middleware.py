"""The request-triggered sweep -- this project's entire scheduler.

Three properties matter, and each has a test here: it fires once a day off a
real request, it never breaks the response it is riding on, and it does not
attach itself to the routes that must stay cheap.
"""

from __future__ import annotations

import datetime as dt

import pytest

from core import mongo
from core.dates import to_storage, today_local
from reminders import services

pytestmark = pytest.mark.usefixtures("mongo_database")


@pytest.fixture(autouse=True)
def sweep_enabled(settings_override):
    """The suite disables the middleware by default; this module needs it on."""
    settings_override(REMINDER_SWEEP_ON_REQUEST=True)


def make_due_item(days=7, name="Honda CB Twister"):
    """An item whose insurance is exactly `days` away, so a reminder is due."""
    expires_on = to_storage(today_local() + dt.timedelta(days=days))
    document = {
        "category": "vehicle",
        "name": name,
        "identifier": "UP25AK4922",
        "identifier_key": "up25ak4922",
        "issuer": None,
        "holder": None,
        "notes": None,
        "expiries": [
            {
                "key": "insurance",
                "label": "Insurance",
                "expires_on": expires_on,
                "issued_on": None,
                "reference": None,
            }
        ],
        "next_expiry_on": expires_on,
    }
    mongo.items_collection().insert_one(document)
    return document


class TestSweepOnRequest:
    def test_an_ordinary_request_runs_the_days_sweep(self, auth_client, sent_emails):
        make_due_item()

        auth_client.get("/api/items/")

        assert len(sent_emails) == 1
        assert services.sweep_state()["last_run_date"] == today_local().isoformat()

    def test_later_requests_that_day_send_nothing_more(
        self, auth_client, sent_emails
    ):
        make_due_item()

        for _ in range(5):
            auth_client.get("/api/items/")

        assert len(sent_emails) == 1

    def test_the_response_is_unaffected_when_the_sweep_explodes(
        self, auth_client, monkeypatch
    ):
        make_due_item()
        monkeypatch.setattr(
            "reminders.services.run_sweep",
            lambda today=None: (_ for _ in ()).throw(RuntimeError("boom")),
        )

        response = auth_client.get("/api/items/")

        # A failing sweep is a logged background problem, not a 500 for the
        # user who happened to make the first request of the day.
        assert response.status_code == 200
        assert len(response.data["data"]) == 1

    def test_health_checks_do_not_trigger_it(self, api_client, sent_emails):
        make_due_item()

        api_client.get("/api/health/")

        assert sent_emails == []
        assert services.sweep_state()["last_run_date"] is None

    def test_login_does_not_trigger_it(self, api_client, credentials, sent_emails):
        make_due_item()

        api_client.post("/api/auth/login/", credentials, format="json")

        assert sent_emails == []

    def test_it_respects_the_off_switch(
        self, auth_client, sent_emails, settings_override
    ):
        settings_override(REMINDER_SWEEP_ON_REQUEST=False)
        make_due_item()

        auth_client.get("/api/items/")

        assert sent_emails == []
