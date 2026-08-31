import { useMemo, useState } from 'react';
import { CarFront, Plus, RefreshCw, Search } from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Input } from '../components/common/Input.jsx';
import { AddVehicleModal } from '../components/vehicles/AddVehicleModal.jsx';
import {
  VehicleCard,
  VehicleListSkeleton,
} from '../components/vehicles/VehicleCard.jsx';
import { useVehicles } from '../hooks/useVehicles.js';
import { useVehicleRefresh } from '../hooks/useVehicleRefresh.js';
import { cn } from '../utils/cn.js';
import { ERROR_CODE } from '../utils/errors.js';
import { STATUS } from '../utils/status.js';
import { normalizeVehicleNumber } from '../utils/vehicle.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: STATUS.VALID, label: 'Valid' },
  { key: STATUS.EXPIRING_SOON, label: 'Expiring Soon' },
  { key: 'attention', label: 'Expired' },
];

/** `attention` covers both "expires today" and "already expired". */
function matchesFilter(vehicle, filter) {
  if (filter === 'all') return true;
  if (filter === 'attention') {
    return (
      vehicle.overallStatus === STATUS.EXPIRED ||
      vehicle.overallStatus === STATUS.EXPIRES_TODAY
    );
  }
  return vehicle.overallStatus === filter;
}

/**
 * The full vehicle list, with a search box and status filters.
 *
 * The dashboard is the at-a-glance view; this page is for finding one vehicle
 * among many. Both read the same list endpoint through `useVehicles`.
 */
export default function VehiclesPage() {
  const { vehicles, isLoading, isReloading, error, reload } = useVehicles();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const refresher = useVehicleRefresh({ onRefreshed: reload });

  const visible = useMemo(() => {
    const plain = query.trim().toLowerCase();
    // Also match a number typed with spaces or dashes.
    const asNumber = normalizeVehicleNumber(query);

    return vehicles.filter((vehicle) => {
      if (!matchesFilter(vehicle, filter)) return false;
      if (!plain) return true;

      const haystack = [vehicle.maker, vehicle.model].filter(Boolean).join(' ').toLowerCase();
      return (
        haystack.includes(plain) ||
        (asNumber && (vehicle.vehicleNo || '').includes(asNumber))
      );
    });
  }, [vehicles, query, filter]);

  const hasVehicles = vehicles.length > 0;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Vehicles
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {hasVehicles
              ? `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} tracked`
              : 'Nothing tracked yet'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            iconOnly
            icon={RefreshCw}
            loading={isReloading}
            onClick={reload}
            aria-label="Reload vehicle list"
            title="Reload vehicle list"
          />
          <Button icon={Plus} onClick={() => setIsAddOpen(true)}>
            Add Vehicle
          </Button>
        </div>
      </header>

      {hasVehicles && !isLoading && !error ? (
        <div className="mb-5 space-y-3">
          <Input
            id="vehicle-search"
            type="search"
            label="Search vehicles"
            labelHidden
            placeholder="Search by number, maker or model"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            icon={Search}
            autoComplete="off"
          />

          <div
            role="group"
            aria-label="Filter by document status"
            className="flex flex-wrap gap-2"
          >
            {FILTERS.map(({ key, label }) => {
              const isActive = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={isActive}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <VehicleListSkeleton count={3} />
      ) : error ? (
        <ErrorState
          title="We couldn't load your vehicles."
          description={error.message}
          onRetry={reload}
          isRetrying={isReloading}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : !hasVehicles ? (
        <EmptyState
          icon={CarFront}
          title="No vehicles added yet."
          description="Add your first vehicle to start tracking insurance and PUC expiry."
          action={
            <Button icon={Plus} onClick={() => setIsAddOpen(true)}>
              Add Vehicle
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching vehicles."
          description="Try a different search term or clear the status filter."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {visible.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onRefresh={refresher.refresh}
              isRefreshing={refresher.activeVehicleId === vehicle.id}
              refreshDisabled={
                refresher.isRunning && refresher.activeVehicleId !== vehicle.id
              }
            />
          ))}
        </div>
      )}

      <AddVehicleModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdded={reload}
      />
    </>
  );
}
