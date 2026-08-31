import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

import { cn } from '../../utils/cn.js';
import { Button } from './Button.jsx';

/**
 * The failure counterpart to `EmptyState`.
 *
 * `description` should already be a friendly sentence from
 * `getApiError(error).message` - raw errors and stack traces never reach here.
 */
export function ErrorState({
  title = 'Something went wrong.',
  description,
  onRetry,
  retryLabel = 'Try Again',
  isRetrying = false,
  offline = false,
  className,
}) {
  const Icon = offline ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'surface flex flex-col items-center px-6 py-12 text-center sm:py-14',
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <Icon aria-hidden="true" className="h-7 w-7" />
      </div>

      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>

      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}

      {onRetry ? (
        <Button
          variant="secondary"
          icon={RefreshCw}
          loading={isRetrying}
          onClick={onRetry}
          className="mt-6"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
