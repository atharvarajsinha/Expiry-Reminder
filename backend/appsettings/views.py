"""``GET`` / ``PUT`` ``/api/settings/``."""

from django.conf import settings as django_settings
from rest_framework.views import APIView

from appsettings import services
from appsettings.serializers import SettingsSerializer
from core.responses import success


def _delivery_status():
    """Whether email can actually be sent, and when the sweep last ran.

    Booleans only -- the settings screen needs to be able to say "email is not
    configured" without the API ever handing out a key.
    """
    from reminders.services import sweep_state

    return {
        "email_configured": bool(
            django_settings.BREVO_API_KEY and django_settings.BREVO_SENDER_EMAIL
        ),
        "cron_configured": bool(django_settings.CRON_TOKEN),
        "sweep_on_request": bool(django_settings.REMINDER_SWEEP_ON_REQUEST),
        "expiring_soon_days": django_settings.EXPIRING_SOON_DAYS,
        "timezone": django_settings.TIME_ZONE,
        "sweep": sweep_state(),
    }


class SettingsView(APIView):
    throttle_scope = "read"

    def get(self, request):
        return success({**services.get_settings(), "delivery": _delivery_status()})

    def put(self, request):
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = services.update_settings(serializer.validated_data)
        return success({**updated, "delivery": _delivery_status()})
