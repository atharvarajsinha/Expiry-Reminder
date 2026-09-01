"""Item REST endpoints.

Everything here is synchronous: an item is typed in by the user, so a create
is a single database write and answers ``201`` with the stored record.  There
is no queue, no polling and no upstream service to wait for.
"""

from __future__ import annotations

import logging

from rest_framework.views import APIView

from core.dates import today_local
from core.responses import success
from items import categories, services
from items.serializers import ItemUpdateSerializer, ItemWriteSerializer

logger = logging.getLogger(__name__)


class CategoryListView(APIView):
    """``GET /api/items/categories/`` -- the catalogue the forms are built from."""

    throttle_scope = "read"

    def get(self, request):
        return success(categories.catalogue())


class ItemListView(APIView):
    """``GET /api/items/`` and ``POST /api/items/``."""

    def get_throttles(self):
        self.throttle_scope = "read" if self.request.method == "GET" else "write"
        return super().get_throttles()

    def get(self, request):
        today = today_local()
        documents = services.list_items(
            category=request.query_params.get("category") or None
        )
        return success([services.serialize(doc, today) for doc in documents])

    def post(self, request):
        serializer = ItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = services.create_item(serializer.validated_data)
        return success(services.serialize(document, today_local()), status_code=201)


class ItemDetailView(APIView):
    """``GET`` / ``PUT`` / ``DELETE`` ``/api/items/{id}/``."""

    def get_throttles(self):
        self.throttle_scope = "read" if self.request.method == "GET" else "write"
        return super().get_throttles()

    def get(self, request, item_id):
        document = services.get_by_id(item_id)
        return success(services.serialize(document, today_local()))

    def put(self, request, item_id):
        serializer = ItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = services.update_item(item_id, serializer.validated_data)
        return success(services.serialize(document, today_local()))

    def delete(self, request, item_id):
        services.delete_item(item_id)
        return success({"deleted": True, "id": str(item_id)})
