"""JWT creation/validation and credential checking.

This is a single-user personal application: the one set of credentials lives
in the environment (``APP_USERNAME`` / ``APP_PASSWORD``) and is never written
to MongoDB.  Tokens are signed with ``JWT_SECRET_KEY``.
"""

from __future__ import annotations

import datetime as dt
import hmac
import logging
import secrets
import uuid

import jwt
from django.conf import settings

from core.errors import ApiError, ErrorCode

logger = logging.getLogger(__name__)

ACCESS_TOKEN = "access"
REFRESH_TOKEN = "refresh"

UTC = dt.timezone.utc


class AppUser:
    """Minimal user object.

    ``django.contrib.auth`` is not installed (there is no relational
    database), so DRF gets this tiny stand-in instead.
    """

    is_authenticated = True
    is_anonymous = False
    is_active = True
    is_staff = False

    def __init__(self, username, csrf_token=None, token_id=None):
        self.username = username
        self.csrf_token = csrf_token
        self.token_id = token_id
        # DRF throttling identifies the requester by ``pk``; there is exactly
        # one user in this application, so the username is its identity.
        self.pk = username
        self.id = username

    def __str__(self):
        return self.username

    def __eq__(self, other):
        return isinstance(other, AppUser) and other.username == self.username

    def __hash__(self):
        return hash(self.username)


def _require_configuration():
    if not settings.APP_PASSWORD:
        raise ApiError(
            ErrorCode.AUTH_NOT_CONFIGURED,
            "Authentication is not configured on the server.",
            status_code=503,
        )
    if not settings.JWT_SECRET_KEY:
        raise ApiError(
            ErrorCode.AUTH_NOT_CONFIGURED,
            "Authentication is not configured on the server.",
            status_code=503,
        )


def verify_credentials(username, password):
    """Constant-time credential check against the environment values."""
    _require_configuration()
    username_ok = hmac.compare_digest(
        str(username or "").encode("utf-8"),
        str(settings.APP_USERNAME or "").encode("utf-8"),
    )
    password_ok = hmac.compare_digest(
        str(password or "").encode("utf-8"),
        str(settings.APP_PASSWORD or "").encode("utf-8"),
    )
    return username_ok and password_ok


def new_csrf_token():
    return secrets.token_urlsafe(32)


def _encode(payload):
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    # PyJWT >= 2 returns a str already; keep this defensive for safety.
    return token.decode("utf-8") if isinstance(token, bytes) else token


def create_token(token_type, username, csrf_token, lifetime):
    now = dt.datetime.now(tz=UTC)
    expires_at = now + lifetime
    payload = {
        "sub": username,
        "type": token_type,
        "csrf": csrf_token,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": uuid.uuid4().hex,
        "iss": settings.JWT_ISSUER,
    }
    return _encode(payload), expires_at


def create_token_pair(username, csrf_token=None):
    """Issue an access + refresh token pair bound to one CSRF value."""
    _require_configuration()
    csrf_token = csrf_token or new_csrf_token()
    access, access_expires = create_token(
        ACCESS_TOKEN,
        username,
        csrf_token,
        dt.timedelta(minutes=settings.JWT_ACCESS_TOKEN_LIFETIME_MINUTES),
    )
    refresh, refresh_expires = create_token(
        REFRESH_TOKEN,
        username,
        csrf_token,
        dt.timedelta(days=settings.JWT_REFRESH_TOKEN_LIFETIME_DAYS),
    )
    return {
        "access": access,
        "refresh": refresh,
        "csrf_token": csrf_token,
        "access_expires_at": access_expires,
        "refresh_expires_at": refresh_expires,
        "expires_in": int(settings.JWT_ACCESS_TOKEN_LIFETIME_MINUTES * 60),
    }


def decode_token(token, expected_type=ACCESS_TOKEN):
    """Decode and validate a token.

    Raises :class:`ApiError` with ``TOKEN_EXPIRED`` or ``TOKEN_INVALID``.
    The token value itself is never logged.
    """
    _require_configuration()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError:
        raise ApiError(
            ErrorCode.TOKEN_EXPIRED,
            "The session has expired. Please sign in again.",
            status_code=401,
        )
    except jwt.InvalidTokenError:
        raise ApiError(
            ErrorCode.TOKEN_INVALID,
            "The authentication token is invalid.",
            status_code=401,
        )

    if payload.get("type") != expected_type:
        raise ApiError(
            ErrorCode.TOKEN_INVALID,
            "The authentication token is invalid.",
            status_code=401,
        )
    if payload.get("sub") != settings.APP_USERNAME:
        # The configured username changed: old tokens must stop working.
        raise ApiError(
            ErrorCode.TOKEN_INVALID,
            "The authentication token is invalid.",
            status_code=401,
        )
    return payload


def user_from_payload(payload):
    return AppUser(
        username=payload.get("sub"),
        csrf_token=payload.get("csrf"),
        token_id=payload.get("jti"),
    )
