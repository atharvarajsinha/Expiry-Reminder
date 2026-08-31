"""DRF authentication class.

Order of precedence:

1. the ``access_token`` HttpOnly cookie (how the browser frontend talks to
   the API), which additionally requires a matching ``X-CSRF-Token`` header
   on unsafe methods, and
2. the ``Authorization: Bearer <token>`` header (curl, scripts, mobile).
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from authentication import cookies
from authentication.jwt_service import decode_token, user_from_payload
from core.errors import ApiError, ErrorCode


class CookieJWTAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        token, from_cookie = self._get_token(request)
        if not token:
            return None  # anonymous; IsAuthenticated will reject it

        payload = decode_token(token)  # raises ApiError (401) when invalid
        user = user_from_payload(payload)

        if from_cookie:
            self._check_csrf(request, payload)

        return (user, token)

    def authenticate_header(self, request):
        return self.keyword

    # -- helpers ---------------------------------------------------------
    def _get_token(self, request):
        header = get_authorization_header(request).split()
        if header and header[0].lower() == self.keyword.lower().encode():
            if len(header) != 2:
                raise ApiError(
                    ErrorCode.TOKEN_INVALID,
                    "Malformed Authorization header.",
                    status_code=401,
                )
            return header[1].decode("utf-8", errors="ignore"), False

        cookie_token = cookies.read_access_cookie(request)
        if cookie_token:
            return cookie_token, True
        return None, False

    def _check_csrf(self, request, payload):
        if not settings.CSRF_PROTECTION_ENABLED:
            return
        if request.method in cookies.SAFE_METHODS:
            return

        sent = request.META.get(cookies.csrf_header_key(), "")
        expected = payload.get("csrf") or ""
        if not sent or not expected or sent != expected:
            raise ApiError(
                ErrorCode.CSRF_FAILED,
                "Missing or invalid %s header." % settings.CSRF_HEADER_NAME,
                status_code=403,
            )
