import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

import { JOB_STATUS } from '../../api/jobs.js';
import { cn } from '../../utils/cn.js';

const META = {
  [JOB_STATUS.QUEUED]: {
    label: 'Queued',
    icon: Clock,
    badge:
      'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-400/20',
  },
  [JOB_STATUS.PROCESSING]: {
    label: 'Processing',
    icon: Loader2,
    badge:
      'bg-primary-50 text-primary-700 ring-primary-600/20 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-400/20',
    spin: true,
  },
  [JOB_STATUS.COMPLETED]: {
    label: 'Completed',
    icon: CheckCircle2,
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
  [JOB_STATUS.FAILED]: {
    label: 'Failed',
    icon: XCircle,
    badge:
      'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
  },
};

/** Status pill for a background job. */
export function JobStatusBadge({ status, className }) {
  const meta = META[status] || META[JOB_STATUS.QUEUED];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        meta.badge,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('h-3.5 w-3.5', meta.spin && 'animate-spin')} />
      {meta.label}
    </span>
  );
}
