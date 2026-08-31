from rest_framework import serializers


class ReminderOffsetsSerializer(serializers.Serializer):
    """Days-before-expiry offsets, e.g. ``[7, 1, 0]``."""

    insurance = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=365),
        required=False,
        allow_empty=True,
        max_length=10,
    )
    pucc = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=365),
        required=False,
        allow_empty=True,
        max_length=10,
    )


class SettingsSerializer(serializers.Serializer):
    reminder_email = serializers.EmailField(required=False)
    reminders = ReminderOffsetsSerializer(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "Provide reminder_email and/or reminders."
            )
        return attrs
