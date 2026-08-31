/**
 * Authentication state.
 *
 * There is deliberately no token here. The browser holds the HttpOnly cookies;
 * this context only tracks *whether* the backend accepted us, which it learns
 * by calling `GET /auth/me/`. The backend is always the source of truth - a
 * user can flip a value in React DevTools and gain nothing, because every
 * request is still authorised server-side.
 */
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import * as authApi from '../api/auth.js';
import { onUnauthorized } from '../api/client.js';

/** checking -> the startup request is in flight; then authenticated|anonymous. */
export const AUTH_STATUS = {
  CHECKING: 'checking',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
};

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.CHECKING);
  const [username, setUsername] = useState(null);

  const markAnonymous = useCallback(() => {
    setStatus(AUTH_STATUS.ANONYMOUS);
    setUsername(null);
  }, []);

  /** Re-runs the startup check; used on mount and after a login. */
  const checkSession = useCallback(async () => {
    try {
      const session = await authApi.getAuthStatus();
      if (session.authenticated) {
        setUsername(session.username);
        setStatus(AUTH_STATUS.AUTHENTICATED);
        return true;
      }
      markAnonymous();
      return false;
    } catch {
      // A 401 here is the normal "not signed in yet" answer, not an incident.
      markAnonymous();
      return false;
    }
  }, [markAnonymous]);

  // The startup check. Runs once; `checkSession` is stable.
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // The API client tells us when a 401 could not be recovered by a refresh.
  useEffect(() => onUnauthorized(markAnonymous), [markAnonymous]);

  const login = useCallback(async (credentials) => {
    const session = await authApi.login(credentials);
    setUsername(session.username);
    setStatus(AUTH_STATUS.AUTHENTICATED);
    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the call fails we drop local state: the user asked to leave.
      markAnonymous();
    }
  }, [markAnonymous]);

  const value = useMemo(
    () => ({
      status,
      username,
      loading: status === AUTH_STATUS.CHECKING,
      isAuthenticated: status === AUTH_STATUS.AUTHENTICATED,
      login,
      logout,
      checkSession,
    }),
    [status, username, login, logout, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
