# Expiry Reminders — Frontend

An installable PWA for tracking anything with an expiry date — vehicle papers,
passports, debit and credit cards, insurance policies, subscriptions, warranties —
built against the Django REST + MongoDB backend in `../backend`.

Everything is entered by hand: there is no external lookup, and no background job
to wait on anywhere in this app.

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
`BREVO_API_KEY`, `JWT_SECRET_KEY`, `APP_PASSWORD`, `CRON_TOKEN` or `MONGODB_URI`.
Those stay in the backend environment.

| Variable                    | Default                     | Purpose                                            |
| --------------------------- | --------------------------- | -------------------------------------------------- |
| `VITE_API_BASE_URL`         | `http://localhost:8000/api` | API base, including `/api`, no trailing slash.      |
| `VITE_CSRF_HEADER_NAME`     | `X-CSRF-Token`              | Must match the backend's `CSRF_HEADER_NAME`.        |
| `VITE_CSRF_COOKIE_NAME`     | `csrf_token`                | Must match the backend's `AUTH_COOKIE_CSRF_NAME`.   |
| `VITE_AUTH_ME_PATH`         | `/auth/me/`                 | Startup authentication check endpoint.              |
| `VITE_EXPIRING_SOON_DAYS`   | `30`                        | Fallback only; should match the backend's `EXPIRING_SOON_DAYS`. |

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

Because cookies travel automatically, the backend requires a CSRF value echoed in
the `X-CSRF-Token` header on every unsafe request. `src/api/client.js` does that in
a request interceptor:

- `GET`/`HEAD`/`OPTIONS` → no header;
- `POST`/`PUT`/`PATCH`/`DELETE` → `X-CSRF-Token: <value>`.

**The value is held in memory, not read from the cookie.** The backend does also
set a readable `csrf_token` cookie, and the original version of this client read
it — which works locally, because `localhost:5173` and `localhost:8000` share a
hostname and cookies ignore ports. It breaks the moment the app and the API are on
different domains: the cookie is third-party, `document.cookie` cannot see it, and
every write fails with `CSRF_FAILED` while reads keep working.

So the value comes from the response body of `/auth/login/`, `/auth/refresh/` and
`/auth/me/`. That last one matters: a reload loses the in-memory copy while the
session cookies survive, so the startup check re-primes it. The cookie remains a
fallback for same-host setups.

Holding this one value in JavaScript is safe and is the point of the pattern — it
is not a credential, it only proves the request came from our own page. The session
tokens stay in HttpOnly cookies where JavaScript cannot reach them.

A `403 CSRF_FAILED` is treated like a `401`: refresh once, retry once. That covers
any residual desync without the user seeing anything.

### Session expiry

A `401` — or a `403 CSRF_FAILED` — triggers **one** shared `POST /auth/refresh/`;
every request that hit it waits on that single in-flight refresh and is then
retried once. If the refresh also
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
POST   /api/auth/login/          GET    /api/items/categories/
POST   /api/auth/refresh/        GET    /api/items/            POST   /api/items/
POST   /api/auth/logout/         GET    /api/items/{id}/       PUT    /api/items/{id}/
GET    /api/auth/me/             DELETE /api/items/{id}/
GET    /api/settings/            GET    /api/reminders/upcoming/
PUT    /api/settings/            GET    /api/reminders/        POST   /api/reminders/run/
```

Three details worth knowing:

- **List and detail payloads are identical.** Unlike the vehicle-lookup API this
  replaced, there is nothing to withhold from a list: every field was typed in by the
  user, and cards only ever hold four digits. One shape means a card and the detail
  screen can never disagree about an item's status.
- **The category catalogue comes from the server.** Field labels ("Registration
  number" vs "Last 4 digits"), expiry presets and the card flag are all fetched from
  `/api/items/categories/`. Adding a category is a backend-only change; the only
  thing the client owns is the icon component, mapped from an icon *name* in
  `src/utils/categories.js` with a fallback so an unknown category still renders.
- **`POST /reminders/run/` is synchronous.** It answers with the finished summary
  (`{sent, skipped_already_sent, failed, …}`), so the toast can say exactly what
  happened rather than "queued".

### Expiry status

The backend computes `status`, `status_label` and `days_remaining` for every date
using the project timezone, and it is the source of truth. `src/utils/status.js`
prefers those values and only falls back to a local calculation when a field is
missing.

---

## No background jobs (the important part)

This app has no polling loop, no job list and no progress bar, because there is
nothing asynchronous to follow. Adding an item is one request that returns the stored
record; deleting is one request. The reminder check is one request that returns its
own summary.

That is worth stating explicitly because the previous version of this frontend was
built around a `useJobPolling` hook, a jobs page and a three-step progress trail for
a slow upstream lookup. All of it is gone along with the lookup.

Two consequences show up in the UI:

- **The upcoming schedule is fetched, not computed.** It used to be derived on the
  client, because the backend only wrote a reminder row once its daily sweep claimed
  one and there was nothing to read beforehand. The backend now derives the schedule
  on request, so `src/utils/reminders.js` is down to wording helpers and the client
  can no longer drift from what the sweep will actually do.
- **The card number field is deliberately not capped at 4 characters.** A
  `maxLength={4}` would let the browser silently keep the *first* four digits of a
  pasted card number — the wrong four, with no warning. The whole value is allowed
  through so the validator can reject it and explain why, on blur and again on
  submit. The backend refuses it independently.

---

## Routes

| Route          | Page          | Notes                                          |
| -------------- | ------------- | ---------------------------------------------- |
| `/login`       | Login         | The only public route.                         |
| `/dashboard`   | Overview      | Counters, an urgency banner, the first 6 cards.|
| `/items`       | Items         | Full list with search, status and category filters. |
| `/items/:id`   | Item details  | Every date, the reminder history, edit, delete. |
| `/reminders`   | Reminders     | Upcoming schedule + delivery history.          |
| `/settings`    | Settings      | Reminder email and per-category offsets.       |

All routes are lazy-loaded, so a signed-out visitor downloads little more than the
login screen.

### The add/edit form

One `<ItemFormModal>` serves both, because the fields, the validation and the
category rules are identical — only the endpoint and whether the category is still
changeable differ. Splitting them would mean two places to keep the card rule right.

Picking a category rebuilds the form: labels change, and the expiry rows are seeded
with that category's defaults so the user starts from "fill in the dates" rather than
a bare form. The identifier is cleared on a category change, since a registration
number is not four digits. Presets are offered as buttons that add a correctly
labelled row; "Another date" adds a free-form one, slugged client-side.

### Dashboard counters

The first counter counts items; the other three count **dates**. One vehicle with
insurance, PUC and fitness is one item and three dates. Counting items as "valid"
would hide a lapsed PUC behind a current insurance policy.

### Reminders page

Two different sources, kept deliberately apart:

- **Upcoming** is the schedule from `GET /api/reminders/upcoming/`, derived by the
  backend from every item's dates and the configured offsets. It also reports when
  the daily check last ran.
- **History** is the real record from `GET /api/reminders/`, including delivery
  failures, which are shown rather than hidden — otherwise the user waits for an
  email that is never coming.

*Send Due Now* calls `POST /api/reminders/run/`, which **sends email**, so it is
behind a confirmation dialog. It is idempotent — an already-sent reminder is not sent
again — and the toast reports the returned summary.

When the server has no mail credentials, or no daily trigger is configured, the
page says so plainly — the schedule still being accurate is not the same as
reminders arriving.

---

## PWA

`vite-plugin-pwa` in `generateSW` mode with `registerType: 'autoUpdate'`.

- **Only the app shell is precached.** Every `/api/` request is explicitly
  `NetworkOnly`, and `navigateFallbackDenylist` keeps API paths away from the SPA
  fallback. The user's items — card digits, document numbers — are never written to
  Cache Storage, which matters on a shared device.
- `display: standalone`, theme `#3b2ed4`, with `manifest.webmanifest` generated from
  the config in `vite.config.js`.
- Deep links (`/items/123`) resolve to `index.html` via `navigateFallback`.
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

Real PNGs are committed under `public/icons/` — the app mark: a white calendar page
with a green check badge on the brand blue (`#3b2ed4`, the same value as
`primary-600`, so the installed icon and the in-app buttons match). A calendar rather
than any one kind of item, because the app tracks documents, cards, policies and
vehicle papers alike:

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
top-right corner, while the maskable one tucks it against the calendar and re-centres
the group, because Android may crop a maskable icon to a circle and the corner lockup
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
   `/items/123` and `/settings` survive a hard refresh instead of 404ing, while
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
│   ├── auth.js  items.js  reminders.js  settings.js
├── components/
│   ├── common/       # Button, Input, Modal, ConfirmDialog, Toast, Skeleton,
│   │                 # EmptyState, ErrorState, Alert, Spinner, ProtectedRoute,
│   │                 # DetailList, OfflineBanner, InstallPrompt, ThemeToggle, PwaStatus
│   ├── layout/       # AppLayout, Sidebar (+ mobile drawer), MobileHeader,
│   │                 # BottomNavigation, AccountMenu, Brand, navigation.js
│   ├── items/        # ItemCard, ItemFormModal, ItemSummaryCards, ExpiryStatus
│   └── reminders/    # ReminderList (history + upcoming)
├── context/          # AuthContext, ToastContext, ThemeContext
├── hooks/            # useAuth, useToast, useTheme, useItems,
│                     # useOnlineStatus, usePwaInstall
├── pages/            # Login, Dashboard, ItemsPage, ItemDetailsPage,
│                     # RemindersPage, Settings, NotFound
├── utils/            # date, status, categories, identifier, reminders, errors, cn
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
and is known to be user-safe (`INVALID_VEHICLE_NUMBER`, `ITEM_ALREADY_EXISTS`,
`INVALID_EXPIRY`, and `CARD_NUMBER_REJECTED` — whose server wording explains *why*
only four digits are accepted, which is the entire point of refusing the input).
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
- Icon-only buttons carry an `aria-label` (`aria-label="Edit Honda CB Twister"`).
- Dialogs: `role="dialog" aria-modal`, focus moved in on open, Tab/Shift+Tab trapped,
  Escape to close, focus restored to the trigger, page scroll locked. The delete
  confirmation focuses **Cancel**, so a stray Enter cannot delete an item.
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

`npm install`, `npm run build` and `npm run lint` all run clean.

The full flow was exercised in a browser against the **real Django backend** (run
against an in-process `mongomock` database so no live cluster was touched): login,
the startup session check, the dashboard with its counters and urgency banner, the
items list with search and category filters, adding a credit card through the form,
the item detail screen, the reminders page with the server-derived schedule and the
delivery-failure history, and the settings screen saving per-category offsets and the
upcoming schedule immediately reflecting them. Mobile was checked at 375px, including
the bottom tab bar.

The card guard was verified in the browser specifically: pasting a full 16-digit
number is refused with an explanation, and only a genuine four-digit entry saves.
That check found and fixed a real bug — a `maxLength={4}` on the field had been
silently keeping the first four digits.
