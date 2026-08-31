import { cn } from '../../utils/cn.js';
import { formatExpiryDistance } from '../../utils/date.js';
import { resolveDocumentStatus } from '../../utils/status.js';

const SIZES = {
  sm: 'px-2 py-0.5 text-[0.6875rem] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

/**
 * The status badge for one document: Valid / Expiring Soon / Expires Today /
 * Expired (or "Not available" when the expiry date is unknown).
 *
 * `document` is the mapped `{ expiresOn, status, statusLabel, daysRemaining }`
 * block from either the summary or the detail payload. Colour is never the only
 * signal - each state has its own icon and its own words.
 */
export function DocumentStatus({ document, size = 'md', showDistance = false, className }) {
  const { label, daysRemaining, meta } = resolveDocumentStatus(document);
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
