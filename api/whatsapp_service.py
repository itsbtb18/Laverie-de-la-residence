from __future__ import annotations

import logging
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests
from django.utils import timezone

from .models import Booking, BookingStatus, CustomUser, UserRole

logger = logging.getLogger(__name__)

ALGIERS_TZ = ZoneInfo("Africa/Algiers")


def _whatsapp_service_base_url() -> str:
    return os.getenv("WHATSAPP_SERVICE_URL", "http://127.0.0.1:5000").rstrip("/")


def _django_api_key() -> str:
    return os.getenv("DJANGO_API_KEY", "").strip()


def _customer_site_url() -> str:
    return os.getenv(
        "CUSTOMER_SITE_URL",
        "https://127.0.0.1:5173/login",
    ).strip()


@dataclass(frozen=True)
class WhatsAppWelcomePayload:
    phone: str
    first_name: str
    last_name: str
    secret_code: str
    qr_payload: str
    site_url: str

    def to_json(self) -> dict[str, Any]:
        return {
            "phone": self.phone,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "prenom": self.first_name,
            "nom": self.last_name,
            "telephone": self.phone,
            "secret_code": self.secret_code,
            "codeSecret": self.secret_code,
            "lienSite": self.site_url,
            "site_url": self.site_url,
            "qrPayload": self.qr_payload,
            "qrCodeUrlOrId": self.qr_payload,
        }


@dataclass(frozen=True)
class WhatsAppConfirmationPayload:
    phone: str
    first_name: str
    last_name: str
    wash_mode_label: str
    booking_date: str
    start_time: str

    def to_json(self) -> dict[str, Any]:
        return {
            "phone": self.phone,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "prenom": self.first_name,
            "nom": self.last_name,
            "wash_mode_label": self.wash_mode_label,
            "modeLavage": self.wash_mode_label,
            "booking_date": self.booking_date,
            "date": self.booking_date,
            "start_time": self.start_time,
            "heure": self.start_time,
        }


@dataclass(frozen=True)
class WhatsAppReminderPayload:
    phone: str
    first_name: str
    last_name: str

    def to_json(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["prenom"] = self.first_name
        payload["nom"] = self.last_name
        return payload


def _post_whatsapp_endpoint(path: str, payload: dict[str, Any]) -> bool:
    api_key = _django_api_key()
    if not api_key:
        logger.warning("DJANGO_API_KEY manquant : notification WhatsApp ignorée.")
        return False

    url = f"{_whatsapp_service_base_url()}{path}"
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        if response.status_code >= 400:
            logger.error(
                "WhatsApp Cloud service error %s %s: %s",
                path,
                response.status_code,
                response.text[:500],
            )
            return False
        return True
    except requests.RequestException:
        logger.exception("Impossible de joindre le service WhatsApp Cloud (%s).", url)
        return False


def wash_mode_label_from_booking(booking: Booking) -> str:
    start = datetime.combine(booking.booking_date, booking.start_time)
    end = datetime.combine(booking.booking_date, booking.end_time)
    minutes = int((end - start).total_seconds() // 60)
    mapping = {
        15: "Rapide",
        30: "Express",
        45: "Premium",
        60: "VIP",
    }
    return mapping.get(minutes, f"Lavage ({minutes} min)")


def booking_start_in_algiers(booking: Booking) -> datetime:
    return datetime.combine(
        booking.booking_date,
        booking.start_time,
        tzinfo=ALGIERS_TZ,
    )


def notify_welcome_account(user: CustomUser, secret_code: str | None = None) -> None:
    if user.role != UserRole.CUSTOMER:
        return

    code = secret_code or user.secret_code_plain
    if not code:
        return

    payload = WhatsAppWelcomePayload(
        phone=user.phone,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        secret_code=code,
        site_url=_customer_site_url(),
        qr_payload=f"LOGIN:{user.phone}:{code}",
    )
    _post_whatsapp_endpoint("/api/v1/whatsapp/welcome", payload.to_json())


def notify_booking_confirmation(booking: Booking) -> None:
    if booking.status == BookingStatus.ANNULE:
        return

    payload = WhatsAppConfirmationPayload(
        phone=booking.user.phone,
        first_name=booking.user.first_name or "",
        last_name=booking.user.last_name or "",
        wash_mode_label=wash_mode_label_from_booking(booking),
        booking_date=booking.booking_date.isoformat(),
        start_time=booking.start_time.strftime("%H:%M"),
    )
    _post_whatsapp_endpoint("/api/v1/whatsapp/confirmation", payload.to_json())


def notify_booking_reminder(booking: Booking) -> bool:
    if booking.status == BookingStatus.ANNULE:
        return False

    payload = WhatsAppReminderPayload(
        phone=booking.user.phone,
        first_name=booking.user.first_name or "",
        last_name=booking.user.last_name or "",
    )
    sent = _post_whatsapp_endpoint("/api/v1/whatsapp/reminder", payload.to_json())
    if sent:
        mark_booking_reminder_sent(booking)
    return sent


def mark_booking_reminder_sent(booking: Booking) -> None:
    booking.whatsapp_reminder_sent_at = timezone.now()
    booking.save(update_fields=["whatsapp_reminder_sent_at"])


def bookings_due_for_whatsapp_reminder(
    *,
    minutes_before: int = 30,
    window_minutes: int = 2,
) -> list[Booking]:
    now = timezone.now().astimezone(ALGIERS_TZ)
    target = now + timedelta(minutes=minutes_before)
    window = timedelta(minutes=window_minutes)

    queryset = (
        Booking.objects.select_related(
            "user",
            "resource",
            "resource__establishment",
        )
        .filter(
            status__in=[BookingStatus.EN_ATTENTE, BookingStatus.PAYE],
            whatsapp_reminder_sent_at__isnull=True,
        )
        .order_by("booking_date", "start_time")
    )

    due: list[Booking] = []
    for booking in queryset:
        start_at = booking_start_in_algiers(booking)
        if target - window <= start_at <= target + window:
            due.append(booking)
    return due
