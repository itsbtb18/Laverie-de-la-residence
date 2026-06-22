"""Structured API error codes and responses."""

from __future__ import annotations

from rest_framework.response import Response


class ErrorCode:
    AUTH_MISSING_FIELDS = "AUTH_MISSING_FIELDS"
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
    AUTH_ACCOUNT_INACTIVE = "AUTH_ACCOUNT_INACTIVE"
    STAFF_ACCESS_DENIED = "STAFF_ACCESS_DENIED"
    CUSTOMER_USE_CLIENT_PORTAL = "CUSTOMER_USE_CLIENT_PORTAL"
    PHONE_ALREADY_EXISTS = "PHONE_ALREADY_EXISTS"
    PHONE_INVALID_FORMAT = "PHONE_INVALID_FORMAT"
    SECRET_CODE_INVALID_FORMAT = "SECRET_CODE_INVALID_FORMAT"
    FIELD_REQUIRED = "FIELD_REQUIRED"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BOOKING_PENDING_LIMIT = "BOOKING_PENDING_LIMIT"
    NOT_FOUND = "NOT_FOUND"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    SERVER_ERROR = "SERVER_ERROR"


def error_response(code: str, detail: str, status: int, **extra) -> Response:
    payload: dict[str, object] = {"code": code, "detail": detail}
    payload.update(extra)
    return Response(payload, status=status)
