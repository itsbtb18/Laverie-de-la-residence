from __future__ import annotations

import datetime
import random
import re
import string
from decimal import Decimal

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

phone_validator = RegexValidator(
    regex=r"^0[2567]\d{8}$",
    message="Le numéro doit être algérien et commencer par 02, 05, 06 ou 07.",
)

secret_code_validator = RegexValidator(
    regex=r"^\d{6}$",
    message="Le code secret doit contenir exactement 6 chiffres.",
)


def normalize_phone(phone: str) -> str:
    return re.sub(r"[\s\-\.\(\)]", "", phone or "")


def generate_booking_reference() -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    alphabet = string.ascii_uppercase + string.digits

    while True:
        suffix = "".join(random.choices(alphabet, k=4))
        reference = f"CRN-{date_part}-{suffix}"
        if not Booking.objects.filter(booking_reference=reference).exists():
            return reference


class UserRole(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super admin"
    ADMIN = "ADMIN", "Admin"
    CUSTOMER = "CUSTOMER", "Customer"


class BookingStatus(models.TextChoices):
    EN_ATTENTE = "EN_ATTENTE", "Paiement en attente"
    PAYE = "PAYE", "Payé"
    ANNULE = "ANNULE", "Annulé"
    MAINTENANCE = "MAINTENANCE", "Maintenance"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    BARIDIMOB = "BARIDIMOB", "BaridiMob"


class ResourceStatus(models.TextChoices):
    ACTIF = "ACTIF", "Actif"
    EN_PANNE = "EN_PANNE", "En panne"


class CustomUserManager(BaseUserManager):
    def create_user(self, phone, secret_code, **extra_fields):
        if not phone:
            raise ValueError("Le numéro de téléphone est obligatoire.")
        if not secret_code:
            raise ValueError("Le code secret est obligatoire.")

        phone = normalize_phone(phone)
        phone_validator(phone)
        secret_code_validator(str(secret_code))

        extra_fields.setdefault("role", UserRole.CUSTOMER)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)

        user = self.model(phone=phone, **extra_fields)
        user.set_password(str(secret_code))
        user.full_clean(exclude={"password"})
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, secret_code, **extra_fields):
        extra_fields.setdefault("role", UserRole.SUPER_ADMIN)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("role") != UserRole.SUPER_ADMIN:
            raise ValueError("Un superuser doit avoir le rôle SUPER_ADMIN.")
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Un superuser doit avoir is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Un superuser doit avoir is_superuser=True.")

        return self.create_user(phone, secret_code, **extra_fields)


class Establishment(models.Model):
    name = models.CharField(max_length=255, verbose_name="Nom")
    address = models.CharField(max_length=255, verbose_name="Adresse")
    city = models.CharField(max_length=120, verbose_name="Ville")
    opening_time = models.TimeField(
        default=datetime.time(8, 0),
        verbose_name="Heure d'ouverture",
    )
    closing_time = models.TimeField(
        default=datetime.time(22, 0),
        verbose_name="Heure de fermeture",
    )
    created_at = models.DateTimeField(
        auto_now_add=True, verbose_name="Date de création"
    )

    def clean(self):
        super().clean()
        # 00:00 (minuit) est accepté comme fin de journée.
        is_midnight = self.closing_time and self.closing_time.hour == 0 and self.closing_time.minute == 0
        if (
            self.opening_time
            and self.closing_time
            and not is_midnight
            and self.opening_time >= self.closing_time
        ):
            raise ValidationError(
                {"closing_time": "L'heure de fermeture doit être après l'heure d'ouverture."}
            )

    class Meta:
        verbose_name = "Établissement"
        verbose_name_plural = "Établissements"
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["city"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} - {self.city}"


class CustomUser(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField(
        max_length=10,
        unique=True,
        validators=[phone_validator],
        verbose_name="Téléphone",
    )
    first_name = models.CharField(max_length=150, verbose_name="Prénom")
    last_name = models.CharField(max_length=150, verbose_name="Nom")
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.CUSTOMER,
        verbose_name="Rôle",
    )
    establishment = models.ForeignKey(
        Establishment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        verbose_name="Établissement",
    )
    date_joined = models.DateTimeField(
        default=timezone.now, verbose_name="Date d'inscription"
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    secret_code_plain = models.CharField(
        max_length=6,
        blank=True,
        default="",
        verbose_name="Code secret (clair)",
        help_text="Stocké en clair pour pouvoir réimprimer le ticket client.",
    )

    objects = CustomUserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = "Utilisateur"
        verbose_name_plural = "Utilisateurs"
        indexes = [models.Index(fields=["phone"])]

    def clean(self):
        super().clean()
        self.phone = normalize_phone(self.phone)
        phone_validator(self.phone)

        if self.role == UserRole.SUPER_ADMIN:
            self.establishment = None
        elif self.role == UserRole.ADMIN and self.establishment_id is None:
            raise ValidationError(
                {"establishment": "Un ADMIN doit être lié à un établissement."}
            )

        self.is_staff = self.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}
        self.is_superuser = self.role == UserRole.SUPER_ADMIN

    def set_secret_code(self, secret_code: str) -> None:
        secret_code_validator(str(secret_code))
        self.set_password(str(secret_code))
        self.secret_code_plain = str(secret_code)

    def check_secret_code(self, secret_code: str) -> bool:
        return self.check_password(str(secret_code))

    def save(self, *args, **kwargs):
        self.full_clean(exclude={"password"})
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.phone})"


class Resource(models.Model):
    establishment = models.ForeignKey(
        Establishment,
        on_delete=models.CASCADE,
        related_name="resources",
        verbose_name="Établissement",
    )
    label = models.CharField(max_length=120, verbose_name="Nom / Numéro")
    status = models.CharField(
        max_length=20,
        choices=ResourceStatus.choices,
        default=ResourceStatus.ACTIF,
        verbose_name="Statut",
    )

    class Meta:
        verbose_name = "Ressource"
        verbose_name_plural = "Ressources"
        constraints = [
            models.UniqueConstraint(
                fields=["establishment", "label"],
                name="unique_resource_label_per_establishment",
            )
        ]
        indexes = [models.Index(fields=["establishment", "status"])]

    def __str__(self) -> str:
        return f"{self.establishment.name} - {self.label}"


class Booking(models.Model):
    booking_reference = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        default=generate_booking_reference,
        verbose_name="Référence",
    )
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.PROTECT,
        related_name="bookings",
        verbose_name="Client",
        null=True,
        blank=True,
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.PROTECT,
        related_name="bookings",
        verbose_name="Ressource",
    )
    booking_date = models.DateField(verbose_name="Date")
    start_time = models.TimeField(verbose_name="Heure de début")
    end_time = models.TimeField(verbose_name="Heure de fin")
    status = models.CharField(
        max_length=20,
        choices=BookingStatus.choices,
        default=BookingStatus.EN_ATTENTE,
        verbose_name="Statut",
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        null=True,
        blank=True,
        verbose_name="Moyen de paiement",
    )
    total_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Prix total",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")
    validated_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Validé le",
    )
    validated_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="validated_bookings",
        verbose_name="Validé par",
    )
    whatsapp_reminder_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Rappel WhatsApp envoyé le",
    )
    chargily_checkout_id = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name="Chargily Checkout ID",
    )

    class Meta:
        verbose_name = "Réservation"
        verbose_name_plural = "Réservations"
        constraints = [
            models.CheckConstraint(
                check=Q(start_time__lt=models.F("end_time")),
                name="booking_start_time_before_end_time",
            ),
            models.UniqueConstraint(
                fields=["resource", "booking_date", "start_time", "end_time"],
                name="unique_resource_exact_booking_slot",
                condition=~Q(status=BookingStatus.ANNULE),
            ),
        ]
        indexes = [
            models.Index(fields=["booking_reference"]),
            models.Index(fields=["resource", "booking_date"]),
            models.Index(fields=["status", "booking_date"]),
        ]

    def clean(self):
        super().clean()

        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError(
                {"end_time": "L'heure de fin doit être après l'heure de début."}
            )

        if self.validated_by and self.validated_by.role not in {
            UserRole.ADMIN,
            UserRole.SUPER_ADMIN,
        }:
            raise ValidationError(
                {
                    "validated_by": "Le validateur doit être un assistant ou un super admin."
                }
            )

        if self.status == BookingStatus.ANNULE:
            return

        if not all(
            [self.resource_id, self.booking_date, self.start_time, self.end_time]
        ):
            return

        overlapping = Booking.objects.filter(
            resource=self.resource,
            booking_date=self.booking_date,
        ).exclude(status=BookingStatus.ANNULE)

        if self.pk:
            overlapping = overlapping.exclude(pk=self.pk)

        overlapping = overlapping.filter(
            start_time__lt=self.end_time,
            end_time__gt=self.start_time,
        )

        if overlapping.exists():
            raise ValidationError(
                {"resource": "Cette ressource est déjà réservée sur ce créneau."}
            )

    def save(self, *args, **kwargs):
        if not self.booking_reference:
            self.booking_reference = generate_booking_reference()
        if (
            self.status == BookingStatus.PAYE
            and self.validated_by_id
            and self.validated_at is None
        ):
            self.validated_at = timezone.now()
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.booking_reference} - {self.resource.label} - {self.booking_date} {self.start_time}-{self.end_time}"


class ModeLavage(models.Model):
    """Mode de lavage global, réutilisable par plusieurs établissements."""

    nom = models.CharField(max_length=120, verbose_name="Nom")
    nom_ar = models.CharField(
        max_length=120,
        blank=True,
        default="",
        verbose_name="Nom (arabe)",
    )
    duree = models.PositiveIntegerField(verbose_name="Durée (minutes)")
    prix_base = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Prix de base (DA)",
    )
    capacite_max = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Capacité max (kg)",
    )
    types_vetements = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Types de vêtements",
        help_text="Liste de types de vêtements pris en charge.",
    )
    types_vetements_ar = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Types de vêtements (arabe)",
    )
    message_guide = models.TextField(
        blank=True,
        default="",
        verbose_name="Pourquoi choisir ce mode (bénéfice client)",
    )
    message_guide_ar = models.TextField(
        blank=True,
        default="",
        verbose_name="Pourquoi choisir ce mode (arabe)",
    )
    textiles_interdits = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Textiles à éviter / interdits",
        help_text="Liste des textiles déconseillés pour ce cycle.",
    )
    textiles_interdits_ar = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Textiles à éviter / interdits (arabe)",
    )
    consigne_securite = models.TextField(
        blank=True,
        default="",
        verbose_name="Consigne de sécurité",
        help_text="Ex. videz les poches, retirez le sable, etc.",
    )
    consigne_securite_ar = models.TextField(
        blank=True,
        default="",
        verbose_name="Consigne de sécurité (arabe)",
    )
    etablissements = models.ManyToManyField(
        Establishment,
        through="EtablissementMode",
        related_name="modes_lavage",
        blank=True,
        verbose_name="Établissements",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")

    class Meta:
        db_table = "modes_lavage"
        verbose_name = "Mode de lavage"
        verbose_name_plural = "Modes de lavage"
        ordering = ["nom"]
        indexes = [models.Index(fields=["nom"])]

    def clean(self):
        super().clean()
        if self.duree is not None and self.duree <= 0:
            raise ValidationError(
                {"duree": "La durée doit être supérieure à 0 minute."}
            )

    def __str__(self) -> str:
        return f"{self.nom} ({self.duree} min)"


class EtablissementMode(models.Model):
    """Table pivot : un établissement peut activer plusieurs modes,
    chacun avec un prix spécifique optionnel qui surcharge le prix de base.
    """

    etablissement = models.ForeignKey(
        Establishment,
        on_delete=models.CASCADE,
        related_name="mode_links",
        verbose_name="Établissement",
    )
    mode = models.ForeignKey(
        ModeLavage,
        on_delete=models.CASCADE,
        related_name="etablissement_links",
        verbose_name="Mode de lavage",
    )
    prix_specifique = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Prix spécifique (DA)",
        help_text="Surcharge le prix de base pour cet établissement uniquement.",
    )
    recommande = models.BooleanField(
        default=False,
        verbose_name="Recommandé",
        help_text="Un seul mode peut être recommandé par établissement.",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")

    class Meta:
        db_table = "etablissement_mode"
        verbose_name = "Mode par établissement"
        verbose_name_plural = "Modes par établissement"
        constraints = [
            models.UniqueConstraint(
                fields=["etablissement", "mode"],
                name="unique_etablissement_mode",
            )
        ]
        indexes = [models.Index(fields=["etablissement", "mode"])]

    @property
    def prix_effectif(self) -> Decimal:
        return (
            self.prix_specifique
            if self.prix_specifique is not None
            else self.mode.prix_base
        )

    def __str__(self) -> str:
        return f"{self.etablissement.name} · {self.mode.nom}"


class SystemConfig(models.Model):
    default_slot_duration = models.IntegerField(
        default=30, verbose_name="Durée par défaut (min)"
    )
    bookings_paused = models.BooleanField(
        default=False, verbose_name="Réservations en pause"
    )
    pause_reason = models.CharField(
        max_length=255, blank=True, default="", verbose_name="Motif de pause"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuration système"
        verbose_name_plural = "Configuration système"

    def save(self, *args, **kwargs):
        self.pk = 1  # Singleton pattern
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self) -> str:
        return "Configuration système"
