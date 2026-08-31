from django.urls import path

from appsettings.views import SettingsView

urlpatterns = [
    path("", SettingsView.as_view(), name="app-settings"),
]
