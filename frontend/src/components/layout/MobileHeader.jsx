import { Menu } from 'lucide-react';

import { AccountMenu } from './AccountMenu.jsx';
import { Brand } from './Brand.jsx';
import { Button } from '../common/Button.jsx';
import { InstallButton } from '../common/InstallButton.jsx';

/**
 * Sticky header for small screens: menu on the left, wordmark in the middle,
 * account overflow on the right.
 */
export function MobileHeader({ onOpenMenu }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon={Menu}
        onClick={onOpenMenu}
        aria-label="Open navigation"
      />

      <div className="min-w-0 flex-1">
        <Brand size="sm" />
      </div>

      {/* Icon-only here: the header has no room for a label on a phone. */}
      <InstallButton variant="ghost" size="sm" iconOnly />
      <AccountMenu variant="compact" />
    </header>
  );
}
