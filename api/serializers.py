from __future__ import annotations

from django.db import transaction
from rest_framework import serializers

from .api_errors import ErrorCode
from .models import (
    Booking,
    BookingStatus,
    CustomUser,
    Establishment,
    Resource,
    SystemConfig,
    UserRole,
    normalize_phone,
    phone_validator,
    secret_code_validator,
)


class EstablishmentSerializer(serializers.ModelSerializer):
    machine_count = serializers.IntegerField(required=False, min_value=0)

    class Meta:
        model = Establishment
        fields = ["id", "name", "address", "city", "created_at", "machine_count"]
        read_only_fields = ["id", "created_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["machine_count"] = instance.resources.count()
        return ret

    @transaction.atomic
    def create(self, validated_data):
        machine_count = validated_data.pop("machine_count", 0)
        establishment = super().create(validated_data)

        for i in range(1, machine_count + 1):
            Resource.objects.create(
                establishment=establishment, label=f"Machine {i}", status="ACTIF"
            )
        return establishment

    @transaction.atomic
    def update(self, instance, validated_data):
        machine_count = validated_data.pop("machine_count", None)
        establishment = super().update(instance, validated_data)

        if machine_count is not None:
            current_resources = list(instance.resources.all().order_by("id"))
            current_count = len(current_resources)

            if machine_count > current_count:
                import re

                max_idx = 0
                for r in current_resources:
                    match = re.search(r"\d+", r.label)
                    if match:
                        max_idx = max(max_idx, int(match.group()))

                for i in range(1, machine_count - current_count + 1):
                    Resource.objects.create(
                        establishment=establishment,
                        label=f"Machine {max_idx + i}",
                        status="ACTIF",
                    )
            elif machine_count < current_count:
                diff = current_count - machine_count
                resources_to_delete = current_resources[-diff:]

                from django.db.models import ProtectedError

                for r in resources_to_delete:
                    try:
                        r.delete()
                    except ProtectedError:
                        raise serializers.ValidationError(
                            {
                                "machine_count": f"Impossible de supprimer la machine '{r.label}' car elle est liée à des réservations existantes."
                            }
                        )
        return establishment


class ResourceSerializer(serializers.ModelSerializer):
    establishment_name = serializers.CharField(
        source="establishment.name", read_only=True
    )

    class Meta:
        model = Resource
        fields = ["id", "establishment", "establishment_name", "label", "status"]
        read_only_fields = ["id"]


class CustomUserSerializer(serializers.ModelSerializer):
    secret_code = serializers.CharField(write_only=True, min_length=6, max_length=6)
    created_in_person = serializers.BooleanField(
        write_only=True, required=False, default=False
    )
    establishment_name = serializers.CharField(
        source="establishment.name", read_only=True
    )
    secret_code_preview = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "phone",
            "first_name",
            "last_name",
            "role",
            "establishment",
            "establishment_name",
            "date_joined",
            "is_active",
            "is_staff",
            "secret_code",
            "secret_code_preview",
            "secret_code_plain",
            "created_in_person",
        ]
        read_only_fields = [
            "id",
            "date_joined",
            "is_active",
            "is_staff",
            "secret_code_preview",
            "secret_code_plain",
        ]

    def get_secret_code_preview(self, obj):
        return obj.secret_code_plain or "******"

    def validate_phone(self, value: str) -> str:
        normalized = normalize_phone(value)
        try:
            phone_validator(normalized)
        except Exception as exc:
            raise serializers.ValidationError(
                "Le numéro doit être algérien et commencer par 02, 05, 06 ou 07.",
                code=ErrorCode.PHONE_INVALID_FORMAT,
            ) from exc
        return normalized

    def validate_secret_code(self, value: str) -> str:
        try:
            secret_code_validator(str(value))
        except Exception as exc:
            raise serializers.ValidationError(
                "Le code secret doit contenir exactement 6 chiffres.",
                code=ErrorCode.SECRET_CODE_INVALID_FORMAT,
            ) from exc
        return str(value)

    def validate(self, attrs):
        role = attrs.get("role", getattr(self.instance, "role", UserRole.CUSTOMER))
        establishment = attrs.get(
            "establishment", getattr(self.instance, "establishment", None)
        )

        if role == UserRole.ADMIN and establishment is None:
            raise serializers.ValidationError(
                {
                    "code": ErrorCode.FIELD_REQUIRED,
                    "establishment": [
                        "Un assistant doit être rattaché à un établissement."
                    ],
                }
            )

        if role == UserRole.SUPER_ADMIN:
            attrs["establishment"] = None

        phone = attrs.get("phone")
        if phone is not None:
            qs = CustomUser.objects.filter(phone=phone)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                existing = qs.first()
                payload: dict[str, object] = {
                    "code": ErrorCode.PHONE_ALREADY_EXISTS,
                    "detail": "Un compte existe déjà avec ce numéro de téléphone.",
                    "phone": [
                        "Un compte existe déjà avec ce numéro de téléphone."
                    ],
                }
                if existing and existing.role == UserRole.CUSTOMER:
                    payload["existing_user_id"] = existing.id
                raise serializers.ValidationError(payload)

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        secret_code = validated_data.pop("secret_code")
        validated_data.pop("created_in_person", False)
        user = CustomUser(**validated_data)
        user.set_secret_code(secret_code)
        user.save()
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        secret_code = validated_data.pop("secret_code", None)
        validated_data.pop("created_in_person", False)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if secret_code:
            instance.set_secret_code(secret_code)

        instance.save()
        return instance


class BookingSerializer(serializers.ModelSerializer):
    booking_reference = serializers.CharField(read_only=True)
    establishment_id = serializers.IntegerField(
        source="resource.establishment_id", read_only=True
    )
    establishment_name = serializers.CharField(
        source="resource.establishment.name", read_only=True
    )
    resource_label = serializers.CharField(source="resource.label", read_only=True)
    user_first_name = serializers.SerializerMethodField()
    user_last_name = serializers.SerializerMethodField()
    user_phone = serializers.SerializerMethodField()
    validated_by_phone = serializers.SerializerMethodField()
    validated_by_first_name = serializers.SerializerMethodField()
    validated_by_last_name = serializers.SerializerMethodField()
    validated_at = serializers.DateTimeField(read_only=True)

    def get_user_first_name(self, obj):
        return obj.user.first_name if obj.user else ""

    def get_user_last_name(self, obj):
        return obj.user.last_name if obj.user else ""

    def get_user_phone(self, obj):
        return obj.user.phone if obj.user else ""

    def get_validated_by_phone(self, obj):
        return obj.validated_by.phone if obj.validated_by else ""

    def get_validated_by_first_name(self, obj):
        return obj.validated_by.first_name if obj.validated_by else ""

    def get_validated_by_last_name(self, obj):
        return obj.validated_by.last_name if obj.validated_by else ""

    class Meta:
        model = Booking
        fields = [
            "id",
            "booking_reference",
            "user",
            "user_first_name",
            "user_last_name",
            "user_phone",
            "resource",
            "resource_label",
            "establishment_id",
            "establishment_name",
            "booking_date",
            "start_time",
            "end_time",
            "status",
            "payment_method",
            "total_price",
            "created_at",
            "validated_at",
            "validated_by",
            "validated_by_phone",
            "validated_by_first_name",
            "validated_by_last_name",
        ]
        read_only_fields = ["id", "created_at", "validated_at", "validated_by_phone",
                            "validated_by_first_name", "validated_by_last_name"]

    def validate(self, attrs):
        # Allow null user for MAINTENANCE status
        if attrs.get("status") == BookingStatus.MAINTENANCE:
            if attrs.get("user") is not None:
                raise serializers.ValidationError(
                    {"user": "Une maintenance ne peut pas avoir d'utilisateur associé."}
                )
            return attrs

        if (
            attrs.get("status") == BookingStatus.ANNULE
            and attrs.get("validated_by") is None
        ):
            return attrs

        validated_by = attrs.get(
            "validated_by", getattr(self.instance, "validated_by", None)
        )
        if validated_by and validated_by.role not in {
            UserRole.ADMIN,
            UserRole.SUPER_ADMIN,
        }:
            raise serializers.ValidationError(
                {
                    "validated_by": "Le validateur doit être un assistant ou un super admin."
                }
            )
        return attrs


class SuperAdminManagerSerializer(serializers.ModelSerializer):
    secret_code = serializers.CharField(
        write_only=True, required=False, min_length=6, max_length=6
    )
    establishment_name = serializers.CharField(
        source="establishment.name", read_only=True
    )

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "phone",
            "first_name",
            "last_name",
            "role",
            "establishment",
            "establishment_name",
            "date_joined",
            "is_active",
            "is_staff",
            "secret_code",
        ]
        read_only_fields = ["id", "date_joined", "is_active", "is_staff", "role"]

    def validate_phone(self, value: str) -> str:
        normalized = normalize_phone(value)
        try:
            phone_validator(normalized)
        except Exception as exc:
            raise serializers.ValidationError(
                "Le numéro doit être algérien et commencer par 02, 05, 06 ou 07.",
                code=ErrorCode.PHONE_INVALID_FORMAT,
            ) from exc
        return normalized

    def validate_secret_code(self, value: str) -> str:
        if not value:
            return value
        try:
            secret_code_validator(str(value))
        except Exception as exc:
            raise serializers.ValidationError(
                "Le code secret doit contenir exactement 6 chiffres.",
                code=ErrorCode.SECRET_CODE_INVALID_FORMAT,
            ) from exc
        return str(value)

    def validate(self, attrs):
        establishment = attrs.get(
            "establishment", getattr(self.instance, "establishment", None)
        )

        if establishment is None:
            raise serializers.ValidationError(
                {
                    "code": ErrorCode.FIELD_REQUIRED,
                    "establishment": [
                        "Un assistant doit être rattaché à un établissement."
                    ],
                }
            )

        phone = attrs.get("phone")
        if phone is not None:
            qs = CustomUser.objects.filter(phone=phone)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {
                        "code": ErrorCode.PHONE_ALREADY_EXISTS,
                        "detail": "Un compte existe déjà avec ce numéro de téléphone.",
                        "phone": [
                            "Un compte existe déjà avec ce numéro de téléphone."
                        ],
                    }
                )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        secret_code = validated_data.pop("secret_code", None)
        if not secret_code:
            raise serializers.ValidationError(
                {
                    "secret_code": "Le code secret est obligatoire pour créer un assistant."
                }
            )
        validated_data["role"] = UserRole.ADMIN
        validated_data["is_active"] = True
        validated_data["is_staff"] = True
        validated_data["is_superuser"] = False

        user = CustomUser(**validated_data)
        user.set_secret_code(secret_code)
        user.save()
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        secret_code = validated_data.pop("secret_code", None)

        validated_data["role"] = UserRole.ADMIN
        validated_data["is_staff"] = True
        validated_data["is_superuser"] = False

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if secret_code:
            instance.set_secret_code(secret_code)

        instance.save()
        return instance


class BookingHistoryUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ["id", "phone", "first_name", "last_name", "role"]


class SuperAdminBookingHistorySerializer(serializers.ModelSerializer):
    booking_reference = serializers.CharField(read_only=True)
    establishment_id = serializers.IntegerField(
        source="resource.establishment_id", read_only=True
    )
    establishment_name = serializers.CharField(
        source="resource.establishment.name", read_only=True
    )
    resource_label = serializers.CharField(source="resource.label", read_only=True)
    client = BookingHistoryUserSerializer(source="user", read_only=True)
    validated_by = BookingHistoryUserSerializer(read_only=True)
    validated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "booking_reference",
            "establishment_id",
            "establishment_name",
            "resource_label",
            "booking_date",
            "start_time",
            "end_time",
            "status",
            "total_price",
            "client",
            "validated_by",
            "validated_at",
            "created_at",
        ]


class SuperAdminStatsSerializer(serializers.Serializer):
    establishment_id = serializers.IntegerField()
    establishment_name = serializers.CharField()
    active_resources = serializers.IntegerField()
    occupied_slots = serializers.IntegerField()
    total_week_slots = serializers.IntegerField()
    saturation_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)
    needs_more_resources = serializers.BooleanField()


class BookingReceiptSerializer(serializers.Serializer):
    booking_id = serializers.IntegerField()
    booking_reference = serializers.CharField()
    establishment_name = serializers.CharField()
    establishment_address = serializers.CharField()
    booking_date = serializers.DateField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    client_first_name = serializers.CharField()
    client_last_name = serializers.CharField()
    client_phone = serializers.CharField()
    secret_code = serializers.CharField(allow_null=True, required=False)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_status = serializers.CharField()
    payment_status_label = serializers.CharField()
    qr_text = serializers.CharField()
    created_at = serializers.DateTimeField()


class SystemConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfig
        fields = [
            "id",
            "default_slot_duration",
            "bookings_paused",
            "pause_reason",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]
