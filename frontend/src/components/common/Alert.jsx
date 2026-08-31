import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import { cn } from '../../utils/cn.js';

const VARIANTS = {
  error: {
    icon: XCircle,
    wrapper:
      'bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/20',
    icon_class: 'text-red-600 dark:text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    wrapper:
      'bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20',
    icon_class: 'text-amber-600 dark:text-amber-400',
  },
  success: {
    icon: CheckCircle2,
    wrapper:
      'bg-emerald-50 text-emerald-900 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20',
    icon_class: 'text-emerald-600 dark:text-emerald-400',
  },
  info: {
    icon: Info,
    wrapper:
      'bg-primary-50 text-primary-900 ring-primary-600/20 dark:bg-primary-500/10 dark:text-primary-200 dark:ring-primary-400/20',
    icon_class: 'text-primary-600 dark:text-primary-400',
  },
};

/**
 * An inline message block - used for form-level errors and short notices.
 *
 * Errors and warnings are announced assertively because they usually appear in
 * response to something the user just did.
 */
export function Alert({ variant = 'info', title, children, className, action }) {
  const config = VARIANTS[variant] || VARIANTS.info;
  const Icon = config.icon;
  const assertive = variant === 'error' || variant === 'warning';

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 rounded-xl p-3.5 text-sm ring-1 ring-inset',
        config.wrapper,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', config.icon_class)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
    </div>
  );
}
