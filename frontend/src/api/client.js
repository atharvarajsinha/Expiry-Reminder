/**
 * The single Axios instance every API module uses.
 *
 * Authentication
 * --------------
 * The backend issues `access_token` and `refresh_token` as HttpOnly cookies.
 * JavaScript cannot read them and this app never tries to: `withCredentials`
 * makes the browser attach them automatically. No token is ever written to
 * localStorage, sessionStorage, IndexedDB or React state.
 *
 * CSRF
 * ----
 * Because cookies travel automatically, the backend uses the classic
 * double-submit defence: alongside the HttpOnly pair it sets a *readable*
 * `csrf_token` cookie whose value must be echoed in the `X-CSRF-Token` header
 * on every unsafe request. That is done in the request interceptor below.
 * Reading this cookie is intentional and safe - it is not a credential on its
 * own, it only proves the request came from our own page.
 *
 * 401 handling
 * ------------
 * A single in-flight `POST /auth/refresh/` is shared by all requests that hit
 * a 401, and each request is retried at most once. If the refresh fails the
 * `unauthorized` subscribers fire, AuthContext drops to the anonymous state
 * and the router shows /login - no `window.location` juggling and no redirect
 * loops.
 */
import axios from 'axios';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
).replace(/\/+$/, '');

const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'csrf_token';
const CSRF_HEADER_NAME = import.meta.env.VITE_CSRF_HEADER_NAME || 'X-CSRF-Token';

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Endpoints that must never trigger the refresh-and-retry dance: the auth
 * endpoints themselves (a 401 there is the answer, not a recoverable state)
 * and the public health check.
 */
const NO_RETRY_PATHS = [
  '/auth/login/',
  '/auth/refresh/',
  '/auth/logout/',
  '/health/',
];

export const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

/** Reads a non-HttpOnly cookie. Only ever used for the CSRF token. */
export function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unauthorized subscribers
// ---------------------------------------------------------------------------
const unauthorizedHandlers = new Set();

/**
 * Registers a callback for "the session is definitively gone".
 * Returns an unsubscribe function.
 */
export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

function emitUnauthorized() {
  for (const handler of unauthorizedHandlers) {
    try {
      handler();
    } catch {
      // A broken subscriber must not break error handling for the others.
    }
  }
}

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------
client.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (UNSAFE_METHODS.has(method)) {
    const token = readCookie(CSRF_COOKIE_NAME);
    if (token) {
      config.headers[CSRF_HEADER_NAME] = token;
    }
  }
  return config;
});

function isNoRetryPath(url) {
  if (!url) return false;
  return NO_RETRY_PATHS.some((path) => url.includes(path));
}

let refreshPromise = null;

function refreshSession() {
  if (!refreshPromise) {
    // The refresh token rides along in its own HttpOnly cookie, so the body
    // stays empty. Rotation also issues a fresh csrf_token cookie.
    refreshPromise = client.post('/auth/refresh/', {}).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    const status = error?.response?.status;

    const recoverable =
      status === 401 && config && !config.__isRetry && !isNoRetryPath(config.url);

    if (!recoverable) {
      // A 401 we cannot recover from means the session is really gone.
      if (status === 401 && !isNoRetryPath(config?.url)) emitUnauthorized();
      return Promise.reject(error);
    }

    config.__isRetry = true;
    try {
      await refreshSession();
    } catch {
      emitUnauthorized();
      return Promise.reject(error);
    }
    return client(config);
  },
);

// ---------------------------------------------------------------------------
// Envelope handling
// ---------------------------------------------------------------------------

/**
 * Unwraps `{ success, data }`.
 *
 * Job polling is the reason this does not branch on `success`: a *failed* job
 * is a successful HTTP response whose payload describes the failure, and the
 * caller needs that `data`. Genuine failures arrive as non-2xx and are handled
 * by the interceptor / `getApiError`.
 */
export function unwrap(response) {
  const payload = response?.data;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload;
}
