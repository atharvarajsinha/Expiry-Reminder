/**
 * Background job status - the endpoint `useJobPolling` calls.
 *
 * A job moves `queued -> processing -> completed | failed`. There is no
 * progress percentage in the payload, so the UI shows an indeterminate
 * loader with stage text driven by the real status rather than inventing a
 * number.
 */
import { client, unwrap } from './client.js';

export const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const TERMINAL_JOB_STATUSES = new Set([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
]);

export function mapJob(raw) {
  return {
    jobId: raw.job_id,
    jobType: raw.job_type,
    vehicleNo: raw.vehicle_no,
    vehicleId: raw.vehicle_id,
    status: raw.status,
    error: raw.error,
    errorCode: raw.error_code,
    createdAt: raw.created_at,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
  };
}

/** `GET /api/jobs/{job_id}/` */
export async function getJob(jobId) {
  return mapJob(unwrap(await client.get(`/jobs/${encodeURIComponent(jobId)}/`)));
}

/**
 * `GET /api/jobs/?limit=n` - the most recent jobs, newest first.
 * The backend clamps `limit` to 1-100.
 */
export async function getJobs({ limit = 25 } = {}) {
  const data = unwrap(await client.get('/jobs/', { params: { limit } }));
  return Array.isArray(data) ? data.map(mapJob) : [];
}

/** True while a job can still change on its own. */
export function isActiveJob(job) {
  return job?.status === JOB_STATUS.QUEUED || job?.status === JOB_STATUS.PROCESSING;
}

export const JOB_TYPE_LABELS = {
  fetch_vehicle: 'Add vehicle',
  refresh_vehicle: 'Refresh vehicle',
};

export function jobTypeLabel(jobType) {
  return JOB_TYPE_LABELS[jobType] || 'Background job';
}
