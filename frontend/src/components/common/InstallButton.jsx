import { useState } from 'react';
import { Download, Plus, Share } from 'lucide-react';

import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';
import { usePwaInstall } from '../../hooks/usePwaInstall.js';
import { useToast } from '../../hooks/useToast.js';
import { APP_NAME } from '../../constants/app.js';

/**
 * "Install app" - available from every page while installation is possible.
 *
 * On Chrome/Edge this replays the captured `beforeinstallprompt` event, which
 * opens the browser's real install dialog. On iOS Safari, where no such API
 * exists, it opens the manual Share -> Add to Home Screen steps rather than a
 * button that would silently do nothing.
 *
 * Renders nothing once the app is installed, or in a browser that cannot
 * install it - there is no point showing a button that leads nowhere.
 */
export function InstallButton({ variant = 'secondary', size = 'md', iconOnly = false }) {
  const { canInstall, needsManualInstall, isInstallable, install } = usePwaInstall();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const toast = useToast();

  if (!isInstallable) return null;

  const onClick = async () => {
    if (needsManualInstall && !canInstall) {
      setIsHelpOpen(true);
      return;
    }

    setIsInstalling(true);
    try {
      const accepted = await install();
      if (accepted) toast.success(`${APP_NAME} is being installed.`);
    } catch {
      // The user closing the dialog is not an error worth reporting.
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={Download}
        iconOnly={iconOnly}
        loading={isInstalling}
        onClick={onClick}
        aria-label={iconOnly ? `Install ${APP_NAME}` : undefined}
        title={`Install ${APP_NAME}`}
      >
        Install
      </Button>

      <Modal
        open={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title={`Install ${APP_NAME}`}
        description="Safari installs apps from the Share menu."
        size="sm"
        footer={
          <Button fullWidth onClick={() => setIsHelpOpen(false)}>
            Got it
          </Button>
        }
      >
        <ol className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
              1
            </span>
            <span className="pt-1">
              Tap the <Share aria-hidden="true" className="mx-1 inline h-4 w-4 align-text-bottom" />
              <strong className="font-medium text-slate-900 dark:text-white">Share</strong>{' '}
              button in the Safari toolbar.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
              2
            </span>
            <span className="pt-1">
              Scroll down and choose{' '}
              <Plus aria-hidden="true" className="mx-1 inline h-4 w-4 align-text-bottom" />
              <strong className="font-medium text-slate-900 dark:text-white">
                Add to Home Screen
              </strong>
              .
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
              3
            </span>
            <span className="pt-1">
              Tap <strong className="font-medium text-slate-900 dark:text-white">Add</strong>.
              {' '}
              {APP_NAME} then opens in its own window, like any other app.
            </span>
          </li>
        </ol>
      </Modal>
    </>
  );
}
