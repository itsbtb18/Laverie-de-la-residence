from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0007_alter_booking_status_alter_booking_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="chargily_checkout_id",
            field=models.CharField(
                blank=True,
                default="",
                max_length=50,
                verbose_name="Chargily Checkout ID",
            ),
        ),
    ]
