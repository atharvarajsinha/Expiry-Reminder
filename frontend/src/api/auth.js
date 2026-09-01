/**
 * Authentication calls.
 *
 * The session tokens themselves are handled entirely by cookies. If the
 * backend is configured with AUTH_RETURN_TOKENS_IN_BODY=true it also echoes
 * `access` and `refresh` in the login response body - for curl and scripts. A
 * browser must ignore them, so `sanitizeSession` drops them before the value
 * can reach any component, state or storage.
 *
 * The `csrf_token` in that body is the one field we do keep. It goes to the
 * API client rather than into React: writes need it in a header, and the
 * cookie it also arrives in is unreadable whenever the app and the API sit on
 * different domains. See the CSRF note in `client.js`.
 */
import { clearCsrfToken, client, setCsrfToken, unwrap } from './client.js';

/** Configurable so the startup check can point at another endpoint. */
const AUTH_ME_PATH = import.meta.env.VITE_AUTH_ME_PATH || '/auth/me/';

function sanitizeSession(data) {
  return {
    username: data?.username ?? null,
    // Deliberately not returned: access and refresh. The browser holds those
    // in HttpOnly cookies and no component has any business with them. The
    // CSRF value goes to the client, never into React state.
  };
}

/** `POST /api/auth/login/` - the backend sets the auth cookies on success. */
export async function login({ username, password }) {
  const response = await client.post('/auth/login/', { username, password });
  const data = unwrap(response);
  setCsrfToken(data?.csrf_token);
  return sanitizeSession(data);
}

/** `POST /api/auth/logout/` - clears the auth cookies server-side. */
export async function logout() {
  try {
    await client.post('/auth/logout/', {});
  } finally {
    // The value is dead either way; keeping it would only let a later request
    // present a token for a session that no longer exists.
    clearCsrfToken();
  }
  return true;
}

/**
 * `GET /api/auth/me/` - the startup check. Resolves with the session, or
 * rejects with a 401 when there is no valid session.
 */
export async function getAuthStatus() {
  const data = unwrap(await client.get(AUTH_ME_PATH));
  const authenticated = data?.authenticated !== false;

  // A reload loses the in-memory CSRF value while the session cookies survive,
  // so the startup check is where it gets primed again. Without this, the
  // first write after a refresh would fail with CSRF_FAILED.
  if (authenticated) setCsrfToken(data?.csrf_token);
  else clearCsrfToken();

  return { authenticated, username: data?.username ?? null };
}
