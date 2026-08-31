import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity.
 *
 * `navigator.onLine` only proves a network interface is up, not that the API is
 * reachable - so it is used to *warn* and to block pointless writes, never to
 * claim a request succeeded.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
