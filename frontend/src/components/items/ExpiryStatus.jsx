import { cn } from '../../utils/cn.js';
import { formatExpiryDistance } from '../../utils/date.js';
import { resolveExpiryStatus } from '../../utils/status.js';

const SIZES = {
  sm: 'px-2 py-0.5 text-[0.6875rem] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

/**
 * The status badge for one expiry date: Valid / Expiring Soon / Expires Today /
 * Expired (or "Not available" when the date is unknown).
 *
 * `expiry` is the mapped `{ expiresOn, status, statusLabel, daysRemaining }`
 * block. Colour is never the only signal - each state has its own icon and its
 * own words.
 */
export function ExpiryStatus({ expiry, size = 'md', showDistance = false, className }) {
  const { label, daysRemaining, meta } = resolveExpiryStatus(expiry);
  const Icon = meta.icon;
  const distance = showDistance ? formatExpiryDistance(daysRemaining) : null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span
        className={cn(
          'inline-flex items-center rounded-full font-medium ring-1 ring-inset',
          SIZES[size] || SIZES.md,
          meta.badge,
        )}
      >
        <Icon aria-hidden="true" className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {label}
      </span>

      {distance ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">{distance}</span>
      ) : null}
    </span>
  );
}
