/**
 * Starts a vehicle refresh and follows the job to the end.
 *
 *   POST /vehicles/{id}/refresh/  ->  job_id  ->  poll  ->  reload the vehicle
 *
 * Shared by the dashboard, the vehicles list and the detail page so the rules
 * live in one place:
 *  - only one refresh at a time. A second click, or a click on another
 *    vehicle's refresh button while one is running, is refused with a warning
 *    instead of queueing a duplicate job;
 *  - refreshing never clears what is already on screen - the current data
 *    stays visible until the new data arrives;
 *  - offline attempts are refused rather than failing silently.
 */
import { useCallback } from 'react';

import { refreshVehicle } from '../api/vehicles.js';
import { useAsyncJob } from './useJobPolling.js';
import { useOnlineStatus } from './useOnlineStatus.js';
import { useToast } from './useToast.js';
import { getApiError } from '../utils/errors.js';

export function useVehicleRefresh({ onRefreshed, successMessage } = {}) {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const job = useAsyncJob({
    onComplete: (finishedJob, context) => {
      toast.success(
        successMessage ||
          `${context?.vehicleNo || 'Vehicle'} refreshed successfully.`,
      );
      onRefreshed?.(finishedJob, context);
    },
    onError: (message) => toast.error(message),
  });

  const refresh = useCallback(
    async (vehicle) => {
      if (!vehicle?.id) return;

      if (!isOnline) {
        toast.error("You're offline. Reconnect to refresh vehicle information.");
        return;
      }

      if (job.isRunning) {
        toast.warning('A vehicle update is already in progress.');
        return;
      }

      try {
        await job.start(() => refreshVehicle(vehicle.id), {
          vehicleId: vehicle.id,
          vehicleNo: vehicle.vehicleNo,
        });
      } catch (error) {
        toast.error(getApiError(error).message);
      }
    },
    [isOnline, job, toast],
  );

  return {
    refresh,
    /** The vehicle currently being refreshed, if any. */
    activeVehicleId: job.context?.vehicleId ?? null,
    isRunning: job.isRunning,
    status: job.status,
    attempts: job.attempts,
  };
}
