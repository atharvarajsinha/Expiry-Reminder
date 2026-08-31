"""Helpers that keep every API response in the same envelope.

Success::

    {"success": true, "data": {...}}

Failure::

    {"success": false, "error": {"code": "...", "message": "..."}}
"""

from __future__ import annotations

from rest_framework.response import Response


def success(data=None, status_code=200, meta=None):
    payload = {"success": True, "data": data if data is not None else {}}
    if meta:
        payload["meta"] = meta
    return Response(payload, status=status_code)


def failure(code, message, status_code=400, details=None):
    error = {"code": code, "message": message}
    if details:
        error["details"] = details
    return Response({"success": False, "error": error}, status=status_code)
