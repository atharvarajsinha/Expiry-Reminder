import { useContext } from 'react';

import { AuthContext } from '../context/AuthContext.jsx';

/**
 * `const { isAuthenticated, loading, login, logout } = useAuth();`
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
