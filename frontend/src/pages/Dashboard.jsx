import { useState } from 'react';
import { CarFront, Plus, RefreshCw } from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { InstallPrompt } from '../components/common/InstallPrompt.jsx';
import { AddVehicleModal } from '../components/vehicles/AddVehicleModal.jsx';
import {
  VehicleCard,
  VehicleListSkeleton,
} from '../components/vehicles/VehicleCard.jsx';
import {
  VehicleSummaryCards,
  VehicleSummaryCardsSkeleton,
} from '../components/vehicles/VehicleSummaryCards.jsx';
import { useVehicles } from '../hooks/useVehicles.js';
import { useVehicleRefresh } from '../hooks/useVehicleRefresh.js';
import { ERROR_CODE } from '../utils/errors.js';

/**
 * The overview: counters, then a card per vehicle.
 *
 * The list is loaded once and reloaded after a mutation - there is no polling
 * timer here, so the API is never hammered just because a tab is open.
 */
export default function Dashboard() {
  const { vehicles, isLoading, isReloading, error, reload } = useVehicles();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const refresher = useVehicleRefresh({ onRefreshed: reload });

  return (
    <>
      <InstallPrompt />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            My Vehicles
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Insurance and PUC status at a glance.
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
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
          />
          <Button icon={Plus} onClick={() => setIsAddOpen(true)}>
            Add Vehicle
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-5">
          <VehicleSummaryCardsSkeleton />
          <VehicleListSkeleton count={2} />
        </div>
      ) : error ? (
        <ErrorState
          title="We couldn't load your vehicles."
          description={error.message}
          onRetry={reload}
          isRetrying={isReloading}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : vehicles.length === 0 ? (
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
      ) : (
        <div className="grid gap-5">
          <VehicleSummaryCards vehicles={vehicles} />

          <div className="grid gap-4">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onRefresh={refresher.refresh}
                isRefreshing={refresher.activeVehicleId === vehicle.id}
                // One refresh at a time: the other buttons go quiet meanwhile.
                refreshDisabled={
                  refresher.isRunning && refresher.activeVehicleId !== vehicle.id
                }
              />
            ))}
          </div>
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
