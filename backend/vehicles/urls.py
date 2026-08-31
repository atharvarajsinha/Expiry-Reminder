from django.urls import path

from vehicles.views import (
    VehicleDetailView,
    VehicleFetchView,
    VehicleListView,
    VehicleRefreshView,
)

urlpatterns = [
    path("", VehicleListView.as_view(), name="vehicle-list"),
    path("fetch/", VehicleFetchView.as_view(), name="vehicle-fetch"),
    path("<str:vehicle_id>/", VehicleDetailView.as_view(), name="vehicle-detail"),
    path(
        "<str:vehicle_id>/refresh/",
        VehicleRefreshView.as_view(),
        name="vehicle-refresh",
    ),
]
