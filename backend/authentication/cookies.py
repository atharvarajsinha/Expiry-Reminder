"""Cookie based token storage.

The frontend never stores the JWT itself: the access and refresh tokens are
set as ``HttpOnly`` cookies (invisible to JavaScript, therefore not stealable
by XSS).  A third, readable ``csrf_token`` cookie carries the value that must
be echoed back in the ``X-CSRF-Token`` header on unsafe requests -- the
classic double-submit defence, needed because cookies are sent automatically.
"""

from __future__ import annotations

from django.conf import settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def _common_kwargs():
    return {
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
    }


def set_auth_cookies(response, tokens):
    """Attach access/refresh/csrf cookies to ``response``."""
    common = _common_kwargs()

    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS_NAME,
        tokens["access"],
        max_age=int(settings.JWT_ACCESS_TOKEN_LIFETIME_MINUTES * 60),
        httponly=True,
        path=settings.AUTH_COOKIE_PATH,
        **common,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH_NAME,
        tokens["refresh"],
        max_age=int(settings.JWT_REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60),
        httponly=True,
        path=settings.AUTH_COOKIE_PATH,
        **common,
    )
    # Readable by the frontend so it can echo it back in the header.
    response.set_cookie(
        settings.AUTH_COOKIE_CSRF_NAME,
        tokens["csrf_token"],
        max_age=int(settings.JWT_REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60),
        httponly=False,
        path=settings.AUTH_COOKIE_PATH,
        **common,
    )
    return response


def clear_auth_cookies(response):
    for name in (
        settings.AUTH_COOKIE_ACCESS_NAME,
        settings.AUTH_COOKIE_REFRESH_NAME,
        settings.AUTH_COOKIE_CSRF_NAME,
    ):
        response.delete_cookie(
            name,
            path=settings.AUTH_COOKIE_PATH,
            domain=settings.AUTH_COOKIE_DOMAIN,
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )
    return response


def csrf_header_key():
    """WSGI META key for the configured CSRF header."""
    return "HTTP_" + settings.CSRF_HEADER_NAME.upper().replace("-", "_")


def read_access_cookie(request):
    return request.COOKIES.get(settings.AUTH_COOKIE_ACCESS_NAME)


def read_refresh_cookie(request):
    return request.COOKIES.get(settings.AUTH_COOKIE_REFRESH_NAME)
