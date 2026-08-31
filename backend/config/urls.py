"""Root URL configuration.

Every API route lives under ``/api/``.  Only ``/api/health/`` is public, all
other routes require a valid JWT (cookie or ``Authorization`` header).
"""

from django.http import JsonResponse
from django.urls import include, path


def root(_request):
    return JsonResponse(
        {
            "success": True,
            "data": {
                "service": "vehicle-document-reminder",
                "docs": "See README.md for the API reference",
                "health": "/api/health/",
            },
        }
    )


urlpatterns = [
    path("", root),
    path("api/auth/", include("authentication.urls")),
    path("api/vehicles/", include("vehicles.urls")),
    path("api/jobs/", include("jobs.urls")),
    path("api/settings/", include("appsettings.urls")),
    path("api/reminders/", include("reminders.urls")),
    path("api/health/", include("health.urls")),
]
