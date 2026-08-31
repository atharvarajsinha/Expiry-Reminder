import { forwardRef } from 'react';

import { cn } from '../../utils/cn.js';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-300 dark:disabled:bg-primary-800/60',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 dark:disabled:bg-red-900/60',
  'danger-outline':
    'text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 active:bg-red-100 dark:text-red-300 dark:ring-red-500/30 dark:hover:bg-red-500/10',
};

const SIZES = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-base',
};

// Square variants, sized to stay a comfortable touch target on mobile.
const ICON_SIZES = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
};

/**
 * The one button in the app.
 *
 * - `loading` disables the button and swaps the leading icon for a spinner, so
 *   a submit can never be fired twice.
 * - `iconOnly` buttons must be given an `aria-label` by the caller.
 * - `as={Link}` renders a router link that looks identical.
 */
export const Button = forwardRef(function Button(
  {
    as: Component = 'button',
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconOnly = false,
    loading = false,
    disabled = false,
    fullWidth = false,
    className,
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <Component
      ref={ref}
      // `type` only means something on a real button element.
      {...(Component === 'button' ? { type: props.type || 'button' } : {})}
      {...props}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-disabled={Component === 'button' ? undefined : isDisabled || undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-xl font-medium',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-70',
        iconOnly ? ICON_SIZES[size] || ICON_SIZES.md : SIZES[size] || SIZES.md,
        VARIANTS[variant] || VARIANTS.primary,
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 'md' : 'sm'} />
      ) : Icon ? (
        <Icon aria-hidden="true" className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
      ) : null}
      {iconOnly ? null : children}
    </Component>
  );
});
