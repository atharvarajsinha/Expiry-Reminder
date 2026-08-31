"""Job lifecycle and the polling endpoint."""

from __future__ import annotations

from jobs import services


class TestJobService:
    def test_create_job_starts_queued(self):
        job = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")

        assert job["status"] == services.QUEUED
        assert job["started_at"] is None
        assert job["completed_at"] is None
        assert job["error"] is None

    def test_lifecycle_transitions(self):
        job = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")

        services.mark_processing(job["job_id"])
        processing = services.get_job(job["job_id"])
        assert processing["status"] == services.PROCESSING
        assert processing["started_at"] is not None

        services.mark_completed(job["job_id"], vehicle_id="507f1f77bcf86cd799439011")
        completed = services.get_job(job["job_id"])
        assert completed["status"] == services.COMPLETED
        assert completed["vehicle_id"] == "507f1f77bcf86cd799439011"
        assert completed["completed_at"] is not None

    def test_failed_job_records_the_error(self):
        job = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")

        services.mark_failed(
            job["job_id"],
            "VEHICLE_API_TIMEOUT",
            "The vehicle information service did not respond in time.",
        )

        failed = services.get_job(job["job_id"])
        assert failed["status"] == services.FAILED
        assert failed["error_code"] == "VEHICLE_API_TIMEOUT"
        assert "did not respond" in failed["error"]

    def test_job_documents_never_store_secrets(self):
        job = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")
        stored = services.get_job(job["job_id"])

        forbidden = {"api_key", "headers", "authorization", "password", "token"}
        assert forbidden.isdisjoint(set(stored.keys()))


class TestJobApi:
    def test_status_endpoint_returns_the_job(self, auth_client):
        job = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")

        response = auth_client.get("/api/jobs/%s/" % job["job_id"])

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["job_id"] == job["job_id"]
        assert data["status"] == "queued"
        assert data["vehicle_no"] == "UP25AK4922"
        assert data["error"] is None

    def test_unknown_job_is_404(self, auth_client):
        response = auth_client.get("/api/jobs/does-not-exist/")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "JOB_NOT_FOUND"

    def test_job_endpoint_requires_authentication(self, api_client):
        job = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")

        response = api_client.get("/api/jobs/%s/" % job["job_id"])

        assert response.status_code == 401

    def test_job_list_is_newest_first(self, auth_client):
        first = services.create_job(services.JOB_TYPE_FETCH, "UP25AK4922")
        second = services.create_job(services.JOB_TYPE_FETCH, "DL01AB1234")

        response = auth_client.get("/api/jobs/")

        assert response.status_code == 200
        ids = [item["job_id"] for item in response.json()["data"]]
        assert set(ids) == {first["job_id"], second["job_id"]}
