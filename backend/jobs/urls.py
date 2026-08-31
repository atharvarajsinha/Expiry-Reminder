from django.urls import path

from jobs.views import JobDetailView, JobListView

urlpatterns = [
    path("", JobListView.as_view(), name="job-list"),
    path("<str:job_id>/", JobDetailView.as_view(), name="job-detail"),
]
