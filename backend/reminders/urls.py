from django.urls import path

from reminders.views import ReminderListView, ReminderRunView

urlpatterns = [
    path("", ReminderListView.as_view(), name="reminder-list"),
    path("run/", ReminderRunView.as_view(), name="reminder-run"),
]
