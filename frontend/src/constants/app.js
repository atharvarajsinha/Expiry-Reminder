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
export const APP_NAME = 'Remind Vahan';

/** One line describing what the app does; used under the wordmark and in meta. */
export const APP_TAGLINE = 'Vehicle document reminders';

export const APP_DESCRIPTION =
  'Track vehicle insurance and PUC expiry dates with simple email reminders.';
