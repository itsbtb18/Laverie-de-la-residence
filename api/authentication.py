from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed

from .models import CustomUser, UserRole, normalize_phone

TOKEN_TTL = timedelta(days=7)


def _urlsafe_b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _urlsafe_b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _secret_key() -> bytes:
    return settings.SECRET_KEY.encode("utf-8")


def encode_jwt(payload: dict[str, object]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_part = _urlsafe_b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_part = _urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    signature = hmac.new(_secret_key(), signing_input, hashlib.sha256).digest()
    return f"{header_part}.{payload_part}.{_urlsafe_b64encode(signature)}"


def decode_jwt(token: str) -> dict[str, object]:
    try:
        header_part, payload_part, signature_part = token.split(".")
    except ValueError as exc:
        raise AuthenticationFailed("Jeton invalide.") from exc

    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    expected_signature = hmac.new(_secret_key(), signing_input, hashlib.sha256).digest()

    try:
        provided_signature = _urlsafe_b64decode(signature_part)
        payload = json.loads(_urlsafe_b64decode(payload_part).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AuthenticationFailed("Jeton invalide.") from exc

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise AuthenticationFailed("Signature de jeton invalide.")

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp <= int(timezone.now().timestamp()):
        raise AuthenticationFailed("Jeton expiré.")

    return payload


def build_login_response(user: CustomUser) -> dict[str, object]:
    now = timezone.now()
    payload = {
        "sub": str(user.pk),
        "phone": user.phone,
        "role": user.role,
        "establishment_id": user.establishment_id,
        "iat": int(now.timestamp()),
        "exp": int((now + TOKEN_TTL).timestamp()),
        "jti": secrets.token_hex(16),
    }

    return {
        "access_token": encode_jwt(payload),
        "token_type": "Bearer",
        "role": user.role,
        # Renvoyé pour les ADMIN comme pour les CLIENTS : un client est rattaché à
        # un seul établissement, et la page de réservation ne doit afficher que les
        # modes (et prix) de CET établissement. Reste None pour le super admin.
        "establishment_id": user.establishment_id if user.role != UserRole.SUPER_ADMIN else None,
        "establishment_name": user.establishment.name if user.establishment_id else None,
        "user_id": user.id,
        "phone": user.phone,
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
    }


class ChronoJWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith(f"{self.keyword} "):
            return None

        token = authorization[len(self.keyword) + 1 :].strip()
        if not token:
            raise AuthenticationFailed("Jeton manquant.")

        payload = decode_jwt(token)
        try:
            user = CustomUser.objects.select_related("establishment").get(
                pk=int(payload["sub"])
            )
        except (CustomUser.DoesNotExist, KeyError, TypeError, ValueError) as exc:
            raise AuthenticationFailed("Utilisateur introuvable.") from exc

        if not user.is_active:
            raise AuthenticationFailed("Utilisateur inactif.")

        return (user, payload)


def extract_login_payload(data: dict[str, object]) -> tuple[str, str]:
    phone = (
        data.get("phone")
        or data.get("phone_number")
        or data.get("phoneNumber")
        or ""
    )
    secret_code = (
        data.get("secret_code")
        or data.get("secretCode")
        or data.get("code_secret")
        or ""
    )
    return normalize_phone(str(phone)), str(secret_code)