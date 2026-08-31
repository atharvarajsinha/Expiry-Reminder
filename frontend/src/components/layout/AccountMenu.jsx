import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LogOut, MoreVertical, User } from 'lucide-react';

import { ThemeToggle } from '../common/ThemeToggle.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { cn } from '../../utils/cn.js';

/**
 * The account dropdown: who is signed in, the theme control and Sign out.
 *
 * Keyboard and screen-reader behaviour: the trigger is a real button with
 * `aria-expanded` / `aria-haspopup`, Escape closes and returns focus, and a
 * click outside dismisses it.
 *
 * `variant="compact"` renders the mobile header's overflow button.
 */
export function AccountMenu({ variant = 'default' }) {
  const { username, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = `account-menu-${useId()}`;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onSignOut = async () => {
    setIsSigningOut(true);
    try {
      // AuthProvider clears state either way, and the router then shows /login.
      await logout();
    } finally {
      setIsSigningOut(false);
      setOpen(false);
    }
  };

  const compact = variant === 'compact';

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? 'Account menu' : undefined}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl text-sm font-medium transition-colors',
          'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
          compact ? 'h-10 w-10 justify-center' : 'h-10 px-2.5',
        )}
      >
        {compact ? (
          <MoreVertical aria-hidden="true" className="h-5 w-5" />
        ) : (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
              <User aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="max-w-[10rem] truncate">{username || 'Account'}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')}
            />
          </>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            'absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl bg-white shadow-lg',
            'ring-1 ring-slate-200 animate-slide-up',
            'dark:bg-slate-800 dark:ring-slate-700',
          )}
        >
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-400">Signed in as</p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-white">
              {username || 'Application user'}
            </p>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-slate-600 dark:text-slate-300">Theme</span>
            <ThemeToggle />
          </div>

          <div className="border-t border-slate-200 p-1.5 dark:border-slate-700">
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={isSigningOut}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium',
                'text-red-600 transition-colors hover:bg-red-50',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:text-red-300 dark:hover:bg-red-500/10',
              )}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
