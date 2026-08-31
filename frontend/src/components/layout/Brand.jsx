import { cn } from '../../utils/cn.js';
import { APP_NAME } from '../../constants/app.js';

/**
 * The wordmark: the app icon's car-and-check mark next to the name, so the
 * browser tab, the home-screen icon and the in-app header all read as one
 * product. The mark is inline SVG rather than a Lucide glyph because it has to
 * match `public/favicon.svg` and the generated PNG icons exactly.
 */
function AppMark({ className }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.9 34.9 26.2 26.8h11.6l6.3 8.1" strokeWidth="4.5" />
        <circle cx="22.2" cy="44.4" r="3.3" strokeWidth="2.5" />
        <circle cx="41.2" cy="44.4" r="3.3" strokeWidth="2.5" />
      </g>
      <rect x="13.9" y="34.3" width="36" height="7.5" rx="2.9" fill="#fff" />
      <circle cx="52.2" cy="11.8" r="8.4" fill="#22c55e" stroke="#fff" strokeWidth="2.4" />
      <path
        d="m48.9 12 2.4 2.4 4.5-5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand({ size = 'md', showName = true, className }) {
  const compact = size === 'sm';

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <AppMark
        className={cn(
          'rounded-xl text-primary-600 shadow-sm',
          compact ? 'h-8 w-8' : 'h-9 w-9',
        )}
      />

      {showName ? (
        <span
          className={cn(
            'truncate font-semibold tracking-tight text-slate-900 dark:text-white',
            compact ? 'text-[0.95rem]' : 'text-base',
          )}
        >
          {APP_NAME}
        </span>
      ) : null}
    </span>
  );
}
