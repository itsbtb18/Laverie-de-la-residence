from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .payment_views import (
    ChargilyCreateCheckoutView,
    ChargilyVerifyPaymentView,
    ChargilyWebhookView,
)
from .views import (
    BookingViewSet,
    CustomerLoginAPIView,
    CustomUserViewSet,
    EstablishmentViewSet,
    ResourceViewSet,
    StaffLoginAPIView,
    SuperAdminEstablishmentViewSet,
    SuperAdminFinancialSummaryAPIView,
    SuperAdminHistoryAPIView,
    SuperAdminManagerViewSet,
    SuperAdminStatsAPIView,
    SuperAdminSuperAdminsViewSet,
    SystemConfigAPIView,
)
from .whatsapp_internal_views import (
    WhatsAppReminderMarkSentAPIView,
    WhatsAppReminderSendAPIView,
    WhatsAppRemindersDueAPIView,
)

router = DefaultRouter()
router.register(r"users", CustomUserViewSet, basename="user")
router.register(r"establishments", EstablishmentViewSet, basename="establishment")
router.register(r"resources", ResourceViewSet, basename="resource")
router.register(r"bookings", BookingViewSet, basename="booking")

superadmin_router = DefaultRouter()
superadmin_router.register(
    r"establishments",
    SuperAdminEstablishmentViewSet,
    basename="superadmin-establishment",
)
superadmin_router.register(
    r"managers", SuperAdminManagerViewSet, basename="superadmin-manager"
)
superadmin_router.register(
    r"assistants", SuperAdminManagerViewSet, basename="superadmin-assistant"
)
superadmin_router.register(
    r"super-admins", SuperAdminSuperAdminsViewSet, basename="superadmin-superadmins"
)


urlpatterns = [
    # Chargily Pay
    path("payments/chargily/create-checkout/", ChargilyCreateCheckoutView.as_view(), name="chargily-create-checkout"),
    path("payments/chargily/webhook/", ChargilyWebhookView.as_view(), name="chargily-webhook"),
    path("payments/chargily/verify/", ChargilyVerifyPaymentView.as_view(), name="chargily-verify"),

    path("auth/login/", CustomerLoginAPIView.as_view(), name="auth-login"),
    path("auth/staff/login/", StaffLoginAPIView.as_view(), name="auth-staff-login"),
    path(
        "internal/whatsapp/reminders-due/",
        WhatsAppRemindersDueAPIView.as_view(),
        name="whatsapp-reminders-due",
    ),
    path(
        "internal/whatsapp/reminders/<int:booking_id>/mark-sent/",
        WhatsAppReminderMarkSentAPIView.as_view(),
        name="whatsapp-reminder-mark-sent",
    ),
    path(
        "internal/whatsapp/reminders/<int:booking_id>/send/",
        WhatsAppReminderSendAPIView.as_view(),
        name="whatsapp-reminder-send",
    ),
    path("", include(router.urls)),
    path("superadmin/", include(superadmin_router.urls)),
    path(
        "superadmin/history/",
        SuperAdminHistoryAPIView.as_view(),
        name="superadmin-history",
    ),
    path(
        "superadmin/stats/", SuperAdminStatsAPIView.as_view(), name="superadmin-stats"
    ),
    path(
        "superadmin/financial-summary/",
        SuperAdminFinancialSummaryAPIView.as_view(),
        name="superadmin-financial-summary",
    ),
    path(
        "superadmin/config/",
        SystemConfigAPIView.as_view(),
        name="superadmin-config",
    ),
]
