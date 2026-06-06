from __future__ import annotations

import hashlib
import hmac
import json
import os

import requests
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import ChronoJWTAuthentication
from .models import Booking, BookingStatus, PaymentMethod

CHARGILY_SECRET_KEY = os.getenv("CHARGILY_SECRET_KEY", "")
CHARGILY_BASE_URL = os.getenv("CHARGILY_BASE_URL", "https://pay.chargily.net/test/api/v2")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://127.0.0.1:5173")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:8000")


def _auth_headers() -> dict:
    return {
        "Authorization": f"Bearer {CHARGILY_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _is_public_url(url: str) -> bool:
    """Returns True only for real public HTTPS URLs (not localhost / 127.0.0.1)."""
    return (
        url.startswith("https://")
        and "127.0.0.1" not in url
        and "localhost" not in url
    )


# ---------------------------------------------------------------------------
# 1. Create a Chargily checkout
# ---------------------------------------------------------------------------

class ChargilyCreateCheckoutView(APIView):
    """
    POST /api/payments/chargily/create-checkout/
    Body: { "booking_id": <int> }
    Returns: { "checkout_url": "...", "checkout_id": "..." }
    """
    authentication_classes = [ChronoJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        booking_id = request.data.get("booking_id")
        if not booking_id:
            return Response(
                {"error": "booking_id est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            booking = Booking.objects.select_related(
                "resource", "resource__establishment", "user"
            ).get(pk=booking_id, user=request.user)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Réservation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if booking.payment_method != PaymentMethod.BARIDIMOB:
            return Response(
                {"error": "La méthode de paiement n'est pas BaridiMob."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ------------------------------------------------------------------
        # Build Chargily checkout payload
        # Docs: https://dev.chargily.com/pay-v2/api-reference/checkouts/create
        # ------------------------------------------------------------------
        payload: dict = {
            "amount": int(booking.total_price),
            "currency": "dzd",
            # payment_method defaults to "edahabia" (BaridiMob) — customer can
            # still change it on Chargily's hosted page.
            "payment_method": "edahabia",
            "success_url": f"{FRONTEND_BASE_URL}/payment/success?booking_id={booking.pk}",
            "failure_url": f"{FRONTEND_BASE_URL}/payment/failure?booking_id={booking.pk}",
            "description": (
                f"Réservation {booking.booking_reference} — "
                f"{booking.resource.label} "
                f"({booking.booking_date} {booking.start_time:%H:%M}–{booking.end_time:%H:%M})"
            ),
            # IMPORTANT: the correct field name is "webhook_endpoint" (not "webhook_url")
            # see: https://dev.chargily.com/pay-v2/api-reference/checkouts/create
            "metadata": {
                "booking_id": str(booking.pk),
                "booking_reference": booking.booking_reference,
            },
            "locale": "fr",
            # Merchant pays Chargily fees (not the customer)
            "chargily_pay_fees_allocation": "merchant",
        }

        # Only attach webhook_endpoint when backend is publicly reachable via HTTPS
        if _is_public_url(BACKEND_BASE_URL):
            payload["webhook_endpoint"] = f"{BACKEND_BASE_URL}/api/payments/chargily/webhook/"

        # ------------------------------------------------------------------
        # Call Chargily API
        # ------------------------------------------------------------------
        try:
            resp = requests.post(
                f"{CHARGILY_BASE_URL}/checkouts",
                json=payload,
                headers=_auth_headers(),
                timeout=15,
            )
        except requests.RequestException as exc:
            return Response(
                {"error": f"Erreur réseau vers Chargily : {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if not resp.ok:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            return Response(
                {"error": f"Erreur Chargily ({resp.status_code})", "detail": detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        data = resp.json()
        checkout_id: str = data.get("id", "")
        checkout_url: str = data.get("checkout_url", "")

        # Persist checkout ID (bypass model full_clean to avoid validation side-effects)
        Booking.objects.filter(pk=booking.pk).update(chargily_checkout_id=checkout_id)

        return Response({"checkout_url": checkout_url, "checkout_id": checkout_id})


# ---------------------------------------------------------------------------
# 2. Webhook — Chargily POSTs here when a payment event occurs
# ---------------------------------------------------------------------------

class ChargilyWebhookView(APIView):
    """
    POST /api/payments/chargily/webhook/
    Verifies HMAC-SHA256 signature then reacts to checkout.paid / checkout.failed.
    Must return 200 quickly — Chargily retries on any non-2xx response.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        signature: str = request.META.get("HTTP_SIGNATURE", "")
        if not signature:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        payload_bytes: bytes = request.body

        # Verify signature: HMAC-SHA256 of raw body signed with secret key
        computed = hmac.new(
            CHARGILY_SECRET_KEY.encode("utf-8"),
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature, computed):
            return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            event = json.loads(payload_bytes)
        except json.JSONDecodeError:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        event_type: str = event.get("type", "")
        checkout_data: dict = event.get("data", {})
        metadata: dict = checkout_data.get("metadata") or {}
        booking_id = metadata.get("booking_id")

        if event_type == "checkout.paid" and booking_id:
            # Mark booking as PAYE — use queryset update to avoid full_clean overhead
            Booking.objects.filter(
                pk=booking_id,
                status=BookingStatus.EN_ATTENTE,
            ).update(
                status=BookingStatus.PAYE,
                validated_at=timezone.now(),
            )

        # checkout.failed / checkout.canceled → booking stays EN_ATTENTE,
        # the customer can retry or switch to cash on the failure page.

        # Always respond 200 so Chargily doesn't keep retrying
        return Response(status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 3. Verify — frontend success page polls this to confirm payment
#    (primary mechanism in local dev where webhook can't reach localhost)
# ---------------------------------------------------------------------------

class ChargilyVerifyPaymentView(APIView):
    """
    GET /api/payments/chargily/verify/?booking_id=<int>
    Asks Chargily for the checkout status and marks booking PAYE if paid.
    Checkout statuses: pending | processing | paid | failed | canceled
    """
    authentication_classes = [ChronoJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        booking_id = request.query_params.get("booking_id")
        if not booking_id:
            return Response(
                {"error": "booking_id est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            booking = Booking.objects.select_related(
                "resource", "resource__establishment"
            ).get(pk=booking_id, user=request.user)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Réservation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        def _paid_response(bk: Booking) -> Response:
            return Response({
                "status": "paid",
                "booking_id": bk.pk,
                "booking_reference": bk.booking_reference,
                "booking_date": str(bk.booking_date),
                "start_time": str(bk.start_time)[:5],
                "end_time": str(bk.end_time)[:5],
                "total_price": str(bk.total_price),
                "resource_label": bk.resource.label,
                "establishment_name": bk.resource.establishment.name,
            })

        # Already confirmed (webhook arrived before polling)
        if booking.status == BookingStatus.PAYE:
            return _paid_response(booking)

        # No checkout started yet
        if not booking.chargily_checkout_id:
            return Response({"status": "pending"})

        # Ask Chargily for the live checkout status
        try:
            resp = requests.get(
                f"{CHARGILY_BASE_URL}/checkouts/{booking.chargily_checkout_id}",
                headers=_auth_headers(),
                timeout=15,
            )
            resp.raise_for_status()
            checkout = resp.json()
        except requests.RequestException as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        chargily_status: str = checkout.get("status", "pending")

        # Paid → confirm booking
        if chargily_status == "paid":
            Booking.objects.filter(pk=booking.pk).update(
                status=BookingStatus.PAYE,
                validated_at=timezone.now(),
            )
            booking.refresh_from_db()
            return _paid_response(booking)

        # Failed or canceled → let frontend redirect to failure page
        if chargily_status in {"failed", "canceled"}:
            return Response({"status": "failed"})

        # "pending" or "processing" → still in progress, keep polling
        return Response({"status": "pending"})
