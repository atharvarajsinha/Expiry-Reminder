from rest_framework import serializers


class VehicleFetchSerializer(serializers.Serializer):
    """Input for ``POST /api/vehicles/fetch/``."""

    vehicle_no = serializers.CharField(max_length=20, trim_whitespace=True)
