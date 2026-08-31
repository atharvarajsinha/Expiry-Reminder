# Remind Vahan — Frontend

An installable PWA for tracking vehicle insurance and PUC expiry, built against the
Django REST + MongoDB + Celery backend in `../backend`.

The product name lives in one place — `APP_NAME` in
[`src/constants/app.js`](src/constants/app.js). Change it there and the wordmark,
page titles, install prompt and toasts all follow; the two build-time copies that
cannot import from it (the PWA manifest in `vite.config.js` and `<title>` in
`index.html`) are flagged with a comment.

React 18 · Vite · JavaScript/JSX · Tailwind CSS · React Router · Lucide · Axios ·
vite-plugin-pwa

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

The app runs at <http://localhost:5173> and expects the API at
`http://localhost:8000/api` (see [Environment](#environment)).

### Scripts

| Script            | What it does                                                |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Vite dev server. The service worker is **off** here.        |
| `npm run build`   | Production build into `dist/`, generates the SW + manifest.  |
| `npm run preview` | Serves `dist/` — use this to test PWA install and offline.   |
| `npm run lint`    | ESLint 9 (flat config).                                     |
| `npm run icons`   | Regenerates `public/icons/*.png` from `scripts/generate-icons.mjs`. |

The service worker is deliberately disabled in dev so hot reloads are never served
from a cache. To exercise the PWA:

```bash
npm run build && npm run preview
```

---

## Environment

Every `VITE_*` value is inlined into the JavaScript bundle at build time and is
therefore **public**. Only non-secret configuration belongs here — never
`FIREAPI_API_KEY`, `BREVO_API_KEY`, `JWT_SECRET`, `APP_PASSWORD` or `MONGODB_URI`.
Those stay in the backend environment.

| Variable                    | Default                     | Purpose                                            |
| --------------------------- | --------------------------- | -------------------------------------------------- |
| `VITE_API_BASE_URL`         | `http://localhost:8000/api` | API base, including `/api`, no trailing slash.      |
| `VITE_CSRF_HEADER_NAME`     | `X-CSRF-Token`              | Must match the backend's `CSRF_HEADER_NAME`.        |
| `VITE_CSRF_COOKIE_NAME`     | `csrf_token`                | Must match the backend's `AUTH_COOKIE_CSRF_NAME`.   |
| `VITE_AUTH_ME_PATH`         | `/auth/me/`                 | Startup authentication check endpoint.              |
| `VITE_EXPIRING_SOON_DAYS`   | `30`                        | Should match the backend's `EXPIRING_SOON_DAYS`.    |
| `VITE_JOB_POLL_INTERVAL_MS` | `2500`                      | Job polling interval.                               |
| `VITE_JOB_POLL_TIMEOUT_MS`  | `300000`                    | Give up following a job after this long.            |

---

## Authentication

There is one application user. No registration, signup, password reset or profile
management — by design.

**No token is ever stored by this app.** The backend issues `access_token` and
`refresh_token` as `HttpOnly` cookies that JavaScript cannot read, and the client
simply sends `withCredentials: true` so the browser attaches them:

```js
axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL, withCredentials: true });
```

Nothing token-shaped touches `localStorage`, `sessionStorage`, IndexedDB or React
state. If the backend is configured with `AUTH_RETURN_TOKENS_IN_BODY=true` it also
echoes `access`/`refresh` in the login response body for curl and scripts;
`src/api/auth.js` strips them before the value can reach a component.

The only thing this app persists locally is the theme preference and the
"dismissed the install prompt" flag — both UI preferences.

### CSRF (double-submit)

Because cookies travel automatically, the backend also sets a *readable*
`csrf_token` cookie whose value must be echoed in the `X-CSRF-Token` header on every
unsafe request. `src/api/client.js` does that in a request interceptor:

- `GET`/`HEAD`/`OPTIONS` → no header;
- `POST`/`PUT`/`PATCH`/`DELETE` → `X-CSRF-Token: <csrf_token cookie>`.

Reading that one cookie is intentional and safe: it is not a credential on its own,
it only proves the request came from our own page. Django's CSRF protection is not
disabled or worked around anywhere.

### Session expiry

A `401` triggers **one** shared `POST /auth/refresh/`; every request that hit the 401
waits on that single in-flight refresh and is then retried once. If the refresh also
fails, the client notifies its `onUnauthorized` subscribers, `AuthContext` drops to
the anonymous state and the router renders `/login`. The auth endpoints themselves
are excluded from the retry, so there is no redirect loop and no `window.location`
juggling.

`ProtectedRoute` is a routing convenience, not a security boundary — the backend
authorises every request independently.

---

## Backend API contract

Mapping between snake_case payloads and the shapes components use lives entirely in
`src/api/`, so a field rename touches one file.

```text
POST   /api/auth/login/            POST   /api/vehicles/fetch/       → 202 + job_id
POST   /api/auth/refresh/          POST   /api/vehicles/{id}/refresh/ → 202 + job_id
POST   /api/auth/logout/           DELETE /api/vehicles/{id}/
GET    /api/auth/me/               GET    /api/jobs/{job_id}/
GET    /api/vehicles/              GET    /api/jobs/?limit=n
GET    /api/vehicles/{id}/         GET    /api/settings/  ·  PUT /api/settings/
GET    /api/reminders/?limit=n     POST   /api/reminders/run/
```

Two details worth knowing:

- **List and detail payloads differ.** `GET /vehicles/` returns flat expiry fields
  and deliberately omits owner, chassis, engine and policy numbers; `GET
  /vehicles/{id}/` nests `insurance`/`pucc` and includes them. Both are mapped to the
  same nested shape so one `<DocumentStatus>` renders either. This is why a vehicle
  card shows no insurer name — the list endpoint does not send one.
- **A failed job is an HTTP 200.** `GET /jobs/{id}/` answers `{success: true, data:
  {status: "failed", error_code: ...}}`, so `unwrap()` returns `data` regardless of
  the `success` flag and the caller inspects `status`.

### Document status

The backend computes `status`, `status_label` and `days_remaining` per document using
the project timezone, and it is the source of truth. `src/utils/status.js` prefers
those values and only falls back to a local calculation when a field is missing.

---

## Background jobs (the important part)

Vehicle lookups hit a slow upstream service, so neither fetch nor refresh is ever
awaited synchronously. The backend answers `202 Accepted` immediately and everything
after that is polling:

```text
POST /api/vehicles/fetch/  ──▶  { job_id, status: "queued" }
                                        │
                        GET /api/jobs/{job_id}/  every ~2.5s
                                        │
              queued ──▶ processing ──▶ completed  ──▶ load the vehicle
                                    └──▶ failed     ──▶ friendly error + Try Again
```

`src/hooks/useJobPolling.js` owns this and guarantees:

- **one loop per job, never two.** The next request is scheduled only after the
  previous one settles — a `setTimeout` chain rather than `setInterval`, which would
  fire again while a slow request was still in flight;
- it stops on `completed`, on `failed`, on a fatal HTTP status (401/403/404), after 5
  consecutive network failures, and on an overall timeout;
- the timer is cleared and late responses ignored on unmount or when `jobId` changes,
  so a callback never fires for a job the UI has moved on from;
- transient network blips are retried rather than failing the job — the Celery worker
  keeps going regardless of what the browser can reach;
- polling slows to half speed after 60s, because a job that slow is not about to
  finish in the next two seconds.

**No invented progress.** The job payload has no percentage, so the UI shows an
indeterminate bar plus a three-step trail driven by the real status. Nothing ever
crawls to a fake 99%.

`useAsyncJob` (same file) wraps "start a job, follow it, then reload" and refuses to
start a second job while one is running. `useVehicleRefresh` builds on it so only one
refresh runs at a time; a click on another vehicle's refresh button meanwhile is
refused with *"A vehicle update is already in progress."* rather than queueing a
duplicate.

Refreshing never clears what is on screen — existing data stays visible until the new
data arrives.

---

## Routes

| Route            | Page                | Notes                                            |
| ---------------- | ------------------- | ------------------------------------------------ |
| `/login`         | Login               | The only public route.                           |
| `/dashboard`     | Dashboard           | Counters + a card per vehicle.                   |
| `/vehicles`      | Vehicles            | Full list with search and status filters.        |
| `/vehicles/:id`  | Vehicle details     | Refresh (async) and delete (confirmed).          |
| `/reminders`     | Reminders           | Upcoming schedule + delivery history.            |
| `/jobs`          | Background jobs     | Recent fetches/refreshes, live while running.    |
| `/settings`      | Settings            | Reminder email and per-document offsets.         |

All routes are lazy-loaded, so a signed-out visitor downloads little more than the
login screen.

### Reminders page

Two different sources, kept deliberately apart:

- **Upcoming** is *derived on the client* from each vehicle's expiry dates and the
  configured offsets, using the same rule as the backend sweep
  (`send date = expiry − offset`, and expired documents are skipped). It has to be
  computed, because the backend only writes a reminder record once the daily sweep
  claims one — there is nothing to read beforehand.
- **History** is the real record from `GET /api/reminders/`, including delivery
  failures.

*Send Due Now* calls `POST /api/reminders/run/`, which **sends email**, so it is
behind a confirmation dialog. It is idempotent — an already-sent reminder is not sent
again.

### Jobs page

Refreshes itself every 5s **only while at least one job is `queued` or `processing`**.
Once everything settles the polling stops, so a parked tab does not hammer the API.

---

## PWA

`vite-plugin-pwa` in `generateSW` mode with `registerType: 'autoUpdate'`.

- **Only the app shell is precached.** Every `/api/` request is explicitly
  `NetworkOnly`, and `navigateFallbackDenylist` keeps API paths away from the SPA
  fallback. Authenticated vehicle and owner data is never written to Cache Storage —
  which matters on a shared device.
- `display: standalone`, theme `#3b2ed4`, with `manifest.webmanifest` generated from
  the config in `vite.config.js`.
- Deep links (`/vehicles/123`) resolve to `index.html` via `navigateFallback`.
- **Install button**: `<InstallButton>` sits in the header on every page (labelled on
  desktop, icon-only on the mobile header), alongside the explanatory card on the
  dashboard. `beforeinstallprompt` is captured and replayed to open the browser's real
  install dialog.
  - Nothing renders at all where installation is impossible or already done — no dead
    button.
  - On **iOS Safari**, which has no programmatic install, the button opens the manual
    *Share → Add to Home Screen* steps instead.
  - The captured event is a one-shot resource, so `usePwaInstall` keeps it in a
    module-level store shared by every consumer: using it in the header clears the
    dashboard card too. Per-instance state would leave a stale button that could no
    longer do anything.
  - "Not Now" hides the card but **not** the button — declining a nag should not take
    the option away.
- Offline: `useOnlineStatus` shows a banner and blocks writes with a toast. Nothing
  ever pretends a request succeeded while offline.

### Icons

Real PNGs are committed under `public/icons/` — the app mark: a white car with a green
check badge on the brand blue (`#3b2ed4`, the same value as `primary-600`, so the
installed icon and the in-app buttons match):

```text
public/icons/icon-192.png          192×192  any
public/icons/icon-512.png          512×512  any
public/icons/maskable-512.png      512×512  maskable (glyph inside the safe zone)
public/icons/apple-touch-icon.png  180×180  opaque, for iOS
```

They are generated, not hand-drawn — `npm run icons` rebuilds them from
`scripts/generate-icons.mjs` (a small pure-Node PNG encoder, no image library). Edit
`BRAND` or the geometry constants at the top and re-run; `public/favicon.svg` and the
`<AppMark>` in `components/layout/Brand.jsx` are the same artwork by hand and should be
kept in step. To use your own images instead, drop files with those names and sizes
into `public/icons/` and skip the script.

The maskable variant deliberately differs: the square icon puts the badge in the
top-right corner, while the maskable one tucks it against the car and re-centres the
group, because Android may crop a maskable icon to a circle and the corner lockup
reads as lopsided under that mask.

---

## Deploying to Vercel

1. **Import** the repository and set the root directory to `frontend/`.
2. Framework preset **Vite** (`vercel.json` already sets build command and output
   directory).
3. Add the environment variable, for Production *and* Preview:

   ```env
   VITE_API_BASE_URL=https://your-backend-domain.com/api
   ```

4. Deploy. `vercel.json` rewrites all non-asset paths to `/index.html`, so
   `/vehicles/123` and `/settings` survive a hard refresh instead of 404ing, while
   `sw.js` and `manifest.webmanifest` are served with `must-revalidate` so an update
   is picked up promptly.

`VITE_*` values are baked in at build time — changing one requires a redeploy, not
just a restart.

---

## Backend configuration for a cross-origin deployment

With the frontend on Vercel and the backend on Render/Railway the two are on
different sites, which changes what the browser will do with cookies. Set on the
backend:

```env
FRONTEND_URL=https://vehicle-reminder.vercel.app
CORS_ALLOWED_ORIGINS=https://vehicle-reminder.vercel.app
CSRF_TRUSTED_ORIGINS=https://vehicle-reminder.vercel.app

# Cross-site cookies must be None + Secure, or the browser drops them.
AUTH_COOKIE_SAMESITE=None
AUTH_COOKIE_SECURE=True

# Do not echo tokens into the login response body for a browser client.
AUTH_RETURN_TOKENS_IN_BODY=False
```

The backend already sets `CORS_ALLOW_CREDENTIALS = True` and allows the CSRF header.

**`SameSite` is the thing that usually breaks.** Locally, `localhost:5173` →
`localhost:8000` is *same-site* (ports are ignored for cookie purposes), so the
default `Lax` works. Between `vercel.app` and `onrender.com` it does not: the cookies
must be `SameSite=None; Secure`, which also means HTTPS on both ends.

Both origins must be HTTPS in production, and `VITE_API_BASE_URL` must point at the
exact backend origin — a redirect between `www` and apex will drop the cookies.

Symptoms and causes:

| Symptom                                     | Cause                                                     |
| ------------------------------------------- | --------------------------------------------------------- |
| Login succeeds, then everything 401s        | Cookies rejected — `SameSite`/`Secure`, or origin mismatch |
| `403 CSRF_FAILED` on writes                 | `X-CSRF-Token` not allowed by CORS, or cookie not readable |
| CORS error in the console                   | Origin missing from `CORS_ALLOWED_ORIGINS`                 |
| Works in dev, fails in production           | `SameSite=Lax` left on for a cross-site deployment         |

Never solve cross-origin auth by moving the JWT into `localStorage`.

---

## Project structure

```text
src/
├── api/              # Axios client + one module per resource. All mapping lives here.
│   ├── client.js     # withCredentials, CSRF header, 401→refresh→retry, unwrap()
│   ├── auth.js  vehicles.js  jobs.js  reminders.js  settings.js
├── components/
│   ├── common/       # Button, Input, Modal, ConfirmDialog, Toast, Skeleton,
│   │                 # EmptyState, ErrorState, Alert, Spinner, ProtectedRoute,
│   │                 # OfflineBanner, InstallPrompt, ThemeToggle, PwaStatus
│   ├── layout/       # AppLayout, Sidebar (+ mobile drawer), MobileHeader,
│   │                 # BottomNavigation, AccountMenu, Brand, navigation.js
│   ├── vehicles/     # VehicleCard, VehicleForm, AddVehicleModal, VehicleDetails,
│   │                 # DocumentCard, DocumentStatus, VehicleFetchProgress, DetailList
│   ├── jobs/         # JobList, JobStatusBadge
│   └── reminders/    # ReminderList (history + upcoming)
├── context/          # AuthContext, ToastContext, ThemeContext
├── hooks/            # useAuth, useToast, useTheme, useJobPolling (+ useAsyncJob),
│                     # useVehicles, useVehicleRefresh, useOnlineStatus, usePwaInstall
├── pages/            # Login, Dashboard, VehiclesPage, VehicleDetailsPage,
│                     # RemindersPage, JobsPage, Settings, NotFound
├── utils/            # date, status, vehicle, reminders, errors, cn
├── App.jsx  main.jsx  pwa.js  index.css
```

### Dates

The API sends date-only values as `YYYY-MM-DD`. `new Date('2027-08-12')` parses as
UTC midnight and renders as **11 Aug** in any timezone behind UTC, so
`src/utils/date.js` splits date-only strings by hand and rebuilds them in local time.
Never pass a bare `YYYY-MM-DD` to the `Date` constructor anywhere in this project —
use `parseApiDate`.

### Errors

`src/utils/errors.js` turns any failure into a safe sentence. Known error codes map to
our own wording; the server message is shown only for codes where it adds real detail
and is known to be user-safe (`INVALID_VEHICLE_NUMBER`, `VEHICLE_ALREADY_EXISTS`).
Everything unrecognised, and every 5xx, falls back to a generic sentence — no raw
messages, stack traces or upstream payloads reach the UI. 400/401/403/404/409/429/
5xx, network failures and timeouts all have wording.

### Toasts

`ToastContext` exposes the actions and the list through **separate** contexts: the
actions object never changes identity, so a `useCallback`/`useEffect` depending on
`useToast()` is not invalidated every time a toast appears. Sharing one context would
make any data loader keyed on it refetch on every toast.

---

## Accessibility

- Semantic landmarks, one `<h1>` per page, a skip link to `#main-content`.
- Every input has a real `<label for>`; hints and errors are wired through
  `aria-describedby`, with `aria-invalid` on failure.
- Icon-only buttons carry an `aria-label` (`aria-label="Refresh UP25AK4922"`).
- Dialogs: `role="dialog" aria-modal`, focus moved in on open, Tab/Shift+Tab trapped,
  Escape to close, focus restored to the trigger, page scroll locked. The delete
  confirmation focuses **Cancel**, so a stray Enter cannot delete a vehicle.
- Status is never colour alone — each state has its own icon and words.
- One consistent `:focus-visible` ring; `prefers-reduced-motion` respected.
- Toasts live in a polite live region and never steal focus.
- Skeletons are `aria-hidden` inside one labelled `role="status"` container, instead
  of announcing a wall of empty boxes.

## Responsive

Mobile-first, verified at 320px with no horizontal scrolling. Below `lg`: sticky
header, navigation drawer and a five-item bottom tab bar (`pb-safe` clears the iOS
home indicator). At `lg` and up: fixed sidebar and a slim top bar. Inputs are 16px on
mobile so iOS Safari does not zoom the viewport on focus.

## Theme

Light and dark, `darkMode: 'class'`. Follows the system setting by default; the
toggle cycles light → dark → system and the choice is the only preference persisted.

---

## What was verified

`npm install`, `npm run build` and `npm run lint` all run clean. The full flow was
exercised in a browser against a stub implementing this contract: login (including a
wrong password), the startup session check, dashboard, add vehicle with real job
polling through `queued → processing → completed`, a failed job mapped to a friendly
message with the number preserved for retry, the 409 "already saved" path with a link
to the existing vehicle, vehicle details, async refresh, delete with confirmation,
reminders (upcoming + history), the live jobs list, the offline banner, and 320px
layout. Request logs confirmed `X-CSRF-Token` is sent on writes only, that cookies
accompany every request, and that `document.cookie` exposes nothing but the CSRF
token — the JWTs stay invisible to JavaScript.

Not yet exercised against the real Django backend end to end (that needs MongoDB,
Redis and a Celery worker running locally); the contract was read from the backend
source rather than assumed.
