/**
 * Service-worker registration.
 *
 * `virtual:pwa-register` is provided by vite-plugin-pwa; in dev (where
 * `devOptions.enabled` is false) it is a no-op, so this is safe to call
 * unconditionally.
 *
 * The plugin is configured with `registerType: 'autoUpdate'`, so a new build
 * takes over on its own. The only thing worth telling the user about is that
 * the shell is now available offline - reported through a DOM event so this
 * module needs no React context.
 */
import { registerSW } from 'virtual:pwa-register';

export const PWA_OFFLINE_READY = 'pwa:offline-ready';

export function registerServiceWorker() {
  registerSW({
    immediate: true,
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent(PWA_OFFLINE_READY));
    },
    onRegisterError() {
      // Registration failing only costs offline support, so it must never
      // break the app. Nothing is logged that could contain user data.
      console.warn('Service worker registration failed; offline mode is unavailable.');
    },
  });
}
