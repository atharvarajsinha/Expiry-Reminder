import { useEffect } from 'react';

import { PWA_OFFLINE_READY } from '../../pwa.js';
import { useToast } from '../../hooks/useToast.js';
import { APP_NAME } from '../../constants/app.js';

/**
 * Bridges the service worker's one user-facing event into the toast system.
 * Renders nothing.
 */
export function PwaStatus() {
  const toast = useToast();

  useEffect(() => {
    const onOfflineReady = () =>
      toast.info(`${APP_NAME} is ready to work offline.`);

    window.addEventListener(PWA_OFFLINE_READY, onOfflineReady);
    return () => window.removeEventListener(PWA_OFFLINE_READY, onOfflineReady);
  }, [toast]);

  return null;
}
