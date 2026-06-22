from __future__ import annotations

import logging
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, ExtractHour, ExtractWeekDay
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .api_errors import ErrorCode, error_response
from .authentication import (
    ChronoJWTAuthentication,
    build_login_response,
    extract_login_payload,
)
from .models import (
    Booking,
    BookingStatus,
    CustomUser,
    Establishment,
    EtablissementMode,
    ModeLavage,
    PaymentMethod,
    Resource,
    ResourceStatus,
    SystemConfig,
    UserRole,
    normalize_phone,
)
from .serializers import (
    BookingReceiptSerializer,
    BookingSerializer,
    CustomUserSerializer,
    EstablishmentSerializer,
    EtablissementModeSerializer,
    ModeLavageSerializer,
    ResourceSerializer,
    SuperAdminBookingHistorySerializer,
    SuperAdminManagerSerializer,
    SuperAdminStatsSerializer,
    SystemConfigSerializer,
)
from .whatsapp_service import notify_booking_confirmation, notify_welcome_account

OPENING_TIME = time(8, 0)
CLOSING_TIME = time(22, 0)
DEFAULT_SLOT_STEP_MINUTES = 15
# Marge tampon (en minutes) imposée APRÈS chaque réservation pour laisser au
# client le temps de récupérer son linge avant le début du créneau suivant sur
# la même machine. Ex. : un rendez-vous finissant à 08:15 bloque la ressource
# jusqu'à 08:20. Appliquée symétriquement (gap des deux côtés) à toute la
# détection de chevauchement : disponibilités ET création/modification.
BOOKING_BUFFER_MINUTES = 5
PRICE_PER_MINUTE = Decimal("15.00")
WEEKDAY_COUNT = 7
WORKING_DAY_SLOT_COUNT = int(
    (CLOSING_TIME.hour * 60 - OPENING_TIME.hour * 60) / DEFAULT_SLOT_STEP_MINUTES
)


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _shift_time(t: time, minutes: int) -> time:
    """Décale une heure de `minutes` (peut être négatif), borné à [00:00, 23:59]."""
    total = max(0, min(t.hour * 60 + t.minute + minutes, 23 * 60 + 59))
    return time(total // 60, total % 60)


def _is_midnight(t: time) -> bool:
    return t.hour == 0 and t.minute == 0


def _closing_minutes(closing: time) -> int:
    """00:00 (minuit) est interprété comme la fin de journée (24:00)."""
    return 24 * 60 if _is_midnight(closing) else _minutes(closing)


def _closing_datetime(day, closing: time) -> datetime:
    """Datetime de fermeture, en gérant minuit (00:00 = lendemain 00:00)."""
    if _is_midnight(closing):
        return datetime.combine(day, time(0, 0)) + timedelta(days=1)
    return datetime.combine(day, closing)


def _slot_window_end(day, closing: time) -> datetime:
    """Borne supérieure pour la FIN des créneaux réservables.

    Un rendez-vous doit avoir start_time < end_time (même journée) : un créneau
    finissant pile à minuit (00:00) n'est donc pas réservable. Quand la fermeture
    est à minuit, on plafonne la fin des créneaux à 23:59 le même jour.
    """
    if _is_midnight(closing):
        return datetime.combine(day, time(23, 59))
    return datetime.combine(day, closing)


def _working_day_slot_count(opening: time, closing: time) -> int:
    """Nombre de créneaux (pas de 15 min) sur une journée de travail."""
    span = _closing_minutes(closing) - _minutes(opening)
    return max(int(span / DEFAULT_SLOT_STEP_MINUTES), 0)


def _establishment_hours(establishment) -> tuple[time, time]:
    """Heures d'ouverture/fermeture de l'établissement (avec repli sur les valeurs par défaut)."""
    opening = getattr(establishment, "opening_time", None) or OPENING_TIME
    closing = getattr(establishment, "closing_time", None) or CLOSING_TIME
    return opening, closing


class IsStaffUser(permissions.BasePermission):
    """Authenticated establishment staff (admin or super admin)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None)
            in {UserRole.ADMIN, UserRole.SUPER_ADMIN}
        )


class IsSuperAdmin(permissions.BasePermission):
    message = "Accès réservé au Super Admin."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == UserRole.SUPER_ADMIN
        )


def _active_resources_count(establishment_id: int) -> int:
    return Resource.objects.filter(
        establishment_id=establishment_id,
        status=ResourceStatus.ACTIF,
    ).count()


def _overlapping_bookings_queryset(
    establishment_id: int, booking_date, start_time, end_time
):
    # On élargit l'intervalle demandé de BOOKING_BUFFER_MINUTES de chaque côté
    # afin d'imposer une marge tampon entre deux réservations consécutives sur
    # la même ressource (le temps de retirer le linge).
    start_buffered = _shift_time(start_time, -BOOKING_BUFFER_MINUTES)
    end_buffered = _shift_time(end_time, BOOKING_BUFFER_MINUTES)
    return (
        Booking.objects.select_for_update()
        .filter(
            resource__establishment_id=establishment_id,
            booking_date=booking_date,
        )
        .exclude(status=BookingStatus.ANNULE)
        .filter(start_time__lt=end_buffered, end_time__gt=start_buffered)
    )


class EstablishmentViewSet(viewsets.ModelViewSet):
    queryset = Establishment.objects.all().order_by("name")
    serializer_class = EstablishmentSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [ChronoJWTAuthentication]

    @action(detail=True, methods=["get"], url_path="modes")
    def modes(self, request, pk=None):
        """Liste les modes de lavage activés pour cet établissement,
        avec le prix effectif (prix_specifique ou prix_base).
        Utilisé par la page de réservation côté client.
        """
        establishment = self.get_object()
        links = (
            EtablissementMode.objects.filter(etablissement=establishment)
            .select_related("mode")
            .order_by("-recommande", "mode__duree", "mode__nom")
        )
        data = [
            {
                "id": link.mode_id,
                "nom": link.mode.nom,
                "nom_ar": link.mode.nom_ar,
                "duree": link.mode.duree,
                "prix_base": link.mode.prix_base,
                "prix_effectif": link.prix_effectif,
                "capacite_max": link.mode.capacite_max,
                "types_vetements": link.mode.types_vetements,
                "types_vetements_ar": link.mode.types_vetements_ar,
                "message_guide": link.mode.message_guide,
                "message_guide_ar": link.mode.message_guide_ar,
                "textiles_interdits": link.mode.textiles_interdits,
                "textiles_interdits_ar": link.mode.textiles_interdits_ar,
                "consigne_securite": link.mode.consigne_securite,
                "consigne_securite_ar": link.mode.consigne_securite_ar,
                "recommande": link.recommande,
            }
            for link in links
        ]
        return Response(data)


class ResourceViewSet(viewsets.ModelViewSet):
    queryset = (
        Resource.objects.select_related("establishment")
        .all()
        .order_by("establishment__name", "label")
    )
    serializer_class = ResourceSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [ChronoJWTAuthentication]

    def get_permissions(self):
        # Only the super admin can add or remove postes; staff may still
        # read and toggle status (PATCH/PUT).
        if self.action in ("create", "destroy"):
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()
        establishment_id = self.request.query_params.get("establishment_id")
        if establishment_id:
            queryset = queryset.filter(establishment_id=establishment_id)
        return queryset

    def destroy(self, request, *args, **kwargs):
        from django.db.models import ProtectedError

        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {
                    "detail": "Impossible de supprimer ce poste : des réservations y sont rattachées.",
                },
                status=400,
            )
        return Response(status=204)


class CustomUserViewSet(viewsets.ModelViewSet):
    queryset = (
        CustomUser.objects.select_related("establishment")
        .all()
        .order_by("-date_joined")
    )
    serializer_class = CustomUserSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [ChronoJWTAuthentication]

    def get_permissions(self):
        # Only the super admin may delete a client account.
        if self.action == "destroy":
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()
        role = self.request.query_params.get("role")
        search = self.request.query_params.get("search")
        if role:
            queryset = queryset.filter(role=role)
        if search:
            queryset = queryset.filter(
                Q(phone__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        # Isolation par établissement : un client appartient à un et un seul
        # établissement. Un assistant (ADMIN) ne voit QUE les clients de son
        # propre établissement ; le super admin filtre via establishment_id
        # (l'établissement qu'il est en train de gérer).
        if role == UserRole.CUSTOMER:
            requester = self.request.user
            if getattr(requester, "role", None) == UserRole.ADMIN:
                queryset = queryset.filter(
                    establishment_id=requester.establishment_id
                )
            else:
                establishment_id = self.request.query_params.get("establishment_id")
                if establishment_id:
                    queryset = queryset.filter(establishment_id=establishment_id)
        return queryset

    def perform_create(self, serializer):
        created_in_person = serializer.validated_data.get("created_in_person", False)

        # Un client créé sur place est automatiquement rattaché à l'établissement
        # de l'assistant (ou super admin) qui le crée, s'il n'est pas déjà fourni.
        extra = {}
        role = serializer.validated_data.get("role", UserRole.CUSTOMER)
        provided_establishment = serializer.validated_data.get("establishment")
        creator_establishment_id = getattr(self.request.user, "establishment_id", None)
        if role == UserRole.CUSTOMER and provided_establishment is None:
            # L'assistant rattache au sien ; le super admin doit fournir l'établissement géré.
            if creator_establishment_id:
                extra["establishment_id"] = creator_establishment_id

        # Un client doit obligatoirement appartenir à un établissement.
        if role == UserRole.CUSTOMER and (
            provided_establishment is None and not extra.get("establishment_id")
        ):
            raise ValidationError(
                {"establishment": "Un client doit être rattaché à un établissement."}
            )

        user = serializer.save(**extra)

        if user.role == UserRole.CUSTOMER:
            notify_welcome_account(user, user.secret_code_plain or None)

    def create(self, request, *args, **kwargs):
        """Override create to include a ticket URL in the response so the frontend
        can navigate directly to the ticket page after creating a user.
        """
        logger = logging.getLogger(__name__)
        # Log auth headers and request user for debugging authentication issues
        try:
            auth_header = request.headers.get("Authorization")
            logger.debug("Create user request Authorization: %s", auth_header)
            logger.debug(
                "Request user before create(): is_authenticated=%s user=%s",
                getattr(request.user, "is_authenticated", None),
                getattr(request.user, "pk", None),
            )
            # Log a minimal set of META that can affect auth/proxy (for dev server)
            logger.debug(
                "Request META keys: PATH=%s REMOTE_ADDR=%s HTTP_HOST=%s",
                request.path,
                request.META.get("REMOTE_ADDR"),
                request.META.get("HTTP_HOST"),
            )
        except Exception:
            logger.exception("Failed to log create request diagnostics")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)

        # serializer.data may not include all fields (e.g., id) depending on
        # representation; use instance when available.
        instance = getattr(serializer, "instance", None)
        user_id = None
        if instance is not None:
            user_id = getattr(instance, "id", None)
        else:
            user_id = serializer.data.get("id")

        data = dict(serializer.data)
        if user_id is not None:
            ticket_path = f"/admin/dashboard/customers/{user_id}/ticket"
            data["ticket_url"] = ticket_path
            # also expose a Location header (relative) for clients that inspect it
            headers.setdefault("Location", ticket_path)

        return Response(data, status=201, headers=headers)

    @action(
        detail=False,
        methods=["post"],
        url_path="resolve-login-qr",
        permission_classes=[IsAuthenticated, IsStaffUser],
    )
    def resolve_login_qr(self, request):
        """Resolve a creation-ticket LOGIN QR to a customer record for staff navigation."""
        qr_text = request.data.get("qr_text")
        if qr_text:
            raw = str(qr_text).strip()
            if not raw.startswith("LOGIN:"):
                raise ValidationError(
                    {"qr_text": "Format de QR non reconnu. Attendu: LOGIN:telephone:code."}
                )
            parts = raw.split(":")
            phone = normalize_phone(parts[1] if len(parts) > 1 else "")
            secret_code = parts[2] if len(parts) > 2 else ""
        else:
            phone, secret_code = extract_login_payload(request.data)

        if not phone or not secret_code:
            return error_response(
                ErrorCode.AUTH_MISSING_FIELDS,
                "Numéro de téléphone et code secret requis.",
                400,
            )

        try:
            user = CustomUser.objects.get(phone=phone, role=UserRole.CUSTOMER)
        except CustomUser.DoesNotExist:
            return error_response(
                ErrorCode.NOT_FOUND,
                "Aucun client ne correspond à ce QR code.",
                404,
            )

        if not user.check_secret_code(secret_code):
            return error_response(
                ErrorCode.AUTH_INVALID_CREDENTIALS,
                "Code secret invalide pour ce client.",
                401,
            )

        return Response(
            {
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "phone": user.phone,
                "detail_url": f"/admin/dashboard/customers/{user.id}",
            },
            status=200,
        )

    def perform_update(self, serializer):
        previous_instance = self.get_object()
        old_status = previous_instance.role
        user = serializer.save()

        if user.role == UserRole.CUSTOMER and old_status != user.role:
            notify_welcome_account(user, user.secret_code_plain or None)


class BookingViewSet(viewsets.ModelViewSet):
    queryset = (
        Booking.objects.select_related(
            "user",
            "resource",
            "resource__establishment",
            "validated_by",
        )
        .all()
        .order_by("-created_at")
    )
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [ChronoJWTAuthentication]

    def get_permissions(self):
        # Only the super admin may permanently delete a booking.
        if self.action == "destroy":
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        # Un rendez-vous validé (PAYE) ne peut jamais être supprimé, même par le
        # super admin : sa suppression fausserait les statistiques de revenus.
        booking = self.get_object()
        if booking.status == BookingStatus.PAYE:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "Un rendez-vous validé ne peut pas être supprimé."
            )
        return super().destroy(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        from rest_framework.exceptions import PermissionDenied

        # Un rendez-vous validé (PAYE) est définitif : il ne peut plus être
        # modifié ni annulé par personne (client, assistant ou super admin),
        # afin de préserver l'intégrité des statistiques de revenus.
        booking = self.get_object()
        if booking.status != BookingStatus.EN_ATTENTE:
            raise PermissionDenied(
                "Ce rendez-vous est déjà validé ou annulé : il ne peut plus être modifié."
            )

        # Assistants (ADMIN role) cannot set status to ANNULE — only super admin can cancel.
        new_status = request.data.get("status")
        if new_status == BookingStatus.ANNULE and getattr(request.user, "role", None) == UserRole.ADMIN:
            raise PermissionDenied("Seul le super admin peut annuler une réservation.")
        return super().partial_update(request, *args, **kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        establishment_id = self.request.query_params.get("establishment_id")
        booking_date = self.request.query_params.get("date")
        search = self.request.query_params.get("search")
        if establishment_id:
            queryset = queryset.filter(resource__establishment_id=establishment_id)
        if booking_date:
            queryset = queryset.filter(booking_date=booking_date)
        if search:
            queryset = queryset.filter(
                Q(booking_reference__icontains=search)
                | Q(user__phone__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )
        return queryset

    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, pk=None):
        booking = self.get_queryset().get(pk=pk)
        secret_code = request.query_params.get("secret_code")
        ticket_kind = request.query_params.get("ticket_kind", "booking")

        payload = {
            "booking_id": booking.id,
            "booking_reference": booking.booking_reference,
            "establishment_name": booking.resource.establishment.name,
            "establishment_address": booking.resource.establishment.address,
            "booking_date": booking.booking_date,
            "start_time": booking.start_time,
            "end_time": booking.end_time,
            "client_first_name": booking.user.first_name,
            "client_last_name": booking.user.last_name,
            "client_phone": booking.user.phone,
            "secret_code": secret_code if ticket_kind == "account" else None,
            "total_price": booking.total_price,
            "payment_status": booking.status,
            "payment_status_label": booking.get_status_display(),
            "qr_text": f"VALIDATE_BOOKING:{booking.booking_reference}",
            "created_at": booking.created_at,
        }

        serializer = BookingReceiptSerializer(payload)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="available-slots")
    def available_slots(self, request):
        date_value = request.query_params.get("date")
        establishment_id = request.query_params.get("establishment_id")
        duration = int(request.query_params.get("duration", DEFAULT_SLOT_STEP_MINUTES))

        if not date_value or not establishment_id:
            raise ValidationError(
                {"detail": "Les paramètres date et establishment_id sont obligatoires."}
            )

        if duration <= 0:
            raise ValidationError({"duration": "La durée doit être supérieure à 0 minute."})

        try:
            booking_date = datetime.strptime(date_value, "%Y-%m-%d").date()
            establishment_id_int = int(establishment_id)
        except ValueError as exc:
            raise ValidationError({"detail": "Paramètres invalides."}) from exc

        try:
            establishment = Establishment.objects.get(pk=establishment_id_int)
        except Establishment.DoesNotExist as exc:
            raise ValidationError({"establishment_id": "Établissement introuvable."}) from exc

        opening_time, closing_time = _establishment_hours(establishment)

        max_duration = _closing_minutes(closing_time) - _minutes(opening_time)
        if duration > max_duration:
            raise ValidationError(
                {"duration": f"La durée ne peut pas dépasser {max_duration} minutes (heures d'ouverture)."}
            )

        active_resources = _active_resources_count(establishment_id_int)
        slots = []
        current_start = datetime.combine(booking_date, opening_time)
        last_start = _slot_window_end(booking_date, closing_time) - timedelta(
            minutes=duration
        )

        while current_start <= last_start:
            current_end = current_start + timedelta(minutes=duration)
            # Marge tampon de chaque côté du créneau candidat (voir BOOKING_BUFFER_MINUTES).
            start_buffered = _shift_time(current_start.time(), -BOOKING_BUFFER_MINUTES)
            end_buffered = _shift_time(current_end.time(), BOOKING_BUFFER_MINUTES)
            overlapping_count = (
                Booking.objects.filter(
                    resource__establishment_id=establishment_id_int,
                    booking_date=booking_date,
                    resource__status=ResourceStatus.ACTIF,
                )
                .exclude(status=BookingStatus.ANNULE)
                .filter(
                    start_time__lt=end_buffered, end_time__gt=start_buffered
                )
                .values("resource_id")
                .distinct()
                .count()
            )

            is_full = active_resources == 0 or overlapping_count >= active_resources
            slots.append(
                {
                    "start_time": current_start.time().strftime("%H:%M"),
                    "end_time": current_end.time().strftime("%H:%M"),
                    "reserved_resources": overlapping_count,
                    "total_resources": active_resources,
                    "available_resources": max(active_resources - overlapping_count, 0),
                    "status": "FULL" if is_full else "AVAILABLE",
                    "status_label": "Complet" if is_full else "Disponible",
                    "color": "red" if is_full else "green",
                }
            )
            # Espace chaque créneau proposé de la durée + marge tampon, afin de
            # laisser le temps de récupérer le linge avant le créneau suivant.
            # Ex. 15 min + 5 min : 19:00-19:15, 19:20-19:35, 19:40-19:55, ...
            current_start += timedelta(minutes=duration + BOOKING_BUFFER_MINUTES)

        return Response(
            {
                "date": booking_date,
                "establishment_id": establishment_id_int,
                "duration": duration,
                "opening_time": opening_time.strftime("%H:%M"),
                "closing_time": closing_time.strftime("%H:%M"),
                "total_resources": active_resources,
                "slots": slots,
            }
        )

    @action(detail=False, methods=["get"], url_path="available-slots-range")
    def available_slots_range(self, request):
        """Return availability for a range of dates in a single request.

        Parameters:
        - start: YYYY-MM-DD
        - end: YYYY-MM-DD
        - establishment_id
        - duration
        """
        start_value = request.query_params.get("start")
        end_value = request.query_params.get("end")
        establishment_id = request.query_params.get("establishment_id")
        duration = int(request.query_params.get("duration", DEFAULT_SLOT_STEP_MINUTES))

        if not start_value or not end_value or not establishment_id:
            raise ValidationError(
                {
                    "detail": "Les paramètres start, end et establishment_id sont obligatoires."
                }
            )

        if duration <= 0:
            raise ValidationError({"duration": "La durée doit être supérieure à 0 minute."})

        try:
            start_date = datetime.strptime(start_value, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_value, "%Y-%m-%d").date()
            establishment_id_int = int(establishment_id)
        except ValueError as exc:
            raise ValidationError({"detail": "Paramètres invalides."}) from exc

        if start_date > end_date:
            raise ValidationError(
                {"detail": "Le paramètre start doit être antérieur ou égal à end."}
            )

        try:
            establishment = Establishment.objects.get(pk=establishment_id_int)
        except Establishment.DoesNotExist as exc:
            raise ValidationError({"establishment_id": "Établissement introuvable."}) from exc

        opening_time, closing_time = _establishment_hours(establishment)
        max_duration = _closing_minutes(closing_time) - _minutes(opening_time)
        if duration > max_duration:
            raise ValidationError(
                {"duration": f"La durée ne peut pas dépasser {max_duration} minutes (heures d'ouverture)."}
            )

        active_resources = _active_resources_count(establishment_id_int)

        # Preload all bookings for the date range and establishment to avoid one DB query per slot
        bookings_qs = (
            Booking.objects.filter(
                resource__establishment_id=establishment_id_int,
                booking_date__gte=start_date,
                booking_date__lte=end_date,
                resource__status=ResourceStatus.ACTIF,
            )
            .exclude(status=BookingStatus.ANNULE)
            .values("booking_date", "resource_id", "start_time", "end_time")
        )

        # Organize bookings by date for faster in-memory checks
        bookings_by_date = {}
        for b in bookings_qs:
            d = b["booking_date"].isoformat()
            bookings_by_date.setdefault(d, []).append(b)

        results = {}
        current_date = start_date
        while current_date <= end_date:
            date_key = current_date.isoformat()
            slots = []
            current_start = datetime.combine(current_date, opening_time)
            last_start = _slot_window_end(current_date, closing_time) - timedelta(
                minutes=duration
            )

            day_bookings = bookings_by_date.get(date_key, [])

            # For each slot, count distinct resources that overlap
            while current_start <= last_start:
                current_end = current_start + timedelta(minutes=duration)
                # Marge tampon de chaque côté du créneau candidat (voir BOOKING_BUFFER_MINUTES).
                cand_start = current_start - timedelta(minutes=BOOKING_BUFFER_MINUTES)
                cand_end = current_end + timedelta(minutes=BOOKING_BUFFER_MINUTES)

                overlapping_resources = set()
                for b in day_bookings:
                    # b[start_time]/[end_time] are time objects
                    b_start = datetime.combine(current_date, b["start_time"])
                    b_end = datetime.combine(current_date, b["end_time"])
                    if b_start < cand_end and b_end > cand_start:
                        overlapping_resources.add(b["resource_id"])

                overlapping_count = len(overlapping_resources)
                is_full = active_resources == 0 or overlapping_count >= active_resources

                slots.append(
                    {
                        "start_time": current_start.time().strftime("%H:%M"),
                        "end_time": current_end.time().strftime("%H:%M"),
                        "reserved_resources": overlapping_count,
                        "total_resources": active_resources,
                        "available_resources": max(
                            active_resources - overlapping_count, 0
                        ),
                        "status": "FULL" if is_full else "AVAILABLE",
                        "status_label": "Complet" if is_full else "Disponible",
                        "color": "red" if is_full else "green",
                    }
                )

                # Même espacement (durée + marge) que /available-slots.
                current_start += timedelta(minutes=duration + BOOKING_BUFFER_MINUTES)

            results[date_key] = {
                "date": current_date,
                "establishment_id": establishment_id_int,
                "duration": duration,
                "opening_time": opening_time.strftime("%H:%M"),
                "closing_time": closing_time.strftime("%H:%M"),
                "total_resources": active_resources,
                "slots": slots,
            }

            current_date += timedelta(days=1)

        return Response({"availability": results})

    @transaction.atomic
    def perform_create(self, serializer):
        resource = serializer.validated_data["resource"]
        booking_date = serializer.validated_data["booking_date"]
        start_time = serializer.validated_data["start_time"]
        end_time = serializer.validated_data["end_time"]

        locked_resource = Resource.objects.select_for_update().get(pk=resource.pk)

        conflict_exists = (
            _overlapping_bookings_queryset(
                locked_resource.establishment_id,
                booking_date,
                start_time,
                end_time,
            )
            .filter(resource=locked_resource)
            .exists()
        )

        if conflict_exists:
            raise ValidationError(
                {"resource": "Cette ressource est déjà réservée sur ce créneau."}
            )

        if (
            self.request.user.role == UserRole.ADMIN
            and self.request.user.establishment_id != locked_resource.establishment_id
        ):
            raise ValidationError(
                {"resource": "Un ADMIN ne peut réserver que dans son établissement."}
            )

        # Anti-spam : un client ne peut avoir qu'une seule réservation EN_ATTENTE à la fois.
        new_status = serializer.validated_data.get("status", BookingStatus.EN_ATTENTE)
        booking_user = serializer.validated_data.get("user")
        if (
            self.request.user.role == UserRole.CUSTOMER
            and new_status == BookingStatus.EN_ATTENTE
            and booking_user is not None
            and Booking.objects.filter(
                user=booking_user, status=BookingStatus.EN_ATTENTE
            ).exists()
        ):
            raise ValidationError(
                {
                    "code": ErrorCode.BOOKING_PENDING_LIMIT,
                    "detail": "Vous ne pouvez pas prendre un autre rendez-vous : vous avez déjà une réservation en attente. Veuillez contacter un assistant.",
                }
            )

        booking = serializer.save(
            validated_by=self.request.user
            if self.request.user.role == UserRole.ADMIN
            else None,
        )

        notify_booking_confirmation(booking)

    def perform_update(self, serializer):
        previous_instance = self.get_object()
        old_status = previous_instance.status

        # If status becomes PAYE and validated_by is not set, set it to request.user
        if (
            self.request.user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}
            and serializer.validated_data.get("status") == BookingStatus.PAYE
            and not previous_instance.validated_by
        ):
            serializer.validated_data["validated_by"] = self.request.user
            serializer.validated_data["validated_at"] = timezone.now()

        booking = serializer.save()

        if (
            old_status == BookingStatus.ANNULE
            and booking.status != BookingStatus.ANNULE
        ):
            notify_booking_confirmation(booking)


class SuperAdminEstablishmentViewSet(viewsets.ModelViewSet):
    queryset = Establishment.objects.all().order_by("name")
    serializer_class = EstablishmentSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]


class SuperAdminModeLavageViewSet(viewsets.ModelViewSet):
    """CRUD complet des modes de lavage globaux (Super Admin)."""

    queryset = ModeLavage.objects.all().order_by("nom")
    serializer_class = ModeLavageSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(nom__icontains=search)
        return queryset

    @action(detail=True, methods=["get", "post"], url_path="establishments")
    def establishments(self, request, pk=None):
        """GET: liste les liens établissement↔mode.
        POST: attache un établissement au mode avec un prix spécifique optionnel.
        """
        mode = self.get_object()

        if request.method == "GET":
            links = mode.etablissement_links.select_related("etablissement").all()
            return Response(EtablissementModeSerializer(links, many=True).data)

        serializer = EtablissementModeSerializer(
            data={**request.data, "mode": mode.id}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class SuperAdminManagerViewSet(viewsets.ModelViewSet):
    queryset = (
        CustomUser.objects.select_related("establishment")
        .filter(role=UserRole.ADMIN)
        .order_by("-date_joined")
    )
    serializer_class = SuperAdminManagerSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get_queryset(self):
        return (
            CustomUser.objects.select_related("establishment")
            .filter(role=UserRole.ADMIN)
            .order_by("-date_joined")
        )

    def perform_create(self, serializer):
        serializer.save(role=UserRole.ADMIN)

    def perform_update(self, serializer):
        serializer.save(role=UserRole.ADMIN)


class SuperAdminSuperAdminsViewSet(viewsets.ModelViewSet):
    """List, create and delete super-admin accounts."""
    serializer_class = SuperAdminManagerSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get_queryset(self):
        return (
            CustomUser.objects.filter(role=UserRole.SUPER_ADMIN)
            .order_by("-date_joined")
        )

    def perform_create(self, serializer):
        serializer.save(role=UserRole.SUPER_ADMIN, establishment=None)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            return Response(
                {"detail": "Vous ne pouvez pas supprimer votre propre compte super admin."},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)


class SuperAdminHistoryAPIView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get(self, request):
        # On classe par date d'événement réelle (validation si elle existe,
        # sinon création) en ordre décroissant : les plus récents en haut.
        queryset = (
            Booking.objects.select_related(
                "user",
                "validated_by",
                "resource",
                "resource__establishment",
            )
            .all()
            .annotate(event_at=Coalesce("validated_at", "created_at"))
            .order_by("-event_at", "-created_at")
        )

        establishment_id = request.query_params.get("establishment_id")
        date_value = request.query_params.get("date")
        user_id = request.query_params.get("user_id")
        kind = request.query_params.get("kind")  # payment | cash | baridimob | reservation | cancellation | maintenance

        if establishment_id:
            try:
                queryset = queryset.filter(
                    resource__establishment_id=int(establishment_id)
                )
            except ValueError as exc:
                raise ValidationError(
                    {"establishment_id": "Identifiant invalide."}
                ) from exc

        if kind == "payment":
            queryset = queryset.filter(status=BookingStatus.PAYE)
        elif kind == "cash":
            queryset = queryset.filter(
                status=BookingStatus.PAYE, payment_method=PaymentMethod.CASH
            )
        elif kind == "baridimob":
            queryset = queryset.filter(
                status=BookingStatus.PAYE, payment_method=PaymentMethod.BARIDIMOB
            )
        elif kind == "reservation":
            queryset = queryset.filter(status=BookingStatus.EN_ATTENTE)
        elif kind == "cancellation":
            queryset = queryset.filter(status=BookingStatus.ANNULE)
        elif kind == "maintenance":
            queryset = queryset.filter(status=BookingStatus.MAINTENANCE)

        if user_id:
            try:
                queryset = queryset.filter(user_id=int(user_id))
            except ValueError as exc:
                raise ValidationError({"user_id": "Identifiant invalide."}) from exc

        validated_by_id = request.query_params.get("validated_by_id")
        if validated_by_id:
            try:
                queryset = queryset.filter(validated_by_id=int(validated_by_id))
            except ValueError as exc:
                raise ValidationError({"validated_by_id": "Identifiant invalide."}) from exc

        if date_value:
            try:
                parsed_date = datetime.strptime(date_value, "%Y-%m-%d").date()
            except ValueError as exc:
                raise ValidationError(
                    {"date": "La date doit être au format YYYY-MM-DD."}
                ) from exc
            queryset = queryset.filter(booking_date=parsed_date)

        serializer = SuperAdminBookingHistorySerializer(queryset, many=True)
        return Response(serializer.data)


class SuperAdminStatsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=WEEKDAY_COUNT - 1)

        results = []
        establishments = Establishment.objects.all().order_by("name")

        for establishment in establishments:
            active_resources = Resource.objects.filter(
                establishment=establishment,
                status=ResourceStatus.ACTIF,
            ).count()

            opening_time, closing_time = _establishment_hours(establishment)
            slots_per_day = _working_day_slot_count(opening_time, closing_time)

            total_week_slots = active_resources * WEEKDAY_COUNT * slots_per_day
            occupied_slots = self._count_occupied_slots(
                establishment.id, week_start, week_end, active_resources,
                opening_time, closing_time,
            )
            saturation_percentage = (
                (Decimal(occupied_slots) / Decimal(total_week_slots) * Decimal("100"))
                if total_week_slots
                else Decimal("0.00")
            )
            saturation_percentage = saturation_percentage.quantize(Decimal("0.01"))

            results.append(
                {
                    "establishment_id": establishment.id,
                    "establishment_name": establishment.name,
                    "active_resources": active_resources,
                    "occupied_slots": occupied_slots,
                    "total_week_slots": total_week_slots,
                    "saturation_percentage": saturation_percentage,
                    "needs_more_resources": active_resources == 0
                    or saturation_percentage > Decimal("80.00"),
                }
            )

        payload = {
            "week_start": week_start,
            "week_end": week_end,
            "results": SuperAdminStatsSerializer(results, many=True).data,
        }
        return Response(payload)

    def _count_occupied_slots(
        self, establishment_id: int, week_start, week_end, active_resources: int,
        opening_time: time = OPENING_TIME, closing_time: time = CLOSING_TIME,
    ) -> int:
        if active_resources == 0:
            return 0

        bookings = list(
            Booking.objects.filter(
                resource__establishment_id=establishment_id,
                resource__status=ResourceStatus.ACTIF,
                booking_date__range=(week_start, week_end),
            )
            .exclude(status=BookingStatus.ANNULE)
            .values("resource_id", "booking_date", "start_time", "end_time")
        )

        occupied_slots = 0
        for day_offset in range(WEEKDAY_COUNT):
            current_day = week_start + timedelta(days=day_offset)
            current_start = datetime.combine(current_day, opening_time)
            last_start = _slot_window_end(current_day, closing_time) - timedelta(
                minutes=DEFAULT_SLOT_STEP_MINUTES
            )

            while current_start <= last_start:
                current_end = current_start + timedelta(
                    minutes=DEFAULT_SLOT_STEP_MINUTES
                )
                occupied_resources = {
                    booking["resource_id"]
                    for booking in bookings
                    if booking["booking_date"] == current_day
                    and booking["start_time"] < current_end.time()
                    and booking["end_time"] > current_start.time()
                }

                if len(occupied_resources) >= active_resources:
                    occupied_slots += 1

                current_start += timedelta(minutes=DEFAULT_SLOT_STEP_MINUTES)

        return occupied_slots


DAY_NAMES_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


class SuperAdminFinancialSummaryAPIView(APIView):
    """Résumé financier pour le Super Admin."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())  # Lundi
        month_start = today.replace(day=1)

        # Revenue: only PAYE bookings count as real income
        revenue_qs = Booking.objects.filter(status=BookingStatus.PAYE)
        # Bookings count / frequency: all active (non-cancelled) reservations
        active_qs = Booking.objects.exclude(status=BookingStatus.ANNULE).exclude(status=BookingStatus.MAINTENANCE)

        # ── Période : aujourd'hui / semaine / mois ──
        rev_today   = revenue_qs.filter(booking_date=today)
        rev_week    = revenue_qs.filter(booking_date__gte=week_start, booking_date__lte=today)
        rev_month   = revenue_qs.filter(booking_date__gte=month_start, booking_date__lte=today)

        act_today   = active_qs.filter(booking_date=today)
        act_week    = active_qs.filter(booking_date__gte=week_start, booking_date__lte=today)
        act_month   = active_qs.filter(booking_date__gte=month_start, booking_date__lte=today)

        today_agg = {
            "revenue":        rev_today.aggregate(s=Sum("total_price"))["s"] or Decimal("0.00"),
            "bookings_count": act_today.aggregate(c=Count("id"))["c"] or 0,
            "pending_count":  act_today.filter(status=BookingStatus.EN_ATTENTE).aggregate(c=Count("id"))["c"] or 0,
        }
        week_agg = {
            "revenue":        rev_week.aggregate(s=Sum("total_price"))["s"] or Decimal("0.00"),
            "bookings_count": act_week.aggregate(c=Count("id"))["c"] or 0,
        }
        month_agg = {
            "revenue":        rev_month.aggregate(s=Sum("total_price"))["s"] or Decimal("0.00"),
            "bookings_count": act_month.aggregate(c=Count("id"))["c"] or 0,
        }

        # ── Par établissement ──
        establishments = Establishment.objects.all().order_by("name")
        by_establishment = []
        for est in establishments:
            est_rev   = revenue_qs.filter(resource__establishment=est)
            est_act   = active_qs.filter(resource__establishment=est)

            est_rev_today   = est_rev.filter(booking_date=today).aggregate(s=Sum("total_price"), c=Count("id"))
            est_rev_week    = est_rev.filter(booking_date__gte=week_start, booking_date__lte=today).aggregate(s=Sum("total_price"))
            est_rev_month   = est_rev.filter(booking_date__gte=month_start, booking_date__lte=today).aggregate(s=Sum("total_price"))
            est_act_today   = est_act.filter(booking_date=today).aggregate(c=Count("id"))
            est_pending_today = est_act.filter(booking_date=today, status=BookingStatus.EN_ATTENTE).aggregate(c=Count("id"))

            by_establishment.append(
                {
                    "id": est.id,
                    "name": est.name,
                    "revenue_today":   est_rev_today["s"] or Decimal("0.00"),
                    "revenue_week":    est_rev_week["s"] or Decimal("0.00"),
                    "revenue_month":   est_rev_month["s"] or Decimal("0.00"),
                    "bookings_today":  est_act_today["c"] or 0,
                    "pending_today":   est_pending_today["c"] or 0,
                    "paid_today":      est_rev_today["c"] or 0,
                }
            )

        # ── Fréquence horaire (semaine en cours, réservations actives) ──
        hourly_data = (
            act_week.annotate(hour=ExtractHour("start_time"))
            .values("hour")
            .annotate(count=Count("id"))
            .order_by("hour")
        )
        hourly_map = {entry["hour"]: entry["count"] for entry in hourly_data}
        hourly_frequency = [
            {"hour": f"{h:02d}:00", "count": hourly_map.get(h, 0)}
            for h in range(OPENING_TIME.hour, CLOSING_TIME.hour)
        ]

        # ── Fréquence journalière (mois en cours, réservations actives) ──
        daily_data = (
            act_month.annotate(dow=ExtractWeekDay("booking_date"))
            .values("dow")
            .annotate(count=Count("id"))
            .order_by("dow")
        )
        django_dow_to_py = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6}
        daily_map = {
            django_dow_to_py.get(entry["dow"], 0): entry["count"]
            for entry in daily_data
        }
        daily_frequency = [
            {"day": DAY_NAMES_FR[i], "count": daily_map.get(i, 0)} for i in range(7)
        ]

        return Response(
            {
                "today":      today_agg,
                "this_week":  week_agg,
                "this_month": month_agg,
                "by_establishment": by_establishment,
                "hourly_frequency": hourly_frequency,
                "daily_frequency":  daily_frequency,
            }
        )


class SystemConfigAPIView(APIView):
    """Lecture / mise à jour de la configuration système (singleton)."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]
    authentication_classes = [ChronoJWTAuthentication]

    def get(self, request):
        config = SystemConfig.load()
        serializer = SystemConfigSerializer(config)
        return Response(serializer.data)

    def put(self, request):
        config = SystemConfig.load()
        serializer = SystemConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CustomerLoginAPIView(GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        phone, secret_code = extract_login_payload(request.data)
        if not phone or not secret_code:
            return error_response(
                ErrorCode.AUTH_MISSING_FIELDS,
                "Veuillez renseigner votre numéro de téléphone et votre code secret.",
                400,
            )

        try:
            user = CustomUser.objects.select_related("establishment").get(phone=phone)
        except CustomUser.DoesNotExist:
            return error_response(
                ErrorCode.AUTH_INVALID_CREDENTIALS,
                "Numéro de téléphone ou code secret incorrect.",
                401,
            )

        if not user.is_active:
            return error_response(
                ErrorCode.AUTH_ACCOUNT_INACTIVE,
                "Ce compte est désactivé. Veuillez contacter l'établissement.",
                403,
            )

        if not user.check_secret_code(secret_code):
            return error_response(
                ErrorCode.AUTH_INVALID_CREDENTIALS,
                "Numéro de téléphone ou code secret incorrect.",
                401,
            )

        if user.role != UserRole.CUSTOMER:
            return error_response(
                ErrorCode.AUTH_INVALID_CREDENTIALS,
                "Numéro de téléphone ou code secret incorrect.",
                401,
            )

        return Response(build_login_response(user), status=200)


class StaffLoginAPIView(GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        phone, secret_code = extract_login_payload(request.data)
        if not phone or not secret_code:
            return error_response(
                ErrorCode.AUTH_MISSING_FIELDS,
                "Veuillez renseigner votre numéro de téléphone et votre code secret.",
                400,
            )

        try:
            user = CustomUser.objects.select_related("establishment").get(phone=phone)
        except CustomUser.DoesNotExist:
            return error_response(
                ErrorCode.AUTH_INVALID_CREDENTIALS,
                "Numéro de téléphone ou code secret incorrect.",
                401,
            )

        if not user.is_active:
            return error_response(
                ErrorCode.AUTH_ACCOUNT_INACTIVE,
                "Ce compte personnel est désactivé. Contactez le super administrateur.",
                403,
            )

        if not user.check_secret_code(secret_code):
            return error_response(
                ErrorCode.AUTH_INVALID_CREDENTIALS,
                "Numéro de téléphone ou code secret incorrect.",
                401,
            )

        if user.role == UserRole.CUSTOMER:
            return error_response(
                ErrorCode.CUSTOMER_USE_CLIENT_PORTAL,
                "Ce compte est un compte client. Utilisez la page de connexion client.",
                403,
            )

        if user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
            return error_response(
                ErrorCode.STAFF_ACCESS_DENIED,
                "Accès réservé au personnel autorisé.",
                403,
            )

        return Response(build_login_response(user), status=200)
