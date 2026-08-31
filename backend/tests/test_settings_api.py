"""Settings endpoint: reminder recipient and offsets."""

from __future__ import annotations


class TestSettingsApi:
    def test_defaults_come_from_the_environment(self, auth_client):
        response = auth_client.get("/api/settings/")

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["reminder_email"] == "owner@example.com"
        assert data["reminders"] == {"insurance": [7, 1, 0], "pucc": [7, 1, 0]}

    def test_update_persists_the_changes(self, auth_client):
        response = auth_client.put(
            "/api/settings/",
            {
                "reminder_email": "someone@example.com",
                "reminders": {"insurance": [30, 7, 1, 0], "pucc": [15, 0]},
            },
            format="json",
        )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["reminder_email"] == "someone@example.com"
        assert data["reminders"]["insurance"] == [30, 7, 1, 0]
        assert data["reminders"]["pucc"] == [15, 0]

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
            "/api/settings/", {"reminders": {"insurance": [-5]}}, format="json"
        )

        assert response.status_code == 400

    def test_settings_never_expose_secrets(self, auth_client):
        from django.conf import settings

        content = auth_client.get("/api/settings/").content.decode()
        for secret in (settings.BREVO_API_KEY, settings.FIREAPI_API_KEY, settings.APP_PASSWORD):
            assert secret not in content

    def test_settings_require_authentication(self, api_client):
        assert api_client.get("/api/settings/").status_code == 401
        assert api_client.put("/api/settings/", {}, format="json").status_code == 401
