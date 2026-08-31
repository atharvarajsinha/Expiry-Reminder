/**
 * Install-to-home-screen support.
 *
 * Chrome/Edge fire `beforeinstallprompt` when the app qualifies for
 * installation. The event is captured (and its default banner suppressed) so
 * the app can offer its own button, then replayed via `prompt()` - the only way
 * to open the real install dialog.
 *
 * iOS Safari never fires that event and has no programmatic install at all, so
 * there `needsManualInstall` is true and the UI shows the Share -> Add to Home
 * Screen steps instead of a button that could not work.
 *
 * **The state lives in a module-level store, not in each hook instance.** The
 * captured event is a one-shot resource: `prompt()` may only be called on it
 * once. Several components use this hook at the same time (the header button,
 * the mobile header, the dashboard card), and consuming the event in one of
 * them has to clear it in all of them - otherwise the others keep offering a
 * button that can no longer do anything.
 */
import { useCallback, useSyncExternalStore } from 'react';

const DISMISSED_KEY = 'vr:install-dismissed';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // iOS Safari uses a non-standard flag.
    window.navigator.standalone === true
  );
}

/** iOS/iPadOS Safari: installable, but only by hand. */
function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac, but with touch points.
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  // Chrome/Firefox on iOS cannot install at all; only Safari offers the option.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shared store
// ---------------------------------------------------------------------------
const store = {
  promptEvent: null,
  isInstalled: isStandalone(),
  isDismissed: readDismissed(),
  isIos: isIosSafari(),
};

const listeners = new Set();
// `useSyncExternalStore` needs a snapshot that is stable between changes, so a
// version counter is published and components read `store` directly.
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return version;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the browser's own mini-infobar; we render our own affordance.
    event.preventDefault();
    store.promptEvent = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    store.isInstalled = true;
    store.promptEvent = null;
    emit();
  });

  // Covers the case where the user installs from the browser menu instead.
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (event) => {
    store.isInstalled = event.matches;
    emit();
  });
}

/**
 * Two separate signals, because they answer different questions:
 *   canInstall     - can we install right now? (drives the header button)
 *   shouldSuggest  - should we nag? (drives the dashboard card; respects a
 *                    previous "Not Now", which must never hide the button)
 */
export function usePwaInstall() {
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const install = useCallback(async () => {
    const event = store.promptEvent;
    if (!event) return false;

    // Clear it first: the event cannot be prompted twice, so no other
    // component should still be offering it while this dialog is open.
    store.promptEvent = null;
    emit();

    event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted';
  }, []);

  const dismiss = useCallback(() => {
    store.isDismissed = true;
    emit();
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nothing to do; the card simply reappears next visit.
    }
  }, []);

  const needsManualInstall = store.isIos && !store.isInstalled;
  const hasOffer = Boolean(store.promptEvent) || needsManualInstall;

  return {
    /** A one-tap install is possible right now. */
    canInstall: Boolean(store.promptEvent) && !store.isInstalled,
    /** No programmatic install exists here - show instructions instead. */
    needsManualInstall,
    /** Anything at all to offer? */
    isInstallable: hasOffer && !store.isInstalled,
    /** Offer the explanatory card (respects a previous "Not Now"). */
    shouldSuggest: hasOffer && !store.isInstalled && !store.isDismissed,
    isInstalled: store.isInstalled,
    install,
    dismiss,
  };
}
