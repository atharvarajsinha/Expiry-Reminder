import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react';

import { Alert } from '../components/common/Alert.jsx';
import { Button } from '../components/common/Button.jsx';
import { Input } from '../components/common/Input.jsx';
import { FullPageSpinner } from '../components/common/Spinner.jsx';
import { ThemeToggle } from '../components/common/ThemeToggle.jsx';
import { Brand } from '../components/layout/Brand.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { getApiError, getFieldErrors } from '../utils/errors.js';
import { APP_NAME, APP_TAGLINE } from '../constants/app.js';

/**
 * The only public page.
 *
 * On success the backend sets the HttpOnly cookies; nothing token-shaped is
 * handled here. The password lives in local state only until the request
 * resolves, and is never logged or persisted.
 */
export default function Login() {
  const { isAuthenticated, loading, login } = useAuth();
  const location = useLocation();
  const isOnline = useOnlineStatus();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    document.title = `Sign in - ${APP_NAME}`;
  }, []);

  // Wait for the startup check rather than flashing the form at a signed-in user.
  if (loading) {
    return <FullPageSpinner label="Checking your session" />;
  }

  if (isAuthenticated) {
    const target = location.state?.from?.pathname || '/dashboard';
    return <Navigate to={target} replace />;
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setFieldErrors({});

    if (!username.trim() || !password) {
      setFieldErrors({
        username: username.trim() ? undefined : 'Enter your username.',
        password: password ? undefined : 'Enter your password.',
      });
      return;
    }

    if (!isOnline) {
      setError("You're offline. Reconnect to sign in.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ username: username.trim(), password });
      // Clear the password from state the moment it is no longer needed.
      setPassword('');
      // The redirect happens on the next render via `isAuthenticated`.
    } catch (requestError) {
      const apiError = getApiError(requestError);
      setError(apiError.message);
      setFieldErrors(getFieldErrors(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center sm:pb-24">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <Brand showName={false} />
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {APP_NAME}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in to continue
            </p>
          </div>

          <div className="surface p-5 sm:p-6">
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error ? <Alert variant="error">{error}</Alert> : null}

              <Input
                id="username"
                name="username"
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                error={fieldErrors.username}
                icon={User}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                disabled={isSubmitting}
                required
              />

              <Input
                id="password"
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
                icon={Lock}
                autoComplete="current-password"
                disabled={isSubmitting}
                required
                rightSlot={
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={showPassword ? EyeOff : Eye}
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  />
                }
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                icon={LogIn}
                loading={isSubmitting}
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </div>

          {!isOnline ? (
            <Alert variant="warning" className="mt-4">
              You&apos;re offline. Signing in needs a connection.
            </Alert>
          ) : null}

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            {APP_TAGLINE} &middot; documents, cards and papers, tracked in one place.
          </p>
        </div>
      </main>
    </div>
  );
}
