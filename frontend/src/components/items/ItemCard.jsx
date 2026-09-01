import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, Pencil } from 'lucide-react';

import { ExpiryStatus } from './ExpiryStatus.jsx';
import { Button } from '../common/Button.jsx';
import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { cn } from '../../utils/cn.js';
import { findCategory, iconForItem } from '../../utils/categories.js';
import { formatDate } from '../../utils/date.js';
import { displayIdentifier } from '../../utils/identifier.js';
import { statusMeta } from '../../utils/status.js';

/** How many expiry rows a card shows before collapsing the rest into a count. */
const VISIBLE_EXPIRIES = 3;

/** One expiry inside the card. */
function ExpiryRow({ expiry }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <CalendarClock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate" title={expiry.label}>
          {expiry.label}
        </span>
      </div>

      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
        <time
          dateTime={expiry.expiresOn || undefined}
          className="font-medium text-slate-900 dark:text-white"
        >
          {formatDate(expiry.expiresOn, 'No date')}
        </time>
      </p>

      <ExpiryStatus expiry={expiry} className="mt-2" showDistance />
    </div>
  );
}

/**
 * An item in the list.
 *
 * The card leads with the dates rather than the item's details, because the
 * question it exists to answer is "what needs renewing", not "what do I own".
 */
export function ItemCard({ item, categories, onEdit }) {
  const category = findCategory(categories, item.category);
  const Icon = iconForItem(categories, item);
  const accent = statusMeta(item.overallStatus).accent;
  const identifier = displayIdentifier(category, item.identifier);

  const visible = item.expiries.slice(0, VISIBLE_EXPIRIES);
  const hidden = item.expiries.length - visible.length;

  return (
    <article className="surface relative overflow-hidden transition-shadow hover:shadow-card-hover">
      {/* Colour bar carrying the most urgent status among the item's dates. */}
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', accent)} />

      <div className="p-4 pt-5 sm:p-5 sm:pt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">
              {item.name}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
              <span>{item.categoryLabel}</span>
              {identifier ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tracking-wide">{identifier}</span>
                </>
              ) : null}
            </p>
          </div>

          {onEdit ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={Pencil}
              onClick={() => onEdit(item)}
              aria-label={`Edit ${item.name}`}
              title="Edit"
              className="-mr-1.5 -mt-1.5 shrink-0"
            />
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visible.map((expiry) => (
            <ExpiryRow key={expiry.key} expiry={expiry} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {hidden > 0
              ? `+${hidden} more date${hidden === 1 ? '' : 's'}`
              : `${item.expiries.length} date${item.expiries.length === 1 ? '' : 's'} tracked`}
          </p>

          <Button
            as={Link}
            to={`/items/${item.id}`}
            variant="secondary"
            size="sm"
            className="ml-auto"
          >
            View Details
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Placeholder shown while the list loads. */
export function ItemCardSkeleton() {
  return (
    <div className="surface p-4 pt-5 sm:p-5 sm:pt-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11" rounded="rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-5 w-24" rounded="rounded-full" />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-28" rounded="rounded-xl" />
      </div>
    </div>
  );
}

/** A grid of skeleton cards with a single loading announcement. */
export function ItemListSkeleton({ count = 2 }) {
  return (
    <SkeletonGroup label="Loading items" className="grid gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <ItemCardSkeleton key={index} />
      ))}
    </SkeletonGroup>
  );
}
