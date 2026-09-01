/**
 * Loads the item list and the category catalogue once, and exposes a `reload`
 * for after a create, edit or delete. Shared by the dashboard and the items
 * page so both stay consistent - and so neither polls the API on a timer.
 *
 * The catalogue is fetched alongside the list because almost everything that
 * renders an item needs it (icon, field labels, card masking), and it is small
 * and effectively static.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { getCategories, getItems } from '../api/items.js';
import { getApiError } from '../utils/errors.js';

export function useItems() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
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
      // Independent requests, so one round trip rather than two.
      const [nextItems, nextCategories] = await Promise.all([
        getItems(),
        getCategories(),
      ]);
      if (!mounted.current) return;
      setItems(nextItems);
      setCategories(nextCategories);
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

  return { items, categories, isLoading, isReloading, error, reload };
}
