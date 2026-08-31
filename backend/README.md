# Vehicle Document Reminder — Backend

A small, production-ready backend for a **personal** vehicle document reminder app.
It pulls RC/insurance/PUC data from FireAPI, stores it in MongoDB, and emails you
through Brevo before your insurance or PUC expires.

* Python 3.12+ · Django 5 · Django REST Framework
* MongoDB (Atlas compatible) — the **only** application database
* Celery worker + Celery Beat, Redis broker
* Brevo transactional email
* JWT authentication for one user, stored in **HttpOnly cookies**
* Gunicorn, Docker, Render/Railway ready

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Project structure](#2-project-structure)
3. [MongoDB documents](#3-mongodb-documents)
4. [Flows](#4-flows)
5. [Local development](#5-local-development)
6. [Environment variables](#6-environment-variables)
7. [API reference](#7-api-reference)
8. [Frontend integration (cookies + CSRF)](#8-frontend-integration-cookies--csrf)
9. [Tests](#9-tests)
10. [Docker](#10-docker)
11. [Deploying to Render](#11-deploying-to-render)
12. [Deploying to Railway](#12-deploying-to-railway)
13. [Security notes](#13-security-notes)
14. [Command cheat sheet](#14-command-cheat-sheet)

---

## 1. Architecture

Simple and monolithic — one Django project, three processes.

```
                       ┌──────────────────────┐
  React frontend  ───▶ │  Django + DRF (web)  │ ──▶ MongoDB Atlas
   (cookies)           │  gunicorn            │ ──▶ Redis (queue)
                       └──────────┬───────────┘
                                  │ enqueue
                       ┌──────────▼───────────┐
                       │  Celery worker       │ ──▶ FireAPI  ──▶ MongoDB
                       └──────────────────────┘ ──▶ Brevo
                       ┌──────────────────────┐
                       │  Celery Beat 09:00   │ ──▶ daily_reminder_check
                       └──────────────────────┘
```

Key decisions:

* **No Django ORM.** `DATABASES = {}`, no migrations, no SQLite file, and
  `django.contrib.auth` / `sessions` / `admin` are not installed. MongoDB is
  reached with `pymongo` through a thin service layer (`core/mongo.py` plus
  `*/services.py`). This avoids the reliability problems of MongoDB-on-Django-ORM
  adapters.
* **Nothing slow happens in a request.** FireAPI calls only ever run inside a
  Celery task; the API creates a job and returns `202 Accepted`.
* **Reminders are idempotent** thanks to a unique compound index on the
  reminders collection — running the daily task twice can never send a
  duplicate email.
* **One user, no user table.** Credentials come from `APP_USERNAME` /
  `APP_PASSWORD` and are never stored in MongoDB.

## 2. Project structure

```text
backend/
├── manage.py
├── requirements.txt          # runtime dependencies
├── requirements-dev.txt      # + test dependencies
├── Dockerfile
├── entrypoint.sh             # web | worker | beat role selector
├── docker-compose.yml        # local mongo + redis + 3 app processes
├── render.yaml               # Render blueprint (web + worker + beat + redis)
├── railway.json              # Railway service definition
├── pytest.ini
├── pytest_bootstrap.py       # test env (loaded before Django settings)
├── conftest.py               # shared fixtures (mongomock, auth client, ...)
├── .env.example
├── .gitignore
├── README.md
│
├── config/                   # Django project
│   ├── settings.py           # all configuration, env driven
│   ├── urls.py
│   ├── celery.py             # Celery app + Beat schedule
│   ├── wsgi.py
│   └── asgi.py
│
├── core/                     # shared building blocks
│   ├── mongo.py              # client, collections, indexes, ping
│   ├── dates.py              # parsing, storage conversion, expiry status
│   ├── validators.py         # vehicle number normalisation/validation
│   ├── errors.py             # ErrorCode + ApiError
│   ├── exception_handler.py  # consistent JSON error envelope
│   ├── responses.py          # success()/failure() helpers
│   ├── middleware.py         # security headers + request log
│   └── logging.py            # secret scrubbing log filter
│
├── authentication/           # login/refresh/logout/me
│   ├── jwt_service.py        # token issue/verify, credential check
│   ├── cookies.py            # HttpOnly cookie storage + CSRF helpers
│   ├── authentication.py     # DRF CookieJWTAuthentication
│   ├── serializers.py · views.py · urls.py
│
├── vehicles/
│   ├── fireapi.py            # FireAPI HTTP client + error mapping
│   ├── normalizers.py        # rc_* -> application fields, refresh merge
│   ├── services.py           # MongoDB access + API serialisation
│   ├── tasks.py              # fetch_vehicle_details Celery task
│   ├── serializers.py · views.py · urls.py · apps.py
│
├── jobs/                     # job records + polling endpoint
│   ├── services.py · views.py · urls.py
│
├── reminders/
│   ├── services.py           # due calculation, claim/dedupe, daily sweep
│   ├── email_service.py      # Brevo API integration
│   ├── tasks.py              # daily_reminder_check (Celery Beat)
│   ├── views.py · urls.py
│   └── templates/emails/reminder.html · reminder.txt
│
├── appsettings/              # GET/PUT /api/settings/
│   ├── services.py · serializers.py · views.py · urls.py
│
├── health/                   # public GET /api/health/
│   └── views.py · urls.py
│
└── tests/
    ├── test_auth.py · test_vehicles.py · test_jobs.py
    ├── test_reminders.py · test_settings_api.py
    ├── test_core.py · test_health.py
```

## 3. MongoDB documents

Database: `MONGODB_DATABASE` (default `vehicle_reminder`). Four collections.

### `vehicles` — unique index on `vehicle_no`

```json
{
  "_id": "ObjectId(...)",
  "vehicle_no": "UP25AK4922",
  "registration_date": "2010-12-14T00:00:00Z",
  "insurance": {
    "company": "National Insurance Company Ltd",
    "policy_no": "26020131266730212340",
    "expires_on": "2027-08-12T00:00:00Z"
  },
  "vehicle_category": "2W",
  "vehicle_class": null,
  "chassis_no": "JC47E0133748",
  "engine_no": "ME4JC472LA8086146",
  "cubic_capacity": 50.0,
  "maker": "HONDA",
  "model": "CB TWISTER",
  "owner_name": "ROHIT SRIVASTAVA",
  "father_name": null,
  "fuel": "PETROL",
  "wheelbase": null,
  "seat_capacity": 2,
  "pucc": {
    "certificate_no": "UP02500590046455",
    "expires_on": "2027-02-22T00:00:00Z"
  },
  "registered_at": "UP25, RTO",
  "fitness_upto": null,
  "tax_upto": null,
  "created_at": "2026-08-31T09:00:00Z",
  "updated_at": "2026-08-31T09:00:00Z",
  "last_fetched_at": "2026-08-31T09:00:00Z"
}
```

Dates are stored as real BSON datetimes (midnight UTC), never as the assorted
FireAPI string formats (`14/12/2010`, `2027-08-12`, `30-Aug-2026` …).

### `jobs` — unique index on `job_id`

```json
{
  "job_id": "8f14e45fceea167a5a36dedd4bea2543",
  "job_type": "fetch_vehicle",       // or "refresh_vehicle"
  "vehicle_no": "UP25AK4922",
  "vehicle_id": "652f...",           // set when completed
  "status": "queued",                // queued | processing | completed | failed
  "error": null,                     // user-safe message
  "error_code": null,                // e.g. VEHICLE_API_TIMEOUT
  "created_at": "...", "started_at": null, "completed_at": null
}
```

No API keys, headers or credentials are ever written to a job.

### `reminders` — unique index on `(vehicle_id, document_type, expiry_date, reminder_type)`

```json
{
  "vehicle_id": "652f...",
  "document_type": "insurance",      // insurance | pucc
  "expiry_date": "2027-08-12T00:00:00Z",
  "reminder_type": "7_days",         // 7_days | 1_day | expiry_day
  "scheduled_for": "2027-08-05T00:00:00Z",
  "sent": true,
  "sent_at": "2027-08-05T03:30:00Z",
  "attempts": 1,
  "last_error": null,
  "message_id": "<brevo-message-id>",
  "created_at": "..."
}
```

### `settings` — single document `_id: "app_settings"`

```json
{
  "_id": "app_settings",
  "reminder_email": "example@gmail.com",
  "reminders": { "insurance": [7, 1, 0], "pucc": [7, 1, 0] },
  "updated_at": "..."
}
```

## 4. Flows

### Background vehicle fetch

```
POST /api/vehicles/fetch/  {"vehicle_no": "up25 ak 4922"}
   → normalise + validate ("UP25AK4922")
   → reject with 409 if it already exists
   → create job (queued) → queue Celery task → 202 {job_id}
        ↓ worker
   mark processing → FireAPI GET → validate → normalise (rc_* → app fields)
   → insert/update MongoDB → mark completed (or failed with an error code)
        ↓ frontend
   poll GET /api/jobs/{job_id}/ until completed | failed
```

Refresh is the same task with a `vehicle_id`: on failure the stored document is
left completely untouched, the job is marked `failed`, and nothing is nulled out.
The upstream response is merged field by field, so a value that disappears
upstream never erases the value you already have.

### Reminders

```
Celery Beat 09:00 Asia/Kolkata → daily_reminder_check
  → load settings (recipient + offsets)
  → every vehicle with an insurance/PUC expiry date
  → days_remaining = expiry − today   (project timezone)
  → if days_remaining is exactly one of [7, 1, 0]
       → claim the reminder row (unique index = no duplicates)
       → already sent?  skip and log
       → send via Brevo → mark sent
```

Because the match is `days_remaining == offset` and negative values are skipped,
an already-expired document never re-sends the expiry-day email.

### Authentication

```
POST /api/auth/login/ {username, password}    ← compared to APP_USERNAME/APP_PASSWORD
  → HS256 access token  (60 min)  → HttpOnly cookie access_token
  → HS256 refresh token (14 days) → HttpOnly cookie refresh_token
  → csrf value embedded in the token AND set as a readable csrf_token cookie

every request  → cookie (or Authorization: Bearer)
unsafe methods → X-CSRF-Token header must match the token's csrf claim
POST /api/auth/refresh/ → rotates both tokens
POST /api/auth/logout/  → clears the cookies
```

### Endpoints at a glance

| Method | URL | Auth |
|---|---|---|
| POST | `/api/auth/login/` | public |
| POST | `/api/auth/refresh/` | refresh cookie/body |
| POST | `/api/auth/logout/` | public |
| GET | `/api/auth/me/` | JWT |
| GET | `/api/vehicles/` | JWT |
| POST | `/api/vehicles/fetch/` | JWT |
| GET | `/api/vehicles/{id}/` | JWT |
| POST | `/api/vehicles/{id}/refresh/` | JWT |
| DELETE | `/api/vehicles/{id}/` | JWT |
| GET | `/api/jobs/` | JWT |
| GET | `/api/jobs/{job_id}/` | JWT |
| GET | `/api/reminders/` | JWT |
| POST | `/api/reminders/run/` | JWT |
| GET | `/api/settings/` | JWT |
| PUT | `/api/settings/` | JWT |
| GET | `/api/health/` | **public** |

## 5. Local development

### 1–4. Clone, virtualenv, dependencies, `.env`

**Windows (PowerShell)**

```powershell
git clone <your-repo> ; cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

**Linux / macOS**

```bash
git clone <your-repo> && cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Then edit `.env`: set `APP_PASSWORD`, `SECRET_KEY`, `JWT_SECRET_KEY`,
`MONGODB_URI`, `FIREAPI_API_KEY`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`,
`REMINDER_EMAIL`. For local work also set `DEBUG=True` and
`AUTH_COOKIE_SECURE=False` (cookies with `Secure` are dropped over plain HTTP).

Generate secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### 5. MongoDB

Use MongoDB Atlas (paste the `mongodb+srv://…` URI into `MONGODB_URI`) or run it
locally:

```bash
docker run -d --name mongo -p 27017:27017 mongo:7
```

### 6. Redis

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

On Windows without Docker, use Redis under WSL2 or Memurai.

### 7. Django

There are **no migrations to run** — MongoDB is the only database and the
indexes are created automatically on startup.

```bash
python manage.py check
python manage.py runserver 8000
```

### 8. Celery worker

```bash
celery -A config worker -l info
```

On Windows the prefork pool is unsupported — use:

```powershell
celery -A config worker -l info --pool=solo
```

### 9. Celery Beat

```bash
celery -A config beat -l info
```

Verify everything is wired up:

```bash
curl "http://localhost:8000/api/health/?workers=1"
```

## 6. Environment variables

See [`.env.example`](.env.example) for the full annotated list. The essentials:

| Variable | Meaning |
|---|---|
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` | standard Django settings |
| `APP_USERNAME`, `APP_PASSWORD` | the only login credentials; never stored in MongoDB |
| `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`, `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | token signing and lifetimes |
| `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`, `AUTH_COOKIE_DOMAIN` | cookie storage behaviour |
| `CSRF_PROTECTION_ENABLED`, `CSRF_HEADER_NAME` | double-submit CSRF for cookie auth |
| `MONGODB_URI`, `MONGODB_DATABASE` | MongoDB/Atlas connection |
| `REDIS_URL` | Celery broker + result backend + cache |
| `FIREAPI_URL`, `FIREAPI_API_KEY`, `FIREAPI_API_KEY_HEADER`, `FIREAPI_API_KEY_PREFIX`, `FIREAPI_QUERY_PARAM`, `FIREAPI_TIMEOUT` | vehicle provider; **header name and prefix are configurable** because the provider may rename them |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | transactional email |
| `REMINDER_EMAIL`, `REMINDER_OFFSETS_*`, `REMINDER_CHECK_HOUR/MINUTE` | reminder defaults and schedule |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | CORS for the browser frontend |
| `TIME_ZONE` | date maths and Beat schedule (default `Asia/Kolkata`) |

If your FireAPI key travels in a plain custom header instead of `Authorization`,
set `FIREAPI_API_KEY_HEADER=x-api-key` and leave `FIREAPI_API_KEY_PREFIX` empty.

## 7. API reference

Every response uses one envelope:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "VEHICLE_API_TIMEOUT", "message": "…" } }
```

(`/api/health/` is the deliberate exception — it returns a flat object so uptime
monitors can read it directly.)

Common error codes: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`,
`AUTHENTICATION_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `CSRF_FAILED`,
`INVALID_VEHICLE_NUMBER`, `VEHICLE_ALREADY_EXISTS`, `VEHICLE_NOT_FOUND`,
`JOB_NOT_FOUND`, `VEHICLE_API_TIMEOUT`, `VEHICLE_API_UNAVAILABLE`,
`VEHICLE_API_RATE_LIMITED`, `VEHICLE_API_INVALID_RESPONSE`,
`VEHICLE_NOT_FOUND_UPSTREAM`, `EMAIL_SEND_FAILED`, `QUEUE_UNAVAILABLE`,
`DATABASE_UNAVAILABLE`,
`RATE_LIMITED`, `INTERNAL_ERROR`.

The curl examples below use a cookie jar, exactly like the browser frontend.

---

### POST `/api/auth/login/`

**Authentication:** public · **Throttle:** 10/min

Request

```json
{ "username": "admin", "password": "change-this-password" }
```

Response `200`

```json
{
  "success": true,
  "data": {
    "token_type": "Bearer",
    "expires_in": 3600,
    "csrf_token": "…",
    "username": "admin",
    "access": "eyJhbGciOi…",
    "refresh": "eyJhbGciOi…"
  }
}
```

Sets three cookies: `access_token` (HttpOnly), `refresh_token` (HttpOnly),
`csrf_token` (readable). Set `AUTH_RETURN_TOKENS_IN_BODY=False` to run
cookie-only and drop `access`/`refresh` from the body.

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`,
`503 AUTH_NOT_CONFIGURED` (no `APP_PASSWORD` set).

```bash
curl -i -c cookies.txt -X POST http://localhost:8000/api/auth/login/ -H "Content-Type: application/json" -d '{"username":"admin","password":"change-this-password"}'
```

---

### POST `/api/auth/refresh/`

**Authentication:** refresh cookie (or `{"refresh": "…"}` in the body)

Response `200` — same shape as login; both tokens are rotated.
Errors: `401 AUTHENTICATION_REQUIRED` (no token), `401 TOKEN_EXPIRED`, `401 TOKEN_INVALID`.

```bash
curl -b cookies.txt -c cookies.txt -X POST http://localhost:8000/api/auth/refresh/ -H "Content-Type: application/json" -d '{}'
```

---

### POST `/api/auth/logout/`

Clears the three cookies. Always `200`.

```bash
curl -b cookies.txt -c cookies.txt -X POST http://localhost:8000/api/auth/logout/
```

---

### GET `/api/auth/me/`

**Authentication:** JWT → `200 {"success":true,"data":{"username":"admin","authenticated":true}}`,
otherwise `401`.

---

### GET `/api/vehicles/`

**Authentication:** JWT. Summary only — owner name, father name, chassis,
engine and policy numbers are **not** included.

```json
{
  "success": true,
  "data": [
    {
      "id": "652f…",
      "vehicle_no": "UP25AK4922",
      "maker": "HONDA",
      "model": "CB TWISTER",
      "vehicle_category": "2W",
      "insurance_expires_on": "2027-08-12",
      "insurance_status": "valid",
      "insurance_days_remaining": 346,
      "pucc_expires_on": "2027-02-22",
      "pucc_status": "expiring_soon",
      "pucc_days_remaining": 175,
      "overall_status": "expiring_soon",
      "last_fetched_at": "2026-08-31T09:00:00Z",
      "updated_at": "2026-08-31T09:00:00Z"
    }
  ]
}
```

Statuses: `valid`, `expiring_soon` (within `EXPIRING_SOON_DAYS`, default 30),
`expires_today`, `expired`, `unknown` (no date on record).

```bash
curl -b cookies.txt http://localhost:8000/api/vehicles/
```

---

### POST `/api/vehicles/fetch/`

**Authentication:** JWT · **Throttle:** 20/hour · **Asynchronous**

Request

```json
{ "vehicle_no": "up25 ak 4922" }
```

Response `202`

```json
{
  "success": true,
  "data": {
    "job_id": "8f14e45fceea167a5a36dedd4bea2543",
    "vehicle_no": "UP25AK4922",
    "status": "queued",
    "poll_url": "/api/jobs/8f14e45fceea167a5a36dedd4bea2543/"
  }
}
```

Errors: `400 INVALID_VEHICLE_NUMBER`, `401`, `403 CSRF_FAILED`,
`409 VEHICLE_ALREADY_EXISTS` (the error `details` carry `vehicle_id` and
`refresh_url`), `429 RATE_LIMITED`, `503 QUEUE_UNAVAILABLE` (broker down).

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/vehicles/fetch/ -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -d '{"vehicle_no":"UP25AK4922"}'
```

---

### GET `/api/jobs/{job_id}/`

**Authentication:** JWT. Poll this until `completed` or `failed`.

```json
{ "success": true, "data": { "job_id": "abc123", "status": "processing", "vehicle_no": "UP25AK4922", "error": null } }
{ "success": true, "data": { "job_id": "abc123", "status": "completed", "vehicle_no": "UP25AK4922", "vehicle_id": "652f…" } }
{ "success": true, "data": { "job_id": "abc123", "status": "failed", "vehicle_no": "UP25AK4922",
                             "error": "The vehicle information service did not respond in time.",
                             "error_code": "VEHICLE_API_TIMEOUT" } }
```

Errors: `401`, `404 JOB_NOT_FOUND`.
`GET /api/jobs/?limit=25` lists recent jobs.

```bash
curl -b cookies.txt http://localhost:8000/api/jobs/8f14e45fceea167a5a36dedd4bea2543/
```

---

### GET `/api/vehicles/{vehicle_id}/`

**Authentication:** JWT. Full authorised detail.

```json
{
  "success": true,
  "data": {
    "id": "652f…",
    "vehicle_no": "UP25AK4922",
    "registration_date": "2010-12-14",
    "insurance": {
      "company": "National Insurance Company Ltd",
      "policy_no": "26020131266730212340",
      "expires_on": "2027-08-12",
      "status": "valid", "status_label": "Valid", "days_remaining": 346
    },
    "pucc": {
      "certificate_no": "UP02500590046455",
      "expires_on": "2027-02-22",
      "status": "expiring_soon", "status_label": "Expiring Soon", "days_remaining": 175
    },
    "vehicle_category": "2W", "chassis_no": "JC47E0133748", "engine_no": "ME4JC472LA8086146",
    "cubic_capacity": 50.0, "maker": "HONDA", "model": "CB TWISTER",
    "owner_name": "ROHIT SRIVASTAVA", "father_name": null,
    "fuel": "PETROL", "wheelbase": null, "seat_capacity": 2,
    "overall_status": "expiring_soon",
    "created_at": "…", "updated_at": "…", "last_fetched_at": "…"
  }
}
```

Errors: `401`, `404 VEHICLE_NOT_FOUND`.

---

### POST `/api/vehicles/{vehicle_id}/refresh/`

**Authentication:** JWT · **Throttle:** 30/hour · **Asynchronous**

Body is ignored. Response `202` with `job_id`, `vehicle_id` and `poll_url`.
The existing data stays readable throughout, and a failed refresh keeps it
unchanged.

Errors: `401`, `403 CSRF_FAILED`, `404 VEHICLE_NOT_FOUND`, `429`, `503`.

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/vehicles/652f.../refresh/ -H "X-CSRF-Token: $CSRF"
```

---

### DELETE `/api/vehicles/{vehicle_id}/`

**Authentication:** JWT. Deletes the vehicle **and** its reminder history.

```json
{ "success": true, "data": { "deleted": true, "id": "652f…" } }
```

Errors: `401`, `403 CSRF_FAILED`, `404 VEHICLE_NOT_FOUND`.

```bash
curl -b cookies.txt -X DELETE http://localhost:8000/api/vehicles/652f.../ -H "X-CSRF-Token: $CSRF"
```

---

### GET `/api/settings/` · PUT `/api/settings/`

**Authentication:** JWT. No secrets are stored or returned here.

```json
{
  "success": true,
  "data": {
    "reminder_email": "example@gmail.com",
    "reminders": { "insurance": [7, 1, 0], "pucc": [7, 1, 0] },
    "updated_at": "2026-08-31T09:00:00Z"
  }
}
```

`PUT` accepts either or both keys; offsets must be integers in `0…365`.
Errors: `400 VALIDATION_ERROR`, `401`, `403 CSRF_FAILED`.

```bash
curl -b cookies.txt -X PUT http://localhost:8000/api/settings/ -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -d '{"reminder_email":"me@example.com","reminders":{"insurance":[30,7,1,0],"pucc":[7,1,0]}}'
```

---

### GET `/api/reminders/` · POST `/api/reminders/run/`

**Authentication:** JWT. History of sent/failed reminders
(`?limit=`, `?vehicle_id=`), and a manual trigger of the daily check
(`202`, still idempotent).

---

### GET `/api/health/`

**Authentication:** public · no throttling.

```json
{ "status": "healthy", "database": "connected", "timestamp": "2026-08-31T09:00:00Z", "timezone": "Asia/Kolkata" }
```

`503` when MongoDB is unreachable:

```json
{ "status": "unhealthy", "database": "disconnected", "timestamp": "…", "timezone": "Asia/Kolkata" }
```

Add `?workers=1` to include broker/worker/scheduler status.

```bash
curl -i http://localhost:8000/api/health/
```

## 8. Frontend integration (cookies + CSRF)

Tokens live in **HttpOnly cookies**, so JavaScript cannot read (or leak) them.
Two rules for the frontend:

1. Send cookies on every request — `fetch(..., { credentials: "include" })`
   or `axios.defaults.withCredentials = true`.
2. On unsafe methods (`POST`, `PUT`, `DELETE`), copy the readable `csrf_token`
   cookie into the `X-CSRF-Token` header.

```js
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL, withCredentials: true });

const readCookie = (name) =>
  document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1];

api.interceptors.request.use((config) => {
  if (!["get", "head", "options"].includes(config.method)) {
    config.headers["X-CSRF-Token"] = decodeURIComponent(readCookie("csrf_token") ?? "");
  }
  return config;
});

// On 401, call POST /api/auth/refresh/ once and retry.
```

Polling after a fetch:

```js
const { data } = await api.post("/api/vehicles/fetch/", { vehicle_no });
let job;
do {
  await new Promise((r) => setTimeout(r, 2000));
  job = (await api.get(`/api/jobs/${data.data.job_id}/`)).data.data;
} while (job.status === "queued" || job.status === "processing");
```

Cross-site deployment (frontend and API on different domains) needs
`AUTH_COOKIE_SAMESITE=None`, `AUTH_COOKIE_SECURE=True` (so HTTPS on both sides)
and the frontend origin listed in `CORS_ALLOWED_ORIGINS`.

## 9. Tests

FireAPI and Brevo are always mocked; MongoDB runs in-memory through `mongomock`.
No test makes a real network call.

```bash
pip install -r requirements-dev.txt
pytest                      # 119 tests
pytest tests/test_reminders.py -v
```

Covered: valid/invalid login, protected endpoints with and without a JWT, CSRF
enforcement, token refresh/rotation, vehicle number normalisation and
validation, duplicate vehicles, FireAPI success/timeout/connection
error/429/404/invalid-JSON/malformed payload, job creation and every status
transition, successful refresh, failed refresh preserving old data, refresh never
nulling values, 7-day/1-day/expiry-day reminders, no duplicate emails, expired
documents not re-sending, retry after a failed send, Brevo payload/subject
construction, settings validation, list vs detail data exposure, and health in
both the healthy and unhealthy state.

## 10. Docker

One image, three roles selected by the container command.

```bash
docker build -t vehicle-reminder-backend .

docker run --rm -p 8000:8000 --env-file .env vehicle-reminder-backend web
docker run --rm            --env-file .env vehicle-reminder-backend worker
docker run --rm            --env-file .env vehicle-reminder-backend beat
```

Full local stack (MongoDB + Redis + all three processes):

```bash
docker compose up --build
```

The image runs as a non-root user and has a `HEALTHCHECK` hitting `/api/health/`.

## 11. Deploying to Render

MongoDB comes from **MongoDB Atlas** (Render has no managed MongoDB). Add
`0.0.0.0/0` — or Render's static outbound IPs — to the Atlas network access list.

**Recommended: three services from one repository, plus one Key Value (Redis) instance.**

1. **Environment group** — create `vehicle-reminder-shared` in the dashboard and
   add every variable from `.env.example` (`MONGODB_URI`, `APP_USERNAME`,
   `APP_PASSWORD`, `JWT_SECRET_KEY`, `SECRET_KEY`, `FIREAPI_*`, `BREVO_*`,
   `REMINDER_EMAIL`, `TIME_ZONE`, `CORS_ALLOWED_ORIGINS`, …). Attach it to all
   three services so they never drift apart.
2. **Key Value instance** — `vehicle-reminder-redis`; copy its internal
   connection string into `REDIS_URL` in the group.
3. **Web service** — Docker runtime, command `./entrypoint.sh web`,
   health check path `/api/health/`.
4. **Background worker** — Docker runtime, command `./entrypoint.sh worker`.
5. **Background worker** — Docker runtime, command `./entrypoint.sh beat`.

`render.yaml` in this repository declares exactly that; push it and use
*New → Blueprint*. Then set:

```
DEBUG=False
ALLOWED_HOSTS=your-api.onrender.com        # RENDER_EXTERNAL_HOSTNAME is added automatically
CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com
FRONTEND_URL=https://your-frontend.onrender.com
AUTH_COOKIE_SECURE=True
AUTH_COOKIE_SAMESITE=None                  # only if frontend and API are on different domains
```

Render sets `PORT`; `entrypoint.sh` already binds to it. Do **not** enable
`SECURE_SSL_REDIRECT` (Render terminates TLS in front of the app).

Free-tier note: free web services sleep, and Celery Beat must stay awake to send
reminders — run the worker and beat on a paid instance type, or keep them on the
smallest paid plan while the web service stays free.

## 12. Deploying to Railway

Railway can run all three processes from the same repository as separate
services, and it does offer managed Redis. MongoDB Atlas is still recommended.

1. **New Project → Deploy from GitHub repo** (root = `backend/`). Railway
   detects the `Dockerfile`; `railway.json` sets the start command and health
   check for the web service.
2. **Add → Database → Redis.** Reference it from every service as
   `REDIS_URL=${{Redis.REDIS_URL}}`.
3. **Add two more services from the same repo** and override their start
   commands in *Settings → Deploy → Custom Start Command*:
   * worker → `./entrypoint.sh worker`
   * beat → `./entrypoint.sh beat`
4. **Shared variables** — define the secrets once at project level
   (*Variables → Shared Variables*) and reference them in each service, e.g.
   `MONGODB_URI=${{shared.MONGODB_URI}}`.
5. Generate a public domain for the web service only, then set
   `ALLOWED_HOSTS` (or rely on `RAILWAY_PUBLIC_DOMAIN`, which is picked up
   automatically), `CORS_ALLOWED_ORIGINS` and `FRONTEND_URL`.

The worker and beat services need no public domain and no health check —
disable it for them.

## 13. Security notes

* **Secrets** — everything sensitive comes from the environment. `.env` is
  git-ignored; only `.env.example` is committed. Nothing is hardcoded.
* **Never exposed to the frontend** — the FireAPI key, the Brevo key, the JWT
  secret, the app password and the MongoDB URI are never present in any API
  response. FireAPI is called from Django/Celery only.
* **Logging** — job/reminder lifecycle, FireAPI status codes and reminder
  outcomes are logged; API keys, tokens, passwords and `Authorization` headers
  are not. `core/logging.SensitiveDataFilter` scrubs any configured secret value
  that would otherwise reach a log line, and vehicle numbers are masked in
  FireAPI log messages.
* **JWT** — HS256, short-lived access token, rotating refresh token, issuer
  checked, and tokens are invalidated automatically when `APP_USERNAME` changes.
* **Cookies** — `HttpOnly` + `Secure` + `SameSite`, with double-submit CSRF on
  unsafe methods.
* **Transport/headers** — HSTS (when `DEBUG=False`), `nosniff`, `DENY` framing,
  `same-origin` referrer, restrictive CSP and `Cache-Control: no-store` on API
  responses.
* **Input** — DRF serializer validation, vehicle number normalisation and a
  format check that accepts standard, BH-series and older plate formats.
* **Rate limiting** — login 10/min, fetch 20/hour, refresh 30/hour, reads
  240/min (all configurable).
* **Data minimisation** — the list endpoint omits owner name, father name,
  chassis number, engine number and policy/certificate numbers; they appear only
  in the authenticated detail endpoint.
* **Timeouts** — connect/read timeouts on every outbound HTTP call, plus a
  MongoDB server-selection timeout.
* **Production** — `DEBUG=False`, explicit `ALLOWED_HOSTS`, explicit
  `CORS_ALLOWED_ORIGINS` (no wildcards with credentials).

## 14. Command cheat sheet

```bash
# install
python -m venv .venv && source .venv/bin/activate      # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt                    # production: requirements.txt

# configure
cp .env.example .env                                   # Windows: Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(50))"

# migrations: none — MongoDB only. Indexes are created on startup:
python manage.py check

# infrastructure
docker run -d --name mongo -p 27017:27017 mongo:7
docker run -d --name redis -p 6379:6379 redis:7-alpine

# run (three terminals)
python manage.py runserver 8000
celery -A config worker -l info                        # Windows: add --pool=solo
celery -A config beat -l info

# production web process
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60

# tests
pytest
pytest -v tests/test_reminders.py

# docker
docker build -t vehicle-reminder-backend .
docker run --rm -p 8000:8000 --env-file .env vehicle-reminder-backend web
docker run --rm --env-file .env vehicle-reminder-backend worker
docker run --rm --env-file .env vehicle-reminder-backend beat
docker compose up --build

# smoke test
curl -i http://localhost:8000/api/health/
curl -i -c cookies.txt -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"change-this-password"}'
```
