import { BellRing, LayoutDashboard, LayoutGrid, Settings } from 'lucide-react';

/**
 * The single source of truth for navigation: the sidebar, the mobile drawer and
 * the bottom bar all render from this list, so they can never drift apart.
 */
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/items', label: 'Items', icon: LayoutGrid },
  { to: '/reminders', label: 'Reminders', icon: BellRing },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Document/page title for a pathname. */
export function pageTitleFor(pathname) {
  if (pathname.startsWith('/items/')) return 'Item Details';
  const match = NAV_ITEMS.find((item) => pathname.startsWith(item.to));
  return match ? match.label : 'Home';
}
