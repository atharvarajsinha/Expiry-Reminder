"""Settings endpoint: reminder recipient and offsets."""

from __future__ import annotations


class TestSettingsApi:
    def test_defaults_come_from_the_environment(self, auth_client):
        response = auth_client.get("/api/settings/")

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["reminder_email"] == "owner@example.com"
        # Every category, plus the `default` used by anything without an entry.
        assert data["reminders"]["default"] == [30, 7, 1, 0]
        assert data["reminders"]["vehicle"] == [30, 7, 1, 0]
        assert data["reminders"]["credit_card"] == [30, 7, 1, 0]

    def test_delivery_status_tells_the_ui_what_is_wired_up(self, auth_client):
        delivery = auth_client.get("/api/settings/").json()["data"]["delivery"]

        assert delivery["email_configured"] is True
        assert delivery["cron_configured"] is True
        assert delivery["reminder_hour"] == 9
        assert delivery["expiring_soon_days"] == 30
        assert delivery["timezone"] == "Asia/Kolkata"
        assert delivery["sweep"] == {"last_run_date": None, "last_run_at": None}

    def test_update_persists_the_changes(self, auth_client):
        response = auth_client.put(
            "/api/settings/",
            {
                "reminder_email": "someone@example.com",
                "reminders": {"vehicle": [30, 7, 1, 0], "credit_card": [15, 0]},
            },
            format="json",
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["reminder_email"] == "someone@example.com"
        assert data["reminders"]["vehicle"] == [30, 7, 1, 0]
        assert data["reminders"]["credit_card"] == [15, 0]
        # Categories left out of the request keep their previous values.
        assert data["reminders"]["document"] == [30, 7, 1, 0]

        # Still there on the next read.
        assert (
            auth_client.get("/api/settings/").json()["data"]["reminder_email"]
            == "someone@example.com"
        )

    def test_invalid_email_is_rejected(self, auth_client):
        response = auth_client.put(
            "/api/settings/", {"reminder_email": "not-an-email"}, format="json"
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_invalid_offsets_are_rejected(self, auth_client):
        response = auth_client.put(
            "/api/settings/", {"reminders": {"vehicle": [-5]}}, format="json"
        )

        assert response.status_code == 400

    def test_unknown_categories_are_rejected(self, auth_client):
        response = auth_client.put(
            "/api/settings/", {"reminders": {"spaceship": [7]}}, format="json"
        )

        assert response.status_code == 400

    def test_an_empty_list_means_never_email_about_that_category(self, auth_client):
        # An empty list is a real choice, not a missing value, so it must not
        # be quietly replaced by the default.
        auth_client.put(
            "/api/settings/", {"reminders": {"credit_card": []}}, format="json"
        )

        data = auth_client.get("/api/settings/").json()["data"]
        assert data["reminders"]["credit_card"] == []
        assert data["reminders"]["vehicle"] == [30, 7, 1, 0]

    def test_offsets_are_deduplicated_and_sorted(self, auth_client):
        response = auth_client.put(
            "/api/settings/", {"reminders": {"vehicle": [1, 7, 7, 0, 1]}}, format="json"
        )

        assert response.json()["data"]["reminders"]["vehicle"] == [7, 1, 0]

    def test_settings_never_expose_secrets(self, auth_client):
        from django.conf import settings

        content = auth_client.get("/api/settings/").content.decode()
        for secret in (settings.BREVO_API_KEY, settings.CRON_TOKEN, settings.APP_PASSWORD):
            assert secret not in content

    def test_settings_require_authentication(self, api_client):
        assert api_client.get("/api/settings/").status_code == 401
        assert api_client.put("/api/settings/", {}, format="json").status_code == 401
