/**
 * Product naming, in one place.
 *
 * Change APP_NAME here to rename the app everywhere in the UI (wordmark, page
 * titles, install prompt, toasts). The two places outside the bundle that also
 * carry the name must be edited to match:
 *
 *   - `vite.config.js`  -> VitePWA manifest `name` / `short_name`
 *   - `index.html`      -> <title> and apple-mobile-web-app-title
 *
 * Those are read at build time by the browser and the install prompt, so they
 * cannot import from here.
 */
export const APP_NAME = 'Expiry Reminders';

/** One line describing what the app does; used under the wordmark and in meta. */
export const APP_TAGLINE = 'Never miss a renewal';

export const APP_DESCRIPTION =
  'Track when your documents, cards, vehicle papers and policies expire, and get reminded before they do.';
