import { Loader2 } from 'lucide-react';

import { cn } from '../../utils/cn.js';

const SIZES = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
};

/**
 * An indeterminate spinner.
 *
 * Pass a `label` when the spinner is the only thing announcing that work is
 * happening; leave it off when a nearby heading already says so, to avoid
 * duplicate screen-reader announcements.
 */
export function Spinner({ size = 'md', className, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2
        aria-hidden="true"
        className={cn('animate-spin text-current', SIZES[size] || SIZES.md, className)}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Centred spinner for a whole page or route transition. */
export function FullPageSpinner({ label = 'Loading' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400"
    >
      <Spinner size="xl" className="text-primary-600 dark:text-primary-400" />
      <p className="text-sm">{label}...</p>
    </div>
  );
}
