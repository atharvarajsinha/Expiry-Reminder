import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { AccountMenu } from './AccountMenu.jsx';
import { BottomNavigation } from './BottomNavigation.jsx';
import { MobileHeader } from './MobileHeader.jsx';
import { MobileNavDrawer, Sidebar } from './Sidebar.jsx';
import { pageTitleFor } from './navigation.js';
import { InstallButton } from '../common/InstallButton.jsx';
import { OfflineBanner } from '../common/OfflineBanner.jsx';
import { APP_NAME } from '../../constants/app.js';

/**
 * The authenticated application frame.
 *
 * Desktop (lg+): fixed sidebar plus a slim top bar with the account menu.
 * Below lg: sticky header with a navigation drawer, and a bottom tab bar.
 */
export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Navigating always closes the drawer, including via the browser's back button.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.title = `${pageTitleFor(pathname)} - ${APP_NAME}`;
  }, [pathname]);

  return (
    <div className="min-h-full">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Sidebar />
      <MobileNavDrawer open={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <MobileHeader onOpenMenu={() => setIsMenuOpen(true)} />

        {/* Desktop top bar. */}
        <header className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 backdrop-blur lg:flex dark:border-slate-800 dark:bg-slate-900/95">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {pageTitleFor(pathname)}
          </p>
          <div className="flex items-center gap-3">
            {/* Renders nothing once installed, or where install is impossible. */}
            <InstallButton size="sm" />
            <AccountMenu />
          </div>
        </header>

        <OfflineBanner />

        <main
          id="main-content"
          className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-12"
        >
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>

        <BottomNavigation />
      </div>
    </div>
  );
}
