from rest_framework import serializers

from appsettings.services import (
    MAX_OFFSET_DAYS,
    MAX_OFFSETS_PER_CATEGORY,
    OFFSET_KEYS,
)


class ReminderOffsetsSerializer(serializers.Serializer):
    """A map of ``category -> [days before expiry]``, e.g. ``{"vehicle": [7, 1, 0]}``.

    Written as a free-form dict rather than a field per category so adding a
    category to ``items.categories`` needs no change here; unknown keys are
    dropped by ``services.update_settings``.
    """

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected an object of offset lists.")

        cleaned = {}
        for key, offsets in data.items():
            if key not in OFFSET_KEYS:
                raise serializers.ValidationError(
                    {key: "Not a category this app knows about."}
                )
            if not isinstance(offsets, (list, tuple)):
                raise serializers.ValidationError({key: "Expected a list of days."})
            if len(offsets) > MAX_OFFSETS_PER_CATEGORY:
                raise serializers.ValidationError(
                    {key: "At most %d reminders per category." % MAX_OFFSETS_PER_CATEGORY}
                )
            for value in offsets:
                if not isinstance(value, int) or isinstance(value, bool):
                    raise serializers.ValidationError(
                        {key: "Offsets must be whole numbers of days."}
                    )
                if not 0 <= value <= MAX_OFFSET_DAYS:
                    raise serializers.ValidationError(
                        {key: "Offsets must be between 0 and %d days." % MAX_OFFSET_DAYS}
                    )
            cleaned[key] = list(offsets)
        return cleaned


class SettingsSerializer(serializers.Serializer):
    reminder_email = serializers.EmailField(required=False)
    reminders = ReminderOffsetsSerializer(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "Provide reminder_email and/or reminders."
            )
        return attrs
