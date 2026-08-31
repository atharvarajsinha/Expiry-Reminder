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

    def test_worker_status_is_optional(self, api_client, monkeypatch):
        monkeypatch.setattr(
            "health.views._worker_status",
            lambda timeout=1.0: {
                "broker": "connected",
                "workers_online": 1,
                "workers": ["celery@test"],
                "scheduled_tasks": ["daily-reminder-check"],
            },
        )

        response = api_client.get("/api/health/?workers=1")

        assert response.status_code == 200
        assert response.json()["celery"]["workers_online"] == 1

    def test_health_response_contains_no_secrets(self, api_client):
        from django.conf import settings

        content = api_client.get("/api/health/").content.decode()
        for secret in (settings.FIREAPI_API_KEY, settings.BREVO_API_KEY, settings.JWT_SECRET_KEY):
            assert secret not in content
