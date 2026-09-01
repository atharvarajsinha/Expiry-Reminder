import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/common/ProtectedRoute.jsx';
import { PwaStatus } from './components/common/PwaStatus.jsx';
import { FullPageSpinner } from './components/common/Spinner.jsx';
import { ToastViewport } from './components/common/Toast.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

/**
 * Routes are code-split: the login page is all a signed-out visitor downloads,
 * and the item detail and settings screens arrive only when visited.
 */
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ItemsPage = lazy(() => import('./pages/ItemsPage.jsx'));
const ItemDetailsPage = lazy(() => import('./pages/ItemDetailsPage.jsx'));
const RemindersPage = lazy(() => import('./pages/RemindersPage.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<FullPageSpinner />}>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />

                {/* Everything else requires a valid session cookie. */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/items" element={<ItemsPage />} />
                    <Route path="/items/:id" element={<ItemDetailsPage />} />
                    <Route path="/reminders" element={<RemindersPage />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Route>

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>

          <ToastViewport />
          <PwaStatus />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
