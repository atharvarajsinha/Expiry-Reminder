"""``GET`` / ``PUT`` ``/api/settings/``."""

from rest_framework.views import APIView

from appsettings import services
from appsettings.serializers import SettingsSerializer
from core.responses import success


class SettingsView(APIView):
    throttle_scope = "read"

    def get(self, request):
        return success(services.get_settings())

    def put(self, request):
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = services.update_settings(serializer.validated_data)
        return success(updated)
