import { cn } from '../../utils/cn.js';

const NOT_AVAILABLE = 'Not available';

/**
 * A titled card used for each section of the vehicle detail page.
 */
export function SectionCard({ icon: Icon, title, action, children, className }) {
  return (
    <section className={cn('surface p-4 sm:p-5', className)}>
      <div className="mb-4 flex items-center gap-2.5">
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
        ) : null}
        <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Label/value pairs.
 *
 * A real `<dl>` so the pairing is exposed to assistive tech rather than being
 * implied by layout. Missing values are shown as "Not available" instead of
 * being hidden, because "we have no PUC date" is itself information.
 */
export function DetailList({ items, columns = 2, className }) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2',
        className,
      )}
    >
      {items.map(({ label, value, mono, hint }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {label}
          </dt>
          <dd
            className={cn(
              'mt-1 break-words text-sm',
              value === null || value === undefined || value === ''
                ? 'text-slate-400 dark:text-slate-500'
                : 'font-medium text-slate-900 dark:text-white',
              mono && 'font-mono tracking-wide',
            )}
          >
            {value === null || value === undefined || value === ''
              ? NOT_AVAILABLE
              : value}
          </dd>
          {hint ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
