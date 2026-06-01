from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_booking_payment_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="whatsapp_reminder_sent_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Rappel WhatsApp envoyé le",
            ),
        ),
    ]
