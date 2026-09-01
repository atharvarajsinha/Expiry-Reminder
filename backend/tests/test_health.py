"""Health endpoint (public) in both healthy and unhealthy states."""

from __future__ import annotations

from core import mongo


class TestHealth:
    def test_healthy_when_mongodb_answers(self, api_client):
        response = api_client.get("/api/health/")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "healthy"
        assert body["database"] == "connected"
        assert body["timestamp"]

    def test_unhealthy_when_mongodb_is_down(self, api_client, monkeypatch):
        monkeypatch.setattr(mongo, "ping", lambda: False)

        response = api_client.get("/api/health/")

        assert response.status_code == 503
        body = response.json()
        assert body["status"] == "unhealthy"
        assert body["database"] == "disconnected"

    def test_health_is_public(self, api_client):
        # No Authorization header, no cookies -- still reachable.
        assert api_client.get("/api/health/").status_code == 200

    def test_sweep_status_is_optional(self, api_client):
        # Off by default -- an uptime monitor should not pay for the extra read.
        assert "sweep" not in api_client.get("/api/health/").json()

        response = api_client.get("/api/health/?sweep=1")

        assert response.status_code == 200
        # Nothing has swept yet, which is a reportable state, not an error.
        assert response.json()["sweep"] == {
            "last_run_date": None,
            "last_run_at": None,
        }

    def test_sweep_status_survives_a_broken_database(self, api_client, monkeypatch):
        monkeypatch.setattr(
            "reminders.services.sweep_state",
            lambda: (_ for _ in ()).throw(RuntimeError("boom")),
        )

        response = api_client.get("/api/health/?sweep=1")

        assert response.status_code == 200
        assert response.json()["sweep"]["last_run_date"] is None

    def test_health_response_contains_no_secrets(self, api_client):
        from django.conf import settings

        content = api_client.get("/api/health/").content.decode()
        for secret in (settings.BREVO_API_KEY, settings.JWT_SECRET_KEY, settings.CRON_TOKEN):
            assert secret not in content
