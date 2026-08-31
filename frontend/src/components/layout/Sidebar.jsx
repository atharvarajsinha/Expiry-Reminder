import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';

import { Brand } from './Brand.jsx';
import { NAV_ITEMS } from './navigation.js';
import { Button } from '../common/Button.jsx';
import { ThemeToggle } from '../common/ThemeToggle.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { cn } from '../../utils/cn.js';

const linkClasses = ({ isActive }) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  );

/** The navigation links, shared by the sidebar and the mobile drawer. */
function NavList({ onNavigate }) {
  return (
    <nav aria-label="Main navigation" className="space-y-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onNavigate} className={linkClasses}>
          {({ isActive }) => (
            <>
              <Icon
                aria-hidden="true"
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400',
                )}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Sign-out control used at the foot of the sidebar and the drawer. */
function SignOutButton({ onDone }) {
  const { logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const onClick = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      onDone?.();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSigningOut}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        'text-slate-600 hover:bg-red-50 hover:text-red-700',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-300',
      )}
    >
      <LogOut aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-400" />
      {isSigningOut ? 'Signing out...' : 'Logout'}
    </button>
  );
}

/** Fixed sidebar, desktop only (lg and up). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Brand />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <NavList />
      </div>

      <div className="shrink-0 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        <SignOutButton />
      </div>
    </aside>
  );
}

/**
 * Slide-in navigation for small screens, opened from the header's menu button.
 *
 * Escape closes it, a backdrop tap closes it, and focus moves into the panel
 * so keyboard users are not left behind the overlay.
 */
export function MobileNavDrawer({ open, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="relative flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <Brand size="sm" />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={X}
            onClick={onClose}
            aria-label="Close navigation"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList onNavigate={onClose} />
        </div>

        <div className="shrink-0 border-t border-slate-200 px-3 py-3 pb-safe dark:border-slate-800">
          <div className="mb-1 flex items-center justify-between px-3 py-1.5">
            <span className="text-sm text-slate-600 dark:text-slate-300">Theme</span>
            <ThemeToggle />
          </div>
          <SignOutButton onDone={onClose} />
        </div>
      </div>
    </div>
  );
}
