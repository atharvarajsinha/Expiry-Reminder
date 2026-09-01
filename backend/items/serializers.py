"""Request shapes for the item endpoints.

These serializers check *types and sizes* only.  Everything with meaning
attached -- whether a category exists, whether a plate is real, whether an
identifier is a card number that must be refused -- lives in
``items.services`` so the create and update paths cannot drift apart, and so
the same rules apply to a seeded item as to one typed into the form.
"""

from rest_framework import serializers

from items.services import MAX_EXPIRIES_PER_ITEM


class ExpirySerializer(serializers.Serializer):
    key = serializers.CharField(max_length=40, trim_whitespace=True)
    label = serializers.CharField(
        max_length=60, required=False, allow_blank=True, allow_null=True
    )
    # Dates arrive as `YYYY-MM-DD` but `core.dates.parse_date` accepts the
    # other common forms too, so this stays a CharField and defers to it.
    expires_on = serializers.CharField(max_length=40)
    issued_on = serializers.CharField(
        max_length=40, required=False, allow_blank=True, allow_null=True
    )
    reference = serializers.CharField(
        max_length=60, required=False, allow_blank=True, allow_null=True
    )


class ItemWriteSerializer(serializers.Serializer):
    """Body of ``POST /api/items/`` and ``PUT /api/items/{id}/``."""

    category = serializers.CharField(max_length=40, trim_whitespace=True)
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    identifier = serializers.CharField(
        max_length=60, required=False, allow_blank=True, allow_null=True
    )
    issuer = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    holder = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    notes = serializers.CharField(
        max_length=1000, required=False, allow_blank=True, allow_null=True
    )
    expiries = serializers.ListField(
        child=ExpirySerializer(), allow_empty=False, max_length=MAX_EXPIRIES_PER_ITEM
    )


class ItemUpdateSerializer(ItemWriteSerializer):
    """An update may leave the category alone; services keeps the stored one."""

    category = serializers.CharField(
        max_length=40, trim_whitespace=True, required=False
    )
