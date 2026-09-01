"""Authentication: environment credentials, JWT cookies, CSRF."""

from __future__ import annotations

from django.conf import settings


def login(client, username="admin", password="super-secret-test-password"):
    return client.post(
        "/api/auth/login/",
        {"username": username, "password": password},
        format="json",
    )


class TestLogin:
    def test_valid_login_returns_tokens_and_sets_cookies(self, api_client):
        response = login(api_client)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["access"]
        assert body["data"]["refresh"]
        assert body["data"]["csrf_token"]

        assert settings.AUTH_COOKIE_ACCESS_NAME in response.cookies
        assert settings.AUTH_COOKIE_REFRESH_NAME in response.cookies
        assert settings.AUTH_COOKIE_CSRF_NAME in response.cookies

        access_cookie = response.cookies[settings.AUTH_COOKIE_ACCESS_NAME]
        assert access_cookie["httponly"] is True
        # The CSRF cookie must stay readable for the double-submit header.
        assert response.cookies[settings.AUTH_COOKIE_CSRF_NAME]["httponly"] == ""

    def test_invalid_username_is_rejected(self, api_client):
        response = login(api_client, username="not-the-admin")

        assert response.status_code == 401
        body = response.json()
        assert body["success"] is False
        assert body["error"]["code"] == "INVALID_CREDENTIALS"
        assert settings.AUTH_COOKIE_ACCESS_NAME not in response.cookies

    def test_invalid_password_is_rejected(self, api_client):
        response = login(api_client, password="wrong-password")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_missing_fields_fail_validation(self, api_client):
        response = api_client.post("/api/auth/login/", {}, format="json")

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_password_is_never_echoed_back(self, api_client):
        response = login(api_client)
        assert settings.APP_PASSWORD not in response.content.decode()


class TestProtectedEndpoints:
    def test_without_token_is_unauthorized(self, api_client):
        response = api_client.get("/api/items/")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_with_bearer_token_is_allowed(self, api_client):
        token = login(api_client).json()["data"]["access"]
        client = api_client.__class__()
        client.credentials(HTTP_AUTHORIZATION="Bearer %s" % token)

        response = client.get("/api/items/")

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_with_cookie_is_allowed(self, api_client):
        login(api_client)  # cookies are stored on the test client

        response = api_client.get("/api/items/")

        assert response.status_code == 200

    def test_invalid_token_is_rejected(self, api_client):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")

        response = api_client.get("/api/items/")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "TOKEN_INVALID"

    def test_me_endpoint_reports_the_session(self, auth_client):
        response = auth_client.get("/api/auth/me/")

        assert response.status_code == 200
        assert response.json()["data"]["username"] == settings.APP_USERNAME


class TestCsrf:
    def test_cookie_auth_without_csrf_header_is_blocked(self, api_client, vehicle_payload):
        login(api_client)

        response = api_client.post("/api/items/", vehicle_payload, format="json")

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "CSRF_FAILED"

    def test_cookie_auth_with_wrong_csrf_header_is_blocked(
        self, api_client, vehicle_payload
    ):
        login(api_client)
        api_client.credentials(HTTP_X_CSRF_TOKEN="some-other-value")

        response = api_client.post("/api/items/", vehicle_payload, format="json")

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "CSRF_FAILED"

    def test_bearer_auth_does_not_require_csrf(self, api_client, vehicle_payload):
        token = login(api_client).json()["data"]["access"]
        client = api_client.__class__()
        client.credentials(HTTP_AUTHORIZATION="Bearer %s" % token)

        response = client.post("/api/items/", vehicle_payload, format="json")

        assert response.status_code == 201


class TestRefreshAndLogout:
    def test_refresh_issues_a_new_token_pair(self, api_client):
        login(api_client)

        response = api_client.post("/api/auth/refresh/", {}, format="json")

        assert response.status_code == 200
        assert response.json()["data"]["access"]
        assert settings.AUTH_COOKIE_ACCESS_NAME in response.cookies

    def test_refresh_without_a_token_is_unauthorized(self, api_client):
        response = api_client.post("/api/auth/refresh/", {}, format="json")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_an_access_token_cannot_be_used_to_refresh(self, api_client):
        access = login(api_client).json()["data"]["access"]
        client = api_client.__class__()

        response = client.post(
            "/api/auth/refresh/", {"refresh": access}, format="json"
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "TOKEN_INVALID"

    def test_logout_clears_the_cookies(self, api_client):
        login(api_client)

        response = api_client.post("/api/auth/logout/", {}, format="json")

        assert response.status_code == 200
        assert response.cookies[settings.AUTH_COOKIE_ACCESS_NAME].value == ""
