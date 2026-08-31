/**
 * Authentication calls.
 *
 * The tokens themselves are handled entirely by cookies. If the backend is
 * configured with AUTH_RETURN_TOKENS_IN_BODY=true it also echoes `access` and
 * `refresh` in the login response body - for curl and scripts. A browser must
 * ignore them, so `sanitizeSession` drops them before the value can reach any
 * component, state or storage.
 */
import { client, unwrap } from './client.js';

/** Configurable so the startup check can point at another endpoint. */
const AUTH_ME_PATH = import.meta.env.VITE_AUTH_ME_PATH || '/auth/me/';

function sanitizeSession(data) {
  return {
    username: data?.username ?? null,
    // Deliberately not returned: access, refresh, csrf_token.
    // The browser holds them in cookies; JavaScript has no business with them.
  };
}

/** `POST /api/auth/login/` - the backend sets the auth cookies on success. */
export async function login({ username, password }) {
  const response = await client.post('/auth/login/', { username, password });
  return sanitizeSession(unwrap(response));
}

/** `POST /api/auth/logout/` - clears the auth cookies server-side. */
export async function logout() {
  await client.post('/auth/logout/', {});
  return true;
}

/**
 * `GET /api/auth/me/` - the startup check. Resolves with the session, or
 * rejects with a 401 when there is no valid session.
 */
export async function getAuthStatus() {
  const data = unwrap(await client.get(AUTH_ME_PATH));
  return {
    authenticated: data?.authenticated !== false,
    username: data?.username ?? null,
  };
}
