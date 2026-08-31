import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth.js';
import { FullPageSpinner } from './Spinner.jsx';

/**
 * Gate for the authenticated routes.
 *
 * While the startup `GET /auth/me/` is in flight nothing is rendered but a
 * spinner - redirecting during the check would bounce a signed-in user to the
 * login screen on every reload.
 *
 * This is a routing convenience, not a security boundary: the backend
 * authorises every request on its own, so a bypass here would reveal nothing.
 *
 * Used as a layout route, so it renders `<Outlet />` when no children are given.
 */
export function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageSpinner label="Checking your session" />;
  }

  if (!isAuthenticated) {
    // `state.from` lets the login page send the user back where they were.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children ?? <Outlet />;
}
