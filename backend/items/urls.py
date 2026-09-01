from django.urls import path

from items.views import CategoryListView, ItemDetailView, ItemListView

urlpatterns = [
    path("", ItemListView.as_view(), name="item-list"),
    # Must precede the `<item_id>` route or "categories" would be read as an id.
    path("categories/", CategoryListView.as_view(), name="item-categories"),
    path("<str:item_id>/", ItemDetailView.as_view(), name="item-detail"),
]
