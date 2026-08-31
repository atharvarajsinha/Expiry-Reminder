from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False)


class RefreshSerializer(serializers.Serializer):
    """The refresh token normally arrives in a cookie; the body is optional."""

    refresh = serializers.CharField(required=False, allow_blank=True)
