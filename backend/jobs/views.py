"""Job status endpoints used by the frontend polling loop."""

from rest_framework.views import APIView

from core.responses import success
from jobs import services


class JobDetailView(APIView):
    """``GET /api/jobs/{job_id}/``"""

    throttle_scope = "read"

    def get(self, request, job_id):
        job = services.get_job(job_id)
        return success(services.serialize(job))


class JobListView(APIView):
    """``GET /api/jobs/`` -- the most recent jobs (handy for debugging)."""

    throttle_scope = "read"

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 25))
        except (TypeError, ValueError):
            limit = 25
        limit = max(1, min(limit, 100))
        jobs = services.list_jobs(limit=limit)
        return success([services.serialize(job) for job in jobs])
