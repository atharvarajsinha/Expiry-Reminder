import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';

import { Alert } from '../components/common/Alert.jsx';
import { Button } from '../components/common/Button.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Skeleton } from '../components/common/Skeleton.jsx';
import { DocumentStatus } from '../components/vehicles/DocumentStatus.jsx';
import {
  VehicleDetails,
  VehicleDetailsSkeleton,
} from '../components/vehicles/VehicleDetails.jsx';
import { deleteVehicle, getVehicle } from '../api/vehicles.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useToast } from '../hooks/useToast.js';
import { useVehicleRefresh } from '../hooks/useVehicleRefresh.js';
import { ERROR_CODE, getApiError } from '../utils/errors.js';
import { vehicleIcon, vehicleTitle } from '../utils/vehicle.js';

/**
 * One vehicle in full, with the refresh and delete actions.
 *
 * Refresh is asynchronous end to end: it queues a job, polls it, and only then
 * reloads the record. The data already on screen is never cleared while that
 * happens - a slow upstream service must not leave the user staring at an
 * empty page.
 */
export default function VehicleDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [vehicle, setVehicle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tracked in a ref rather than read from state, so `load` can stay stable
  // (a changing `load` would restart the effect below and refetch in a loop).
  const hasData = useRef(false);

  const load = useCallback(
    async ({ initial = false } = {}) => {
      if (initial) setIsLoading(true);
      else setIsReloading(true);

      try {
        const data = await getVehicle(id);
        setVehicle(data);
        hasData.current = true;
        setError(null);
      } catch (requestError) {
        const apiError = getApiError(requestError);
        // Keep the current record on screen when a *reload* fails; only a
        // failed first load leaves us with nothing to show.
        if (initial || !hasData.current) setError(apiError);
        else toast.error(apiError.message);
      } finally {
        setIsLoading(false);
        setIsReloading(false);
      }
    },
    [id, toast],
  );

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const refresher = useVehicleRefresh({
    successMessage: 'Vehicle information updated.',
    onRefreshed: () => load(),
  });

  const onDelete = async () => {
    if (!isOnline) {
      toast.error("You're offline. Reconnect to delete this vehicle.");
      return;
    }

    setIsDeleting(true);
    try {
      await deleteVehicle(id);
      toast.success('Vehicle deleted.');
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      toast.error(getApiError(requestError).message);
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

  const backLink = (
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Back
    </Link>
  );

  if (isLoading) {
    return (
      <>
        <div className="mb-5">
          {backLink}
          <div className="mt-4 space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <VehicleDetailsSkeleton />
      </>
    );
  }

  if (error && !vehicle) {
    const notFound =
      error.status === 404 || error.code === ERROR_CODE.VEHICLE_NOT_FOUND;

    return (
      <>
        <div className="mb-5">{backLink}</div>
        {notFound ? (
          <ErrorState
            title="Vehicle not found."
            description="It may have been deleted. Head back to the dashboard to see your current vehicles."
            onRetry={() => navigate('/dashboard')}
            retryLabel="Back to Dashboard"
          />
        ) : (
          <ErrorState
            title="We couldn't load this vehicle."
            description={error.message}
            onRetry={() => load({ initial: true })}
            isRetrying={isReloading}
            offline={error.code === ERROR_CODE.OFFLINE}
          />
        )}
      </>
    );
  }

  const Icon = vehicleIcon(vehicle.category);
  const isRefreshingThis = refresher.activeVehicleId === vehicle.id;

  return (
    <>
      <div className="mb-5">
        {backLink}

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>

            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                {vehicleTitle(vehicle)}
              </h1>
              <p className="mt-0.5 font-mono text-sm tracking-wide text-slate-500 dark:text-slate-400">
                {vehicle.vehicleNo}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={isRefreshingThis}
              disabled={refresher.isRunning && !isRefreshingThis}
              onClick={() => refresher.refresh(vehicle)}
            >
              {isRefreshingThis ? 'Refreshing...' : 'Refresh Data'}
            </Button>

            <Button
              variant="danger-outline"
              icon={Trash2}
              onClick={() => setIsConfirmOpen(true)}
              disabled={isDeleting}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Insurance
          </span>
          <DocumentStatus document={vehicle.insurance} size="sm" />
          <span className="ml-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            PUC
          </span>
          <DocumentStatus document={vehicle.pucc} size="sm" />
        </div>
      </div>

      {isRefreshingThis ? (
        <Alert variant="info" title="Refreshing vehicle information..." className="mb-4">
          Your existing information will remain available until the new information is
          retrieved.
        </Alert>
      ) : null}

      <VehicleDetails vehicle={vehicle} />

      <ConfirmDialog
        open={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={onDelete}
        title="Delete Vehicle?"
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Vehicle'}
        loading={isDeleting}
      >
        <p>Are you sure you want to remove:</p>
        <p className="mt-3 font-semibold text-slate-900 dark:text-white">
          {vehicleTitle(vehicle)}
        </p>
        <p className="font-mono text-sm tracking-wide text-slate-500 dark:text-slate-400">
          {vehicle.vehicleNo}
        </p>
        <p className="mt-3">This action cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}
