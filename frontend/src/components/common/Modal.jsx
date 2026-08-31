import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '../../utils/cn.js';
import { Button } from './Button.jsx';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
};

/**
 * An accessible dialog.
 *
 *  - rendered in a portal on `document.body` so no ancestor `overflow` or
 *    `transform` can clip it;
 *  - `role="dialog" aria-modal` with the heading wired to `aria-labelledby`;
 *  - focus moves in on open, is trapped while open (Tab and Shift+Tab wrap),
 *    and returns to the trigger on close;
 *  - Escape closes it, and so does a backdrop click - both suppressed while
 *    `dismissible` is false, which is how the fetch flow stops the user from
 *    closing the dialog mid-request;
 *  - page scrolling is locked so a mobile sheet cannot be scrolled behind.
 *
 * On small screens it presents as a bottom sheet, and as a centred card from
 * `sm` up.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  initialFocusRef,
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  const generatedId = useId();
  const titleId = `dialog-title-${generatedId}`;
  const descriptionId = `dialog-description-${generatedId}`;

  const requestClose = useCallback(() => {
    if (dismissible) onClose?.();
  }, [dismissible, onClose]);

  // Focus management + scroll lock.
  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Wait for the dialog to be in the DOM before moving focus into it.
    const focusTimer = window.setTimeout(() => {
      const target =
        initialFocusRef?.current ||
        dialogRef.current?.querySelector(FOCUSABLE_SELECTOR) ||
        dialogRef.current;
      target?.focus?.();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, initialFocusRef]);

  // Escape to close, Tab to cycle within the dialog.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, requestClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop. Presentational: the dialog itself owns the semantics. */}
      <div
        aria-hidden="true"
        onClick={requestClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-xl',
          'rounded-t-2xl sm:rounded-2xl',
          'dark:bg-slate-900 dark:ring-1 dark:ring-slate-800',
          'animate-slide-up',
          SIZES[size] || SIZES.md,
        )}
      >
        {title ? (
          <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                {title}
              </h2>
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm text-slate-500 dark:text-slate-400"
                >
                  {description}
                </p>
              ) : null}
            </div>

            {dismissible ? (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={X}
                onClick={requestClose}
                aria-label="Close dialog"
                className="-mr-2 -mt-1 shrink-0"
              />
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <div className="border-t border-slate-200 px-5 py-4 pb-safe dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
