# Expiry Reminders — Backend

A single-user Django + MongoDB API that tracks anything with an expiry date —
vehicle papers, passports, debit and credit cards, insurance policies,
subscriptions, warranties — and emails you before each one lapses.

Everything is entered by hand. There is no external data provider, and nothing
is looked up anywhere.

**There is also no broker, no worker and no scheduler.** One web process is the
entire backend. How that works is [§4](#4-how-reminders-happen).

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Project structure](#2-project-structure)
3. [MongoDB documents](#3-mongodb-documents)
4. [How reminders happen](#4-how-reminders-happen)
5. [Local development](#5-local-development)
6. [Environment variables](#6-environment-variables)
7. [API reference](#7-api-reference)
8. [Frontend integration (cookies + CSRF)](#8-frontend-integration-cookies--csrf)
9. [Tests](#9-tests)
10. [Docker](#10-docker)
11. [Deploying](#11-deploying)

---

## 1. Architecture

```
        Browser (React PWA)
               │  cookies + X-CSRF-Token
               ▼
        ┌──────────────────┐
        │  Django + DRF    │──── Brevo API (the one outbound call)
        │  1 web process   │
        └──────────────────┘
               │
               ▼
           MongoDB
```

Deliberate choices, and why:

| Choice | Reason |
| --- | --- |
| **No Django ORM.** `DATABASES` is empty; there are no migrations, no `admin`, no `sessions`. | MongoDB is the only store. Half an ORM pointed at nothing is worse than none. |
| **No Celery, no Redis.** | The only recurring job was "check once a day". A broker, a worker and a scheduler are three more processes to pay for and keep alive for one daily loop — so the loop rides on a request instead ([§4](#4-how-reminders-happen)). |
| **No user table.** One username and password live in the environment; sessions are stateless JWTs. | It is a personal app. A user table would be one row forever. |
| **Card numbers are refused, not truncated.** | Only the last four digits are ever accepted. Trimming a submitted PAN server-side would mean the full number had already crossed the wire and the logs. See `core/validators.py`. |
| **One `items` collection, typed by `category`.** | A passport and a car differ in their labels, not their shape: both are a name, an identifier and a list of dates. Adding a category is one entry in `items/categories.py`. |

---

## 2. Project structure

```
backend/
├── config/            settings, urls, wsgi/asgi   (no celery.py — by design)
├── core/
│   ├── dates.py       parsing, storage conversion, expiry status
│   ├── errors.py      ApiError + the stable error codes
│   ├── middleware.py  security headers, request log, ReminderSweepMiddleware
│   ├── mongo.py       client, collections, indexes
│   ├── responses.py   the {success, data} / {success, error} envelope
│   └── validators.py  plate normalisation, the card-number guard
├── authentication/    login/refresh/logout/me, cookie JWT + double-submit CSRF
├── items/
│   ├── categories.py  the catalogue: labels, expiry presets, card flags
│   ├── services.py    validation, persistence, serialisation
│   └── management/commands/seed_items.py
├── reminders/
│   ├── services.py    the engine: derive, claim, sweep
│   └── email_service.py   Brevo
├── appsettings/       recipient address + per-category offsets
├── health/            the one public endpoint
└── tests/
```

---

## 3. MongoDB documents

### `items`

Indexed on `category`, `(category, identifier_key)`, `created_at`,
`next_expiry_on`.

```json
{
  "category": "vehicle",
  "name": "Honda CB Twister",
  "identifier": "UP25AK4922",
  "identifier_key": "up25ak4922",
  "issuer": "National Insurance Company Ltd",
  "holder": "Rohit",
  "notes": null,
  "expiries": [
    {
      "key": "insurance",
      "label": "Insurance",
      "expires_on": "2027-08-12T00:00:00Z",
      "issued_on": null,
      "reference": "26020131266730212340"
    }
  ],
  "next_expiry_on": "2027-08-12T00:00:00Z",
  "created_at": "...",
  "updated_at": "..."
}
```

- `identifier_key` is the lower-cased, space-stripped identifier. Duplicates are
  detected against it, so `up25 ak 4922` and `UP25AK4922` are the same vehicle.
  It is scoped to the category — a credit card and a debit card may both end
  `4321`.
- `expiries` is sorted soonest-first on save, and `next_expiry_on` denormalises
  the first entry so the sweep and the list query can use an index instead of
  loading everything and sorting in Python.
- Dates are stored as BSON datetimes pinned to **midnight UTC**. All expiry
  arithmetic happens on `date` objects in `TIME_ZONE` (default `Asia/Kolkata`),
  so "7 days before" lands on the right calendar day whatever the server clock
  is set to.

### `reminders` — unique index on `(item_id, expiry_key, expiry_date, reminder_type)`

One row per reminder **claimed for sending**. That unique index is the whole
duplicate-prevention mechanism: the row is written before the email leaves, so a
second sweep on the same day finds it taken and sends nothing.

```json
{
  "item_id": "66f0…",
  "expiry_key": "insurance",
  "expiry_date": "2027-08-12T00:00:00Z",
  "reminder_type": "7_days",
  "scheduled_for": "2027-08-05T00:00:00Z",
  "sent": true,
  "sent_at": "…",
  "attempts": 1,
  "last_error": null,
  "message_id": "<brevo id>"
}
```

A row with `sent: false` and `attempts > 0` is a failed delivery. It is handed
back to the next sweep for a retry rather than being abandoned.

### `settings`

Two documents, both singletons:

- `_id: "app_settings"` — `reminder_email` and `reminders`, a map of
  `category -> [days before expiry]` with a `default` key as the fallback.
- `_id: "sweep_state"` — `last_run_date` and `last_run_at`. This is what makes
  the daily check run exactly once a day ([§4](#4-how-reminders-happen)).

---

## 4. How reminders happen

This is the part that replaced Celery Beat, so it is worth reading properly.

### Derived vs recorded

"What is expiring" and "what is coming" are **never stored**. They are computed
from the items and the configured offsets every time they are asked for
(`GET /api/items/`, `GET /api/reminders/upcoming/`). Nothing can go stale and
there is nothing to keep in sync — the schedule the UI shows is produced by the
same function the sweep uses.

Only a reminder that is actually being sent gets written down.

### The sweep

`reminders.services.run_sweep(today)`:

1. load every item with at least one date;
2. for each date, if `days_remaining` **exactly equals** one of the category's
   offsets, it is due today. An already-expired date (negative days) matches
   nothing, so a lapsed document stays visible in the app but stops emailing;
3. claim the reminder row (unique index — see above);
4. send it; on success mark `sent`, on failure record `last_error` and leave it
   for the next run.

It is idempotent by construction: run it five times a day and one email goes out.

### What triggers it

**`ReminderSweepMiddleware`** (`core/middleware.py`) — the first API request of
each calendar day runs the sweep. Three properties make that safe to hang off a
user's request:

- the day is **claimed atomically** with a `find_one_and_update` on
  `sweep_state`, so exactly one request per day does the work and every other
  request costs one indexed lookup that matches nothing;
- it runs **after the response has been built**, so nothing the user is waiting
  for is blocked behind an email send;
- it **cannot fail a request** — a broken sweep is logged and swallowed, because
  a database hiccup at 9am should not turn the dashboard into a 500.

Health checks, auth routes and preflights are skipped.

**The honest trade-off:** email only goes out on days the app is used. If that
is not good enough, set `CRON_TOKEN` and point any free scheduler at
`POST /api/reminders/run/` with an `X-Cron-Token` header — Render Cron,
cron-job.org, a GitHub Action, a `curl` in your own crontab. Both triggers are
the same idempotent sweep, so a cron ping and a page load on the same morning
still produce one email.

```bash
curl -X POST -H "X-Cron-Token: $CRON_TOKEN" https://your-api/api/reminders/run/
```

Set `REMINDER_SWEEP_ON_REQUEST=False` if you want the cron to be the only
trigger.

---

## 5. Local development

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # Windows
# python3 -m venv .venv && source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
cp .env.example .env      # then fill it in
```

MongoDB, either way:

```bash
docker run -d --name expiry-mongo -p 27017:27017 -v expiry_mongo:/data/db mongo:7
```

…or point `MONGODB_URI` at a free MongoDB Atlas cluster.

Then:

```bash
python manage.py runserver 8000
```

That is the whole backend — there is no second or third process to start.

Some sample data to look at, with dates positioned relative to today so the
reminder screens have something to show:

```bash
python manage.py seed_items
```

`--flush` clears existing items first; `--file` points at your own JSON.

---

## 6. Environment variables

Every value is read from the environment; nothing sensitive is hardcoded. See
`.env.example` for the annotated list.

| Group | Variables |
| --- | --- |
| Django | `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` |
| Auth | `APP_USERNAME`, `APP_PASSWORD`, `JWT_*`, `AUTH_COOKIE_*`, `CSRF_*` |
| MongoDB | `MONGODB_URI`, `MONGODB_DATABASE`, `MONGODB_TIMEOUT_MS` |
| Email | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `REMINDER_EMAIL` |
| Reminders | `REMINDER_OFFSETS`, `REMINDER_OFFSETS_<CATEGORY>`, `EXPIRING_SOON_DAYS`, `REMINDER_SWEEP_ON_REQUEST`, `CRON_TOKEN` |
| CORS | `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` |
| Ops | `TIME_ZONE`, `LOG_LEVEL`, `THROTTLE_*`, `SECURE_SSL_REDIRECT` |

Leave the Brevo variables blank to run the app with in-app reminders only —
the sweep still runs, records its attempts, and nothing else breaks.

`core.logging.SensitiveDataFilter` scrubs the values named in
`SENSITIVE_SETTING_NAMES` out of every log record as a last line of defence.

---

## 7. API reference

Every response uses one envelope:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "…", "message": "…", "details": { } } }
```

`/api/health/` is the only public route; everything else needs a valid JWT
(cookie or `Authorization: Bearer`). `POST /api/reminders/run/` also accepts a
valid `X-Cron-Token` in place of a session.

### Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login/` | `{username, password}` → sets `access_token`, `refresh_token` (HttpOnly) and a readable `csrf_token` |
| POST | `/api/auth/refresh/` | rotates the pair from the refresh cookie |
| POST | `/api/auth/logout/` | clears the cookies |
| GET | `/api/auth/me/` | the current session |

### Items

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/items/categories/` | the catalogue the forms are built from |
| GET | `/api/items/[?category=]` | every item, soonest expiry first |
| POST | `/api/items/` | create → `201` with the stored record |
| GET | `/api/items/{id}/` | the same shape as a list entry |
| PUT | `/api/items/{id}/` | replaces every editable field, expiries included |
| DELETE | `/api/items/{id}/` | also deletes the item's reminder rows |

`POST` / `PUT` body:

```json
{
  "category": "vehicle",
  "name": "Honda CB Twister",
  "identifier": "UP25AK4922",
  "issuer": "National Insurance Company Ltd",
  "holder": "Rohit",
  "notes": null,
  "expiries": [
    { "key": "insurance", "expires_on": "2027-08-12", "reference": "2602…" },
    { "key": "pucc", "expires_on": "2027-02-22" }
  ]
}
```

The response adds a resolved `label`, `status`, `status_label` and
`days_remaining` to every expiry, plus `overall_status` and `next_expiry` for
the item.

`expiries[].key` may be any slug — the category presets are a starting point,
not a whitelist, so "extended cover" on a laptop needs no code change. On a
`PUT`, `category` may be omitted and the stored one is kept.

Notable errors: `INVALID_VEHICLE_NUMBER`, `CARD_NUMBER_REJECTED`,
`INVALID_EXPIRY`, `UNKNOWN_CATEGORY`, `ITEM_ALREADY_EXISTS` (409, with the
clashing `item_id` in `details`), `ITEM_NOT_FOUND`.

### Reminders

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/reminders/upcoming/[?limit=]` | the derived schedule + `sweep` state |
| GET | `/api/reminders/[?limit=&item_id=]` | what was sent or attempted |
| POST | `/api/reminders/run/` | run the sweep now; returns the finished summary |

`run/` answers synchronously with
`{triggered_by, date, items_checked, due, sent, skipped_already_sent, failed}`.
A signed-in caller may pass `{"for_date": "YYYY-MM-DD"}` to test the wiring
without waiting for a real expiry; a cron caller may not.

### Settings and health

| Method | Path | Notes |
| --- | --- | --- |
| GET / PUT | `/api/settings/` | recipient + `reminders` (a `category -> [offsets]` map). The read-only `delivery` block reports whether email and cron are configured and when the sweep last ran — booleans and dates only, never a key. |
| GET | `/api/health/[?sweep=1]` | public; `503` when MongoDB is unreachable |

An empty offset list is a real choice ("never email me about cards") and is
stored as such, not treated as unset.

---

## 8. Frontend integration (cookies + CSRF)

Tokens live in HttpOnly cookies, so JavaScript cannot read them. Because
cookies travel automatically, unsafe requests use the classic double-submit
defence: alongside the HttpOnly pair the backend sets a **readable**
`csrf_token` cookie whose value must come back in the `X-CSRF-Token` header.

Client requirements: `withCredentials: true`, echo the CSRF cookie on
POST/PUT/PATCH/DELETE, and on a `401` call `/api/auth/refresh/` once and retry.

For a cross-site deployment (frontend on Vercel, API on Render):

```bash
AUTH_COOKIE_SECURE=True
AUTH_COOKIE_SAMESITE=None
AUTH_RETURN_TOKENS_IN_BODY=False
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
```

---

## 9. Tests

```bash
pip install pytest pytest-django mongomock
pytest
```

163 tests, no network and no real database — `mongomock` backs the whole suite
via `core.mongo.set_override_db`, and `pytest_bootstrap.py` sets the environment
before Django settings load.

What is actually asserted, beyond the CRUD happy paths:

- **`tests/test_core.py`** — a full card number is *rejected* rather than
  truncated, and the rejection does not echo the number back.
- **`tests/test_items.py`** — nothing is written when a card number is refused;
  duplicate detection is category-scoped and separator-insensitive; a past date
  is accepted and reads as expired.
- **`tests/test_reminders.py`** — reminders fire on exactly the offset days and
  nothing between them; expired dates never re-email; running the sweep twice
  sends one email; a failed send is retried on the next run; one failure does
  not stop the others; a cron caller cannot backdate the sweep.
- **`tests/test_sweep_middleware.py`** — the scheduler replacement: it fires
  once per day off a real request, a sweep that raises does not fail the
  response it is riding on, and health and auth routes do not trigger it.

---

## 10. Docker

```bash
docker compose up --build
```

Two services: MongoDB and the web app. That is all there is to run.

---

## 11. Deploying

`render.yaml` is a working blueprint: one web service, plus an optional daily
cron job that hits `/api/reminders/run/` with `X-Cron-Token`. Drop the cron
service if you are content for email to depend on the app being opened.

MongoDB comes from Atlas — set `MONGODB_URI`. `railway.json` deploys the same
image on Railway.

Checklist for any host:

- [ ] `DEBUG=False`, a real `SECRET_KEY` and `JWT_SECRET_KEY`
- [ ] `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` set to the real domains
- [ ] `AUTH_COOKIE_SECURE=True` (and `SAMESITE=None` if cross-site)
- [ ] `MONGODB_URI` pointing at Atlas, with the host's egress IPs allowed
- [ ] `TIME_ZONE` set to yours, or reminders land on the wrong day
- [ ] `CRON_TOKEN` set if reminders must arrive on days you do not open the app
