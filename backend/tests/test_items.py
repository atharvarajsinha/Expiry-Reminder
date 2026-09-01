"""The item API: manual entry, validation, and the card-number refusal."""

from __future__ import annotations

import datetime as dt

import pytest

from core.dates import today_local


def iso_in(days):
    return (today_local() + dt.timedelta(days=days)).isoformat()


class TestAuthorisation:
    def test_every_item_route_needs_a_session(self, api_client):
        for method, url in [
            ("get", "/api/items/"),
            ("post", "/api/items/"),
            ("get", "/api/items/categories/"),
            ("get", "/api/items/64b7f0000000000000000000/"),
            ("delete", "/api/items/64b7f0000000000000000000/"),
        ]:
            response = getattr(api_client, method)(url, {}, format="json")
            assert response.status_code == 401, "%s %s" % (method, url)


class TestCategories:
    def test_catalogue_drives_the_forms(self, auth_client):
        response = auth_client.get("/api/items/categories/")
        assert response.status_code == 200

        catalogue = {entry["key"]: entry for entry in response.data["data"]}
        assert {"vehicle", "credit_card", "debit_card", "document"} <= set(catalogue)

        vehicle = catalogue["vehicle"]
        assert vehicle["identifier_label"] == "Registration number"
        assert vehicle["identifier_required"] is True
        assert vehicle["is_card"] is False
        assert "insurance" in [entry["key"] for entry in vehicle["expiries"]]

        card = catalogue["credit_card"]
        assert card["identifier_label"] == "Last 4 digits"
        assert card["is_card"] is True


class TestCreate:
    def test_a_vehicle_is_stored_and_returned(self, auth_client, vehicle_payload):
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 201, response.data

        data = response.data["data"]
        assert data["category"] == "vehicle"
        assert data["identifier"] == "UP25AK4922"
        assert data["overall_status"] in ("valid", "expiring_soon")
        # Expiries come back sorted, soonest first, with a resolved label.
        keys = [entry["key"] for entry in data["expiries"]]
        assert keys == ["insurance", "pucc"]
        assert data["expiries"][0]["label"] == "Insurance"
        assert data["expiries"][0]["days_remaining"] == 45
        # `next_expiry` headlines the soonest upcoming date.
        assert data["next_expiry"]["key"] == "insurance"

    def test_registration_numbers_are_normalised(self, auth_client, vehicle_payload):
        vehicle_payload["identifier"] = "up-25 ak 4922"
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 201
        assert response.data["data"]["identifier"] == "UP25AK4922"

    def test_a_bad_registration_number_is_rejected(self, auth_client, vehicle_payload):
        vehicle_payload["identifier"] = "???"
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400
        assert response.data["error"]["code"] == "INVALID_VEHICLE_NUMBER"

    def test_a_vehicle_without_a_number_is_rejected(self, auth_client, vehicle_payload):
        vehicle_payload["identifier"] = ""
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400
        assert response.data["error"]["code"] == "INVALID_VEHICLE_NUMBER"

    def test_the_same_vehicle_cannot_be_added_twice(
        self, auth_client, vehicle_payload
    ):
        assert auth_client.post("/api/items/", vehicle_payload, format="json").status_code == 201

        # Same plate, typed differently, under a different name.
        duplicate = dict(vehicle_payload, identifier="up25 ak 4922", name="Second bike")
        response = auth_client.post("/api/items/", duplicate, format="json")

        assert response.status_code == 409
        assert response.data["error"]["code"] == "ITEM_ALREADY_EXISTS"
        assert "item_id" in response.data["error"]["details"]

    def test_the_same_identifier_in_another_category_is_fine(
        self, auth_client, card_payload
    ):
        assert auth_client.post("/api/items/", card_payload, format="json").status_code == 201

        debit = dict(card_payload, category="debit_card", name="SBI Classic")
        response = auth_client.post("/api/items/", debit, format="json")

        assert response.status_code == 201

    def test_unknown_categories_are_rejected(self, auth_client, vehicle_payload):
        vehicle_payload["category"] = "spaceship"
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400
        assert response.data["error"]["code"] == "UNKNOWN_CATEGORY"
        assert "vehicle" in response.data["error"]["details"]["allowed"]

    def test_a_custom_expiry_key_is_accepted(self, auth_client):
        response = auth_client.post(
            "/api/items/",
            {
                "category": "warranty",
                "name": "Washing machine",
                "expiries": [
                    {"key": "warranty", "expires_on": iso_in(300)},
                    {
                        "key": "extended_cover",
                        "label": "Extended cover",
                        "expires_on": iso_in(600),
                    },
                ],
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        labels = {e["key"]: e["label"] for e in response.data["data"]["expiries"]}
        assert labels["extended_cover"] == "Extended cover"
        # A key with no preset and no label still gets readable words.
        assert labels["warranty"] == "Warranty ends"


class TestCardSafety:
    def test_only_the_last_four_digits_are_accepted(self, auth_client, card_payload):
        response = auth_client.post("/api/items/", card_payload, format="json")
        assert response.status_code == 201
        assert response.data["data"]["identifier"] == "4321"

    def test_a_full_card_number_is_refused_not_truncated(
        self, auth_client, card_payload, mongo_database
    ):
        card_payload["identifier"] = "4111 1111 1111 1111"
        response = auth_client.post("/api/items/", card_payload, format="json")

        assert response.status_code == 400
        assert response.data["error"]["code"] == "CARD_NUMBER_REJECTED"
        # Nothing was written, so no fragment of the number was ever stored.
        assert mongo_database["items"].count_documents({}) == 0

    def test_a_card_may_be_saved_without_any_digits(self, auth_client, card_payload):
        card_payload["identifier"] = ""
        response = auth_client.post("/api/items/", card_payload, format="json")
        assert response.status_code == 201
        assert response.data["data"]["identifier"] is None


class TestExpiryValidation:
    def test_at_least_one_expiry_is_required(self, auth_client, vehicle_payload):
        vehicle_payload["expiries"] = []
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400

    def test_an_unparseable_date_is_rejected(self, auth_client, vehicle_payload):
        vehicle_payload["expiries"] = [
            {"key": "insurance", "expires_on": "whenever"}
        ]
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400
        assert response.data["error"]["code"] == "INVALID_EXPIRY"

    def test_a_duplicated_expiry_key_is_rejected(self, auth_client, vehicle_payload):
        vehicle_payload["expiries"] = [
            {"key": "insurance", "expires_on": iso_in(10)},
            {"key": "insurance", "expires_on": iso_in(20)},
        ]
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400
        assert response.data["error"]["code"] == "INVALID_EXPIRY"

    def test_a_malformed_expiry_key_is_rejected(self, auth_client, vehicle_payload):
        vehicle_payload["expiries"] = [
            {"key": "Not A Key!", "expires_on": iso_in(10)}
        ]
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 400
        assert response.data["error"]["code"] == "INVALID_EXPIRY"

    def test_past_dates_are_allowed_and_read_as_expired(
        self, auth_client, vehicle_payload
    ):
        # Adding something already lapsed is exactly why you would open the app.
        vehicle_payload["expiries"] = [
            {"key": "insurance", "expires_on": iso_in(-3)}
        ]
        response = auth_client.post("/api/items/", vehicle_payload, format="json")
        assert response.status_code == 201
        assert response.data["data"]["overall_status"] == "expired"
        assert response.data["data"]["expiries"][0]["days_remaining"] == -3


class TestListAndDetail:
    def test_the_list_is_sorted_by_the_soonest_expiry(
        self, auth_client, vehicle_payload, card_payload
    ):
        # The card expires in 90 days, the vehicle's insurance in 45.
        auth_client.post("/api/items/", card_payload, format="json")
        auth_client.post("/api/items/", vehicle_payload, format="json")

        response = auth_client.get("/api/items/")
        assert response.status_code == 200
        assert [entry["name"] for entry in response.data["data"]] == [
            "Honda CB Twister",
            "HDFC Millennia",
        ]

    def test_the_list_can_be_filtered_by_category(
        self, auth_client, vehicle_payload, card_payload
    ):
        auth_client.post("/api/items/", vehicle_payload, format="json")
        auth_client.post("/api/items/", card_payload, format="json")

        response = auth_client.get("/api/items/?category=credit_card")
        assert response.status_code == 200
        assert len(response.data["data"]) == 1
        assert response.data["data"][0]["category"] == "credit_card"

    def test_detail_matches_the_list_entry(self, auth_client, vehicle_payload):
        created = auth_client.post("/api/items/", vehicle_payload, format="json")
        item_id = created.data["data"]["id"]

        detail = auth_client.get("/api/items/%s/" % item_id)
        assert detail.status_code == 200
        # One serializer feeds both routes, so the two payloads carry the same
        # fields and the same statuses (bar sub-second timestamp rounding).
        assert detail.data["data"].keys() == created.data["data"].keys()
        for field in ("id", "category", "name", "identifier", "expiries",
                      "overall_status", "next_expiry"):
            assert detail.data["data"][field] == created.data["data"][field]

    def test_a_missing_item_is_a_404(self, auth_client):
        response = auth_client.get("/api/items/64b7f0000000000000000000/")
        assert response.status_code == 404
        assert response.data["error"]["code"] == "ITEM_NOT_FOUND"

    def test_a_malformed_id_is_a_404_not_a_500(self, auth_client):
        response = auth_client.get("/api/items/not-an-object-id/")
        assert response.status_code == 404


class TestUpdate:
    def test_editing_replaces_the_expiry_list(self, auth_client, vehicle_payload):
        created = auth_client.post("/api/items/", vehicle_payload, format="json")
        item_id = created.data["data"]["id"]

        response = auth_client.put(
            "/api/items/%s/" % item_id,
            {
                "category": "vehicle",
                "name": "Honda CB Twister",
                "identifier": "UP25AK4922",
                "expiries": [{"key": "insurance", "expires_on": iso_in(400)}],
            },
            format="json",
        )

        assert response.status_code == 200, response.data
        assert len(response.data["data"]["expiries"]) == 1
        assert response.data["data"]["expiries"][0]["days_remaining"] == 400

    def test_the_category_is_kept_when_omitted(self, auth_client, vehicle_payload):
        created = auth_client.post("/api/items/", vehicle_payload, format="json")
        item_id = created.data["data"]["id"]

        response = auth_client.put(
            "/api/items/%s/" % item_id,
            {
                "name": "Renamed bike",
                "identifier": "UP25AK4922",
                "expiries": [{"key": "insurance", "expires_on": iso_in(30)}],
            },
            format="json",
        )

        assert response.status_code == 200
        assert response.data["data"]["category"] == "vehicle"
        assert response.data["data"]["name"] == "Renamed bike"

    def test_editing_cannot_collide_with_another_item(
        self, auth_client, vehicle_payload
    ):
        first = auth_client.post("/api/items/", vehicle_payload, format="json")
        second = auth_client.post(
            "/api/items/",
            dict(vehicle_payload, identifier="DL8CAF5031", name="Car"),
            format="json",
        )
        assert second.status_code == 201

        response = auth_client.put(
            "/api/items/%s/" % second.data["data"]["id"],
            dict(vehicle_payload, identifier="UP25AK4922"),
            format="json",
        )

        assert response.status_code == 409
        assert response.data["error"]["details"]["item_id"] == first.data["data"]["id"]

    def test_an_item_keeps_its_own_identifier_on_edit(
        self, auth_client, vehicle_payload
    ):
        created = auth_client.post("/api/items/", vehicle_payload, format="json")
        item_id = created.data["data"]["id"]

        # Re-saving the same identifier must not trip the duplicate check.
        response = auth_client.put(
            "/api/items/%s/" % item_id, vehicle_payload, format="json"
        )
        assert response.status_code == 200


class TestDelete:
    def test_deleting_removes_the_item_and_its_reminder_records(
        self, auth_client, vehicle_payload, mongo_database
    ):
        created = auth_client.post("/api/items/", vehicle_payload, format="json")
        item_id = created.data["data"]["id"]

        mongo_database["reminders"].insert_one(
            {
                "item_id": item_id,
                "expiry_key": "insurance",
                "expiry_date": None,
                "reminder_type": "7_days",
            }
        )

        response = auth_client.delete("/api/items/%s/" % item_id)

        assert response.status_code == 200
        assert response.data["data"]["deleted"] is True
        assert mongo_database["items"].count_documents({}) == 0
        assert mongo_database["reminders"].count_documents({}) == 0

    def test_deleting_twice_is_a_404(self, auth_client, vehicle_payload):
        created = auth_client.post("/api/items/", vehicle_payload, format="json")
        item_id = created.data["data"]["id"]

        assert auth_client.delete("/api/items/%s/" % item_id).status_code == 200
        assert auth_client.delete("/api/items/%s/" % item_id).status_code == 404


class TestSeedCommand:
    """`manage.py seed_items` is the quickest way to see the app do something."""

    def test_it_loads_the_bundled_sample_data(self, mongo_database):
        from io import StringIO

        from django.core.management import call_command

        call_command("seed_items", stdout=StringIO())

        items = list(mongo_database["items"].find({}))
        assert len(items) == 8
        assert {item["category"] for item in items} >= {
            "vehicle",
            "credit_card",
            "debit_card",
            "document",
        }
        # Relative offsets in the seed file resolve against today, so the
        # sample data is always in a state worth looking at.
        licence = next(item for item in items if item["name"] == "Driving licence")
        assert licence["expiries"][0]["expires_on"].date() == today_local() - dt.timedelta(
            days=5
        )

    def test_running_it_twice_does_not_duplicate(self, mongo_database):
        from io import StringIO

        from django.core.management import call_command

        call_command("seed_items", stdout=StringIO())
        call_command("seed_items", stdout=StringIO())

        assert mongo_database["items"].count_documents({}) == 8
