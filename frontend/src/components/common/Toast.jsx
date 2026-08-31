import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { TOAST_VARIANT, ToastListContext } from '../../context/ToastContext.jsx';
import { useToast } from '../../hooks/useToast.js';
import { cn } from '../../utils/cn.js';

const VARIANTS = {
  [TOAST_VARIANT.SUCCESS]: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    ring: 'ring-emerald-500/20',
  },
  [TOAST_VARIANT.ERROR]: {
    icon: XCircle,
    iconClass: 'text-red-500',
    ring: 'ring-red-500/20',
  },
  [TOAST_VARIANT.WARNING]: {
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
    ring: 'ring-amber-500/20',
  },
  [TOAST_VARIANT.INFO]: {
    icon: Info,
    iconClass: 'text-primary-500',
    ring: 'ring-primary-500/20',
  },
};

/**
 * Renders the toast stack from `ToastContext`.
 *
 * Positioned top-centre on mobile (the bottom edge belongs to the navigation
 * bar) and bottom-right on desktop. The container is a polite live region so
 * new toasts are announced without stealing focus; each toast is dismissible
 * with a labelled button.
 */
export function ToastViewport() {
  const toasts = useContext(ToastListContext);
  const { dismiss } = useToast();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className={cn(
        'pointer-events-none fixed z-[60] flex flex-col gap-2',
        'inset-x-2 top-2 pt-safe',
        'sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:w-96 sm:pt-0',
      )}
    >
      {toasts.map((toast) => {
        const config = VARIANTS[toast.variant] || VARIANTS[TOAST_VARIANT.INFO];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl bg-white p-3.5 shadow-lg',
              'ring-1 animate-toast-in',
              'dark:bg-slate-800',
              config.ring,
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconClass)} />

            <div className="min-w-0 flex-1">
              {toast.title ? (
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {toast.title}
                </p>
              ) : null}
              <p
                className={cn(
                  'break-words text-sm text-slate-700 dark:text-slate-200',
                  toast.title && 'mt-0.5',
                )}
              >
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className={cn(
                '-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors',
                'hover:bg-slate-100 hover:text-slate-600',
                'dark:hover:bg-slate-700 dark:hover:text-slate-200',
              )}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
