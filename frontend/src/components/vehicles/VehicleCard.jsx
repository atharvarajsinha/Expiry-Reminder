import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw, ShieldCheck, Wind } from 'lucide-react';

import { DocumentStatus } from './DocumentStatus.jsx';
import { Button } from '../common/Button.jsx';
import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { cn } from '../../utils/cn.js';
import { formatDate, formatRelativeTime } from '../../utils/date.js';
import { statusMeta } from '../../utils/status.js';
import { categoryLabel, vehicleIcon, vehicleTitle } from '../../utils/vehicle.js';

/** One document block inside the card. */
function DocumentSummary({ icon: Icon, label, document, company }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </div>

      {/* The list endpoint omits the insurer's name; the detail page has it. */}
      {company ? (
        <p className="mt-1.5 truncate text-sm text-slate-700 dark:text-slate-200" title={company}>
          {company}
        </p>
      ) : null}

      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Expires:{' '}
        <time dateTime={document?.expiresOn || undefined} className="font-medium text-slate-900 dark:text-white">
          {formatDate(document?.expiresOn, 'Not available')}
        </time>
      </p>

      <DocumentStatus document={document} className="mt-2" showDistance />
    </div>
  );
}

/**
 * A vehicle in the list.
 *
 * Built from the *summary* payload, which deliberately carries no owner,
 * chassis, engine or policy data - those only appear on the detail page.
 */
export function VehicleCard({ vehicle, onRefresh, isRefreshing = false, refreshDisabled = false }) {
  const Icon = vehicleIcon(vehicle.category);
  const title = vehicleTitle(vehicle);
  const accent = statusMeta(vehicle.overallStatus).accent;
  const category = categoryLabel(vehicle.category);
  const lastUpdated = formatRelativeTime(vehicle.lastFetchedAt);

  return (
    <article className="surface relative overflow-hidden transition-shadow hover:shadow-card-hover">
      {/* Colour bar carrying the worst status of the two documents. */}
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', accent)} />

      <div className="p-4 pt-5 sm:p-5 sm:pt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="mt-0.5 font-mono text-sm tracking-wide text-slate-500 dark:text-slate-400">
              {vehicle.vehicleNo}
            </p>
          </div>

          {onRefresh ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={RefreshCw}
              loading={isRefreshing}
              disabled={refreshDisabled}
              onClick={() => onRefresh(vehicle)}
              aria-label={`Refresh ${vehicle.vehicleNo}`}
              title="Refresh"
              className="-mr-1.5 -mt-1.5 shrink-0"
            />
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DocumentSummary icon={ShieldCheck} label="Insurance" document={vehicle.insurance} company={vehicle.insurance?.company} />
          <DocumentSummary icon={Wind} label="PUC" document={vehicle.pucc} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {lastUpdated ? `Last updated ${lastUpdated}` : 'Not fetched yet'}
            {category ? ` · ${category}` : ''}
          </p>

          <Button
            as={Link}
            to={`/vehicles/${vehicle.id}`}
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
export function VehicleCardSkeleton() {
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
          <div key={index} className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
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
export function VehicleListSkeleton({ count = 2 }) {
  return (
    <SkeletonGroup label="Loading vehicles" className="grid gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <VehicleCardSkeleton key={index} />
      ))}
    </SkeletonGroup>
  );
}
