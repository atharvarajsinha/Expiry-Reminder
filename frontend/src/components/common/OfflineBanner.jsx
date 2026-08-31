import { WifiOff } from 'lucide-react';

import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

/**
 * Shown while the browser reports no connection.
 *
 * The app shell keeps working from the service-worker cache, but nothing
 * pretends a request succeeded: writes are blocked with a toast and reads
 * surface a normal error state.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>
        You&apos;re offline.
        <span className="hidden sm:inline"> Some features may be unavailable.</span>
      </span>
    </div>
  );
}
