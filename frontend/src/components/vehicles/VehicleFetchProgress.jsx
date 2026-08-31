import { Check, Loader2 } from 'lucide-react';

import { JOB_STATUS } from '../../api/jobs.js';
import { cn } from '../../utils/cn.js';

/**
 * Progress UI for a background fetch or refresh.
 *
 * The API exposes no progress percentage, so none is invented: this is an
 * indeterminate animation plus a three-step trail driven entirely by the real
 * job status (`queued` -> `processing` -> `completed`). A slow job gets an
 * extra line of reassurance rather than a fake number crawling to 99%.
 */
const STEPS = [
  { key: JOB_STATUS.QUEUED, label: 'Request queued' },
  { key: JOB_STATUS.PROCESSING, label: 'Fetching vehicle information' },
  { key: JOB_STATUS.COMPLETED, label: 'Saving information' },
];

const STEP_INDEX = {
  [JOB_STATUS.QUEUED]: 0,
  [JOB_STATUS.PROCESSING]: 1,
  [JOB_STATUS.COMPLETED]: 2,
};

const HEADLINES = {
  [JOB_STATUS.QUEUED]: 'Waiting for the vehicle service...',
  [JOB_STATUS.PROCESSING]: 'Fetching vehicle details...',
  [JOB_STATUS.COMPLETED]: 'Almost done...',
};

/** Roughly 30 seconds at the default 2.5s interval. */
const SLOW_AFTER_ATTEMPTS = 12;

export function VehicleFetchProgress({
  vehicleNo,
  status = JOB_STATUS.QUEUED,
  attempts = 0,
  title = 'Fetching Vehicle Details',
  keepOpenNotice = 'Please keep this page open.',
}) {
  const activeIndex = STEP_INDEX[status] ?? 0;

  return (
    <div className="py-2 text-center" aria-live="polite">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-500/10">
        <Loader2
          aria-hidden="true"
          className="h-7 w-7 animate-spin text-primary-600 dark:text-primary-400"
        />
      </div>

      <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{title}</h3>

      {vehicleNo ? (
        <p className="mt-1 font-mono text-sm tracking-wide text-slate-500 dark:text-slate-400">
          {vehicleNo}
        </p>
      ) : null}

      {/* Indeterminate bar: motion without a misleading percentage. */}
      <div
        className="mx-auto mt-5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-label={HEADLINES[status] || 'Working'}
      >
        <div className="h-full w-1/3 rounded-full bg-primary-600 animate-progress-indeterminate dark:bg-primary-500" />
      </div>

      <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
        {HEADLINES[status] || 'Working...'}
      </p>

      <ol className="mx-auto mt-5 max-w-xs space-y-2.5 text-left">
        {STEPS.map((step, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;

          return (
            <li key={step.key} className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  done && 'bg-emerald-500 text-white',
                  current && 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-300',
                  !done && !current && 'border border-slate-300 dark:border-slate-600',
                )}
              >
                {done ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
                {current ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                ) : null}
              </span>

              <span
                className={cn(
                  'text-sm',
                  done && 'text-slate-500 dark:text-slate-400',
                  current && 'font-medium text-slate-900 dark:text-white',
                  !done && !current && 'text-slate-400 dark:text-slate-500',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">{keepOpenNotice}</p>

      {attempts > SLOW_AFTER_ATTEMPTS ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          The vehicle service is taking a while to respond. This can take a couple of
          minutes.
        </p>
      ) : null}
    </div>
  );
}
