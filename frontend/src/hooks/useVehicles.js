/**
 * Loads the vehicle list once and exposes a `reload` for after a fetch,
 * refresh or delete. Shared by the dashboard and the vehicles page so both
 * stay consistent - and so neither ends up polling the API on a timer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { getVehicles } from '../api/vehicles.js';
import { getApiError } from '../utils/errors.js';

export function useVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState(null);

  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * `reload()` after a mutation keeps the current cards on screen and only
   * shows the small header spinner; the first load shows skeletons instead.
   */
  const load = useCallback(async ({ initial = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (initial) setIsLoading(true);
    else setIsReloading(true);

    try {
      const list = await getVehicles();
      if (!mounted.current) return;
      setVehicles(list);
      setError(null);
    } catch (requestError) {
      if (!mounted.current) return;
      const apiError = getApiError(requestError);
      // A 401 is already being handled by the API client; don't also shout
      // about it here or the login screen appears behind an error state.
      if (!apiError.isUnauthorized) setError(apiError);
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setIsLoading(false);
        setIsReloading(false);
      }
    }
  }, []);

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const reload = useCallback(() => load(), [load]);

  return { vehicles, isLoading, isReloading, error, reload };
}
