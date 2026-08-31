"""Vehicle endpoints, the background fetch task and refresh behaviour."""

from __future__ import annotations

import requests

from core import mongo
from jobs import services as job_services
from vehicles import services as vehicle_services
from vehicles.tasks import fetch_vehicle_details


def mock_fireapi(monkeypatch, response=None, exception=None):
    """Replace ``requests.get`` inside the FireAPI client."""

    def fake_get(*args, **kwargs):
        if exception is not None:
            raise exception
        return response

    monkeypatch.setattr("vehicles.fireapi.requests.get", fake_get)


def no_retries(monkeypatch):
    """Fail fast instead of scheduling Celery retries during tests."""
    monkeypatch.setattr(fetch_vehicle_details, "max_retries", 0)


class TestFetchEndpoint:
    def test_valid_number_creates_a_queued_job(self, auth_client, monkeypatch):
        monkeypatch.setattr(fetch_vehicle_details, "delay", lambda *a, **k: None)

        response = auth_client.post(
            "/api/vehicles/fetch/", {"vehicle_no": "up25 ak 4922"}, format="json"
        )

        assert response.status_code == 202
        data = response.json()["data"]
        # The number is normalised before anything else happens.
        assert data["vehicle_no"] == "UP25AK4922"
        assert data["status"] == "queued"

        job = job_services.get_job(data["job_id"])
        assert job["status"] == "queued"
        assert job["job_type"] == job_services.JOB_TYPE_FETCH

    def test_invalid_number_is_rejected(self, auth_client, monkeypatch):
        monkeypatch.setattr(fetch_vehicle_details, "delay", lambda *a, **k: None)

        response = auth_client.post(
            "/api/vehicles/fetch/", {"vehicle_no": "!!!"}, format="json"
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_VEHICLE_NUMBER"

    def test_duplicate_vehicle_is_reported(self, auth_client, stored_vehicle, monkeypatch):
        monkeypatch.setattr(fetch_vehicle_details, "delay", lambda *a, **k: None)

        response = auth_client.post(
            "/api/vehicles/fetch/", {"vehicle_no": "UP25AK4922"}, format="json"
        )

        assert response.status_code == 409
        error = response.json()["error"]
        assert error["code"] == "VEHICLE_ALREADY_EXISTS"
        assert error["details"]["vehicle_id"] == str(stored_vehicle["_id"])

    def test_fetch_requires_authentication(self, api_client):
        response = api_client.post(
            "/api/vehicles/fetch/", {"vehicle_no": "UP25AK4922"}, format="json"
        )
        assert response.status_code == 401


class TestFetchTask:
    def test_successful_fetch_stores_the_vehicle(
        self, monkeypatch, fireapi_payload, fake_response
    ):
        mock_fireapi(monkeypatch, fake_response(200, fireapi_payload))
        job = job_services.create_job(job_services.JOB_TYPE_FETCH, "UP25AK4922")

        result = fetch_vehicle_details(job["job_id"], "UP25AK4922")

        assert result["status"] == "completed"
        stored = vehicle_services.get_by_number("UP25AK4922")
        assert stored is not None
        assert stored["maker"] == "HONDA"
        assert stored["model"] == "CB TWISTER"
        assert stored["cubic_capacity"] == 50.0
        assert stored["seat_capacity"] == 2
        # Dates are stored as real dates, not raw FireAPI strings.
        assert stored["insurance"]["expires_on"].date().isoformat() == "2027-08-12"
        assert stored["pucc"]["expires_on"].date().isoformat() == "2027-02-22"
        assert stored["registration_date"].date().isoformat() == "2010-12-14"

        finished = job_services.get_job(job["job_id"])
        assert finished["status"] == "completed"
        assert finished["vehicle_id"] == str(stored["_id"])
        assert finished["error"] is None

    def test_timeout_fails_the_job(self, monkeypatch):
        no_retries(monkeypatch)
        mock_fireapi(monkeypatch, exception=requests.exceptions.Timeout())
        job = job_services.create_job(job_services.JOB_TYPE_FETCH, "UP25AK4922")

        fetch_vehicle_details(job["job_id"], "UP25AK4922")

        finished = job_services.get_job(job["job_id"])
        assert finished["status"] == "failed"
        assert finished["error_code"] == "VEHICLE_API_TIMEOUT"
        assert "did not respond in time" in finished["error"]
        assert vehicle_services.get_by_number("UP25AK4922") is None

    def test_upstream_server_error_fails_the_job(self, monkeypatch, fake_response):
        no_retries(monkeypatch)
        mock_fireapi(monkeypatch, fake_response(500, {"status": "error"}))
        job = job_services.create_job(job_services.JOB_TYPE_FETCH, "UP25AK4922")

        fetch_vehicle_details(job["job_id"], "UP25AK4922")

        finished = job_services.get_job(job["job_id"])
        assert finished["status"] == "failed"
        assert finished["error_code"] == "VEHICLE_API_UNAVAILABLE"

    def test_malformed_response_fails_the_job(self, monkeypatch, fake_response):
        no_retries(monkeypatch)
        # 200 OK but no usable ``data`` object.
        mock_fireapi(monkeypatch, fake_response(200, {"status": "success", "data": None}))
        job = job_services.create_job(job_services.JOB_TYPE_FETCH, "UP25AK4922")

        fetch_vehicle_details(job["job_id"], "UP25AK4922")

        finished = job_services.get_job(job["job_id"])
        assert finished["status"] == "failed"
        assert finished["error_code"] == "VEHICLE_API_INVALID_RESPONSE"

    def test_unknown_vehicle_is_reported(self, monkeypatch, fake_response):
        no_retries(monkeypatch)
        mock_fireapi(
            monkeypatch,
            fake_response(200, {"status": "failed", "message": "No record found"}),
        )
        job = job_services.create_job(job_services.JOB_TYPE_FETCH, "UP99XX9999")

        fetch_vehicle_details(job["job_id"], "UP99XX9999")

        finished = job_services.get_job(job["job_id"])
        assert finished["status"] == "failed"
        assert finished["error_code"] == "VEHICLE_NOT_FOUND_UPSTREAM"

    def test_job_transitions_through_processing(self, monkeypatch, fireapi_payload, fake_response):
        seen = {}

        def fake_get(*args, **kwargs):
            job = job_services.get_job(job_id)
            seen["status_during_call"] = job["status"]
            seen["started_at"] = job["started_at"]
            return fake_response(200, fireapi_payload)

        monkeypatch.setattr("vehicles.fireapi.requests.get", fake_get)
        job_id = job_services.create_job(job_services.JOB_TYPE_FETCH, "UP25AK4922")["job_id"]

        fetch_vehicle_details(job_id, "UP25AK4922")

        assert seen["status_during_call"] == "processing"
        assert seen["started_at"] is not None
        assert job_services.get_job(job_id)["completed_at"] is not None


class TestRefresh:
    def test_refresh_endpoint_queues_a_job(self, auth_client, stored_vehicle, monkeypatch):
        monkeypatch.setattr(fetch_vehicle_details, "delay", lambda *a, **k: None)

        response = auth_client.post(
            "/api/vehicles/%s/refresh/" % stored_vehicle["_id"], {}, format="json"
        )

        assert response.status_code == 202
        data = response.json()["data"]
        assert data["status"] == "queued"
        job = job_services.get_job(data["job_id"])
        assert job["job_type"] == job_services.JOB_TYPE_REFRESH
        assert job["vehicle_id"] == str(stored_vehicle["_id"])

    def test_refresh_of_unknown_vehicle_is_404(self, auth_client):
        response = auth_client.post(
            "/api/vehicles/64b7f0f0f0f0f0f0f0f0f0f0/refresh/", {}, format="json"
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"

    def test_successful_refresh_updates_values(
        self, monkeypatch, stored_vehicle, fireapi_payload, fake_response
    ):
        payload = dict(fireapi_payload)
        payload["data"] = dict(fireapi_payload["data"])
        payload["data"]["rc_insurance_upto"] = "2028-08-12"
        mock_fireapi(monkeypatch, fake_response(200, payload))

        job = job_services.create_job(
            job_services.JOB_TYPE_REFRESH, "UP25AK4922", vehicle_id=stored_vehicle["_id"]
        )
        # Read it back so the comparison uses BSON millisecond precision.
        previous_fetch = vehicle_services.get_by_id(stored_vehicle["_id"])["last_fetched_at"]

        fetch_vehicle_details(job["job_id"], "UP25AK4922", str(stored_vehicle["_id"]))

        refreshed = vehicle_services.get_by_id(stored_vehicle["_id"])
        assert refreshed["insurance"]["expires_on"].date().isoformat() == "2028-08-12"
        assert refreshed["last_fetched_at"] >= previous_fetch
        assert job_services.get_job(job["job_id"])["status"] == "completed"

    def test_failed_refresh_preserves_existing_data(self, monkeypatch, stored_vehicle):
        no_retries(monkeypatch)
        mock_fireapi(monkeypatch, exception=requests.exceptions.ConnectionError())

        job = job_services.create_job(
            job_services.JOB_TYPE_REFRESH, "UP25AK4922", vehicle_id=stored_vehicle["_id"]
        )

        fetch_vehicle_details(job["job_id"], "UP25AK4922", str(stored_vehicle["_id"]))

        unchanged = vehicle_services.get_by_id(stored_vehicle["_id"])
        assert unchanged["insurance"]["policy_no"] == "26020131266730212340"
        assert unchanged["insurance"]["expires_on"] == stored_vehicle["insurance"]["expires_on"]
        assert unchanged["maker"] == "HONDA"

        finished = job_services.get_job(job["job_id"])
        assert finished["status"] == "failed"
        assert finished["error_code"] == "VEHICLE_API_UNAVAILABLE"

    def test_refresh_never_nulls_existing_values(
        self, monkeypatch, stored_vehicle, fireapi_payload, fake_response
    ):
        # Upstream suddenly returns nothing for the policy number and maker.
        payload = {"status": "success", "data": dict(fireapi_payload["data"])}
        payload["data"]["rc_insurance_policy_no"] = None
        payload["data"]["rc_maker_desc"] = None
        mock_fireapi(monkeypatch, fake_response(200, payload))

        job = job_services.create_job(
            job_services.JOB_TYPE_REFRESH, "UP25AK4922", vehicle_id=stored_vehicle["_id"]
        )
        fetch_vehicle_details(job["job_id"], "UP25AK4922", str(stored_vehicle["_id"]))

        refreshed = vehicle_services.get_by_id(stored_vehicle["_id"])
        assert refreshed["insurance"]["policy_no"] == "26020131266730212340"
        assert refreshed["maker"] == "HONDA"


class TestVehicleApi:
    def test_list_returns_a_summary_without_sensitive_fields(self, auth_client, stored_vehicle):
        response = auth_client.get("/api/vehicles/")

        assert response.status_code == 200
        items = response.json()["data"]
        assert len(items) == 1

        item = items[0]
        assert item["vehicle_no"] == "UP25AK4922"
        assert item["maker"] == "HONDA"
        assert item["insurance_expires_on"] == "2027-08-12"
        assert item["pucc_expires_on"] == "2027-02-22"
        assert "overall_status" in item

        for sensitive in ("owner_name", "father_name", "chassis_no", "engine_no", "insurance"):
            assert sensitive not in item

    def test_detail_returns_the_full_record(self, auth_client, stored_vehicle):
        response = auth_client.get("/api/vehicles/%s/" % stored_vehicle["_id"])

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["owner_name"] == "ROHIT SRIVASTAVA"
        assert data["chassis_no"] == "JC47E0133748"
        assert data["insurance"]["policy_no"] == "26020131266730212340"
        assert data["insurance"]["status"] in {
            "valid",
            "expiring_soon",
            "expires_today",
            "expired",
        }

    def test_detail_of_unknown_vehicle_is_404(self, auth_client):
        response = auth_client.get("/api/vehicles/not-an-object-id/")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"

    def test_delete_removes_the_vehicle_and_its_reminders(self, auth_client, stored_vehicle):
        mongo.reminders_collection().insert_one(
            {
                "vehicle_id": str(stored_vehicle["_id"]),
                "document_type": "insurance",
                "expiry_date": stored_vehicle["insurance"]["expires_on"],
                "reminder_type": "7_days",
                "sent": True,
            }
        )

        response = auth_client.delete("/api/vehicles/%s/" % stored_vehicle["_id"])

        assert response.status_code == 200
        assert vehicle_services.get_by_number("UP25AK4922") is None
        assert (
            mongo.reminders_collection().count_documents(
                {"vehicle_id": str(stored_vehicle["_id"])}
            )
            == 0
        )
