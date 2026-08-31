import { BellRing, Car, LayoutDashboard, ListChecks, Settings } from 'lucide-react';

/**
 * The single source of truth for navigation: the sidebar, the mobile drawer and
 * the bottom bar all render from this list, so they can never drift apart.
 */
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vehicles', label: 'Vehicles', icon: Car },
  { to: '/reminders', label: 'Reminders', icon: BellRing },
  { to: '/jobs', label: 'Jobs', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Document/page title for a pathname. */
export function pageTitleFor(pathname) {
  if (pathname.startsWith('/vehicles/')) return 'Vehicle Details';
  const match = NAV_ITEMS.find((item) => pathname.startsWith(item.to));
  return match ? match.label : 'Home';
}
