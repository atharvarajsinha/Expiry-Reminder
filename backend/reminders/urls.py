from django.urls import path

from reminders.views import ReminderListView, ReminderRunView, ReminderUpcomingView

urlpatterns = [
    path("", ReminderListView.as_view(), name="reminder-list"),
    path("upcoming/", ReminderUpcomingView.as_view(), name="reminder-upcoming"),
    path("run/", ReminderRunView.as_view(), name="reminder-run"),
]
