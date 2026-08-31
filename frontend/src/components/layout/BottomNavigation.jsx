import { NavLink } from 'react-router-dom';

import { NAV_ITEMS } from './navigation.js';
import { cn } from '../../utils/cn.js';

/**
 * Thumb-reachable tab bar for small screens.
 *
 * `pb-safe` keeps the labels clear of the iOS home indicator; the matching
 * bottom padding on `<main>` stops content hiding underneath.
 */
export function BottomNavigation() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
    >
      <ul className="flex items-stretch">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  // 11px labels so five items still fit a 320px screen.
                  'flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-[0.6875rem] font-medium transition-colors',
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    aria-hidden="true"
                    className={cn('h-5 w-5 shrink-0', isActive && 'scale-110 transition-transform')}
                  />
                  <span className="w-full truncate text-center">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
