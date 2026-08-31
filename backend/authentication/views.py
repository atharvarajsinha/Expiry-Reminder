"""Authentication endpoints: login, refresh, logout, me."""

from __future__ import annotations

import logging

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from authentication import cookies
from authentication.jwt_service import (
    REFRESH_TOKEN,
    create_token_pair,
    decode_token,
    verify_credentials,
)
from authentication.serializers import LoginSerializer, RefreshSerializer
from core.errors import ApiError, ErrorCode
from core.responses import success

logger = logging.getLogger(__name__)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _token_response(tokens, status_code=200, extra=None):
    data = {
        "token_type": "Bearer",
        "expires_in": tokens["expires_in"],
        # Readable CSRF value; the frontend echoes it in X-CSRF-Token.
        "csrf_token": tokens["csrf_token"],
        "username": settings.APP_USERNAME,
    }
    if settings.AUTH_RETURN_TOKENS_IN_BODY:
        data["access"] = tokens["access"]
        data["refresh"] = tokens["refresh"]
    if extra:
        data.update(extra)

    response = success(data, status_code=status_code)
    return cookies.set_auth_cookies(response, tokens)


class LoginView(APIView):
    """``POST /api/auth/login/`` -- validates credentials from the environment."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        if not verify_credentials(username, password):
            # Never log the attempted password (or the username value).
            logger.warning("Failed login attempt from %s", _client_ip(request))
            raise ApiError(
                ErrorCode.INVALID_CREDENTIALS,
                "Invalid username or password.",
                status_code=401,
            )

        tokens = create_token_pair(settings.APP_USERNAME)
        logger.info("Login succeeded for the configured application user")
        return _token_response(tokens, status_code=200)


class RefreshView(APIView):
    """``POST /api/auth/refresh/`` -- rotates the token pair."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "login"

    def post(self, request):
        serializer = RefreshSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data.get("refresh") or cookies.read_refresh_cookie(
            request
        )
        if not token:
            raise ApiError(
                ErrorCode.AUTHENTICATION_REQUIRED,
                "No refresh token was provided.",
                status_code=401,
            )

        decode_token(token, expected_type=REFRESH_TOKEN)
        # Rotation: a brand new CSRF value is issued alongside the new pair.
        tokens = create_token_pair(settings.APP_USERNAME)
        return _token_response(tokens, status_code=200)


class LogoutView(APIView):
    """``POST /api/auth/logout/`` -- clears the authentication cookies."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        response = success({"detail": "Signed out."})
        return cookies.clear_auth_cookies(response)


class MeView(APIView):
    """``GET /api/auth/me/`` -- confirms the session is still valid."""

    throttle_scope = "read"

    def get(self, request):
        return success(
            {
                "username": request.user.username,
                "authenticated": True,
            }
        )
