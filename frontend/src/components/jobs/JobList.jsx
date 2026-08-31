import { Link } from 'react-router-dom';
import { ArrowRight, Download, RefreshCw } from 'lucide-react';

import { JobStatusBadge } from './JobStatusBadge.jsx';
import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { JOB_STATUS, jobTypeLabel } from '../../api/jobs.js';
import { cn } from '../../utils/cn.js';
import { formatDateTime, formatRelativeTime } from '../../utils/date.js';
import { getJobErrorMessage } from '../../utils/errors.js';

const TYPE_ICONS = {
  fetch_vehicle: Download,
  refresh_vehicle: RefreshCw,
};

function JobItem({ job }) {
  const Icon = TYPE_ICONS[job.jobType] || Download;

  return (
    <li className="surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {jobTypeLabel(job.jobType)}
            </p>
            <JobStatusBadge status={job.status} />
          </div>

          <p className="mt-1 font-mono text-sm tracking-wide text-slate-500 dark:text-slate-400">
            {job.vehicleNo || 'Unknown vehicle'}
          </p>

          {job.status === JOB_STATUS.FAILED ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {getJobErrorMessage(job)}
            </p>
          ) : null}

          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
            <div className="flex gap-1">
              <dt>Started</dt>
              <dd>{formatRelativeTime(job.createdAt) || formatDateTime(job.createdAt)}</dd>
            </div>
            {job.completedAt ? (
              <div className="flex gap-1">
                <dt>Finished</dt>
                <dd>{formatDateTime(job.completedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {job.vehicleId && job.status === JOB_STATUS.COMPLETED ? (
          <Link
            to={`/vehicles/${job.vehicleId}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 self-center rounded-lg px-2 py-1.5 text-sm font-medium',
              'text-primary-700 transition-colors hover:bg-primary-50',
              'dark:text-primary-300 dark:hover:bg-primary-500/10',
            )}
          >
            <span className="hidden sm:inline">View</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">View {job.vehicleNo}</span>
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function JobList({ jobs }) {
  return (
    <ul className="grid gap-3">
      {jobs.map((job) => (
        <JobItem key={job.jobId} job={job} />
      ))}
    </ul>
  );
}

export function JobListSkeleton({ count = 3 }) {
  return (
    <SkeletonGroup label="Loading background jobs" className="grid gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface flex items-start gap-3 p-4">
          <Skeleton className="h-9 w-9" rounded="rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-52" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
