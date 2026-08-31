import { Smartphone } from 'lucide-react';

import { Button } from './Button.jsx';
import { InstallButton } from './InstallButton.jsx';
import { usePwaInstall } from '../../hooks/usePwaInstall.js';
import { APP_NAME } from '../../constants/app.js';

/**
 * The explanatory install card on the dashboard.
 *
 * Shown only while installation is actually possible and the user has not said
 * "Not Now". Dismissing it hides the card but not the header
 * `<InstallButton>` - saying "not now" should not take the option away.
 */
export function InstallPrompt() {
  const { shouldSuggest, needsManualInstall, dismiss } = usePwaInstall();

  if (!shouldSuggest) return null;

  return (
    <div className="surface mb-5 flex items-start gap-3 p-4 sm:items-center">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
        <Smartphone aria-hidden="true" className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Install {APP_NAME}
        </p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {needsManualInstall
            ? 'Add it to your home screen for quick access, straight from Safari.'
            : 'Install this app for quick access from your phone or desktop.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
          <InstallButton variant="primary" size="sm" />
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not Now
          </Button>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not Now
        </Button>
        <InstallButton variant="primary" size="sm" />
      </div>
    </div>
  );
}
