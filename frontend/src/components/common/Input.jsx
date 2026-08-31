import { forwardRef, useId } from 'react';

import { cn } from '../../utils/cn.js';

/**
 * A labelled text input.
 *
 * The label is always a real `<label for>` (never a placeholder standing in for
 * one), and hint/error text is wired up through `aria-describedby` so screen
 * readers announce it with the field.
 */
export const Input = forwardRef(function Input(
  {
    id,
    label,
    error,
    hint,
    icon: Icon,
    rightSlot,
    className,
    containerClassName,
    labelHidden = false,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id || `input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className={cn(
            'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300',
            labelHidden && 'sr-only',
          )}
        >
          {label}
        </label>
      ) : null}

      <div className="relative">
        {Icon ? (
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
        ) : null}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'block h-11 w-full rounded-xl border bg-white text-slate-900 shadow-sm',
            'placeholder:text-slate-400',
            // 16px on mobile stops iOS Safari zooming the viewport on focus.
            'text-base sm:text-sm',
            'transition-colors',
            'dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
            'dark:disabled:bg-slate-800/60',
            Icon ? 'pl-9' : 'pl-3.5',
            rightSlot ? 'pr-12' : 'pr-3.5',
            error
              ? 'border-red-400 focus:border-red-500 dark:border-red-500/60'
              : 'border-slate-300 focus:border-primary-500 dark:border-slate-700',
            className,
          )}
          {...props}
        />

        {rightSlot ? (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{rightSlot}</div>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
