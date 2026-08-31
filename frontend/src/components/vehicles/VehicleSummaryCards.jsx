import { AlertTriangle, CheckCircle2, Clock, Car } from 'lucide-react';

import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { cn } from '../../utils/cn.js';
import { summarizeDocuments } from '../../utils/status.js';

const CARDS = [
  {
    key: 'vehicles',
    label: 'Total Vehicles',
    icon: Car,
    tone: 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400',
  },
  {
    key: 'valid',
    label: 'Valid Documents',
    icon: CheckCircle2,
    tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  {
    key: 'expiringSoon',
    label: 'Expiring Soon',
    icon: Clock,
    tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  },
  {
    key: 'expired',
    label: 'Expired',
    icon: AlertTriangle,
    tone: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  },
];

/**
 * The four dashboard counters.
 *
 * "Valid", "Expiring Soon" and "Expired" count *documents* - insurance and PUC
 * for each vehicle - so two vehicles produce up to four counted documents.
 * Documents with no known expiry date are left out of all three rather than
 * being quietly counted as valid.
 */
export function VehicleSummaryCards({ vehicles }) {
  const counts = summarizeDocuments(vehicles);

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, tone }) => (
        <div key={key} className="surface flex items-center gap-3 p-4">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}>
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            {/* Wraps rather than truncating: at 320px two columns are narrow. */}
            <dt className="text-xs font-medium leading-tight text-slate-500 dark:text-slate-400">
              {label}
            </dt>
            <dd className="tabular text-xl font-semibold text-slate-900 dark:text-white">
              {counts[key]}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

export function VehicleSummaryCardsSkeleton() {
  return (
    <SkeletonGroup label="Loading summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map(({ key }) => (
        <div key={key} className="surface flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10" rounded="rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-8" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
