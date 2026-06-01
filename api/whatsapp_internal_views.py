from __future__ import annotations

import os

from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Booking
from .whatsapp_service import (
    bookings_due_for_whatsapp_reminder,
    mark_booking_reminder_sent,
    notify_booking_reminder,
    wash_mode_label_from_booking,
)


class WhatsAppInternalAuthMixin:
    def _is_authorized(self, request) -> bool:
        expected = os.getenv("DJANGO_API_KEY", "").strip()
        if not expected:
            return False

        authorization = request.headers.get("Authorization", "")
        token = (
            authorization[7:].strip()
            if authorization.startswith("Bearer ")
            else ""
        )
        return token == expected


class WhatsAppRemindersDueAPIView(WhatsAppInternalAuthMixin, APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        if not self._is_authorized(request):
            return Response({"detail": "Non autorisé."}, status=401)

        bookings = bookings_due_for_whatsapp_reminder()
        payload = [
            {
                "id": booking.id,
                "phone": booking.user.phone,
                "firstName": booking.user.first_name,
                "lastName": booking.user.last_name,
                "clientName": f"{booking.user.first_name} {booking.user.last_name}".strip(),
                "establishmentName": booking.resource.establishment.name,
                "date": booking.booking_date.isoformat(),
                "time": booking.start_time.strftime("%H:%M"),
                "washModeLabel": wash_mode_label_from_booking(booking),
                "bookingReference": booking.booking_reference,
            }
            for booking in bookings
        ]
        return Response({"reminders": payload})


class WhatsAppReminderMarkSentAPIView(WhatsAppInternalAuthMixin, APIView):
    """Marque un rappel comme envoyé (appelé par le scheduler Node après envoi Meta)."""

    authentication_classes = []
    permission_classes = []

    def post(self, request, booking_id: int):
        if not self._is_authorized(request):
            return Response({"detail": "Non autorisé."}, status=401)

        try:
            booking = Booking.objects.get(pk=booking_id)
        except Booking.DoesNotExist:
            return Response({"detail": "Réservation introuvable."}, status=404)

        mark_booking_reminder_sent(booking)
        return Response({"success": True})


class WhatsAppReminderSendAPIView(WhatsAppInternalAuthMixin, APIView):
    """Envoi manuel d'un rappel (debug / reprise)."""

    authentication_classes = []
    permission_classes = []

    def post(self, request, booking_id: int):
        if not self._is_authorized(request):
            return Response({"detail": "Non autorisé."}, status=401)

        try:
            booking = Booking.objects.select_related(
                "user",
                "resource",
                "resource__establishment",
            ).get(pk=booking_id)
        except Booking.DoesNotExist:
            return Response({"detail": "Réservation introuvable."}, status=404)

        if notify_booking_reminder(booking):
            return Response({"success": True})

        return Response(
            {"detail": "Échec d'envoi WhatsApp."},
            status=502,
        )
