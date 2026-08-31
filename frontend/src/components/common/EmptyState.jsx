import { cn } from '../../utils/cn.js';

/**
 * "Nothing here yet" - always paired with the action that fixes it.
 */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'surface flex flex-col items-center px-6 py-12 text-center sm:py-16',
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
          <Icon aria-hidden="true" className="h-7 w-7" />
        </div>
      ) : null}

      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>

      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
