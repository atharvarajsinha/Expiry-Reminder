import { cn } from '../../utils/cn.js';
import { APP_NAME } from '../../constants/app.js';

/**
 * The wordmark: the app icon's calendar-and-check mark next to the name, so
 * the browser tab, the home-screen icon and the in-app header all read as one
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
      <g fill="#fff">
        <rect x="18.6" y="12.9" width="3.6" height="9.4" rx="1.8" />
        <rect x="41.8" y="12.9" width="3.6" height="9.4" rx="1.8" />
      </g>
      <path
        d="M13.6 24.5a4.5 4.5 0 0 1 4.5-4.5h27.8a4.5 4.5 0 0 1 4.5 4.5v25.6a4.5 4.5 0 0 1-4.5 4.5H18.1a4.5 4.5 0 0 1-4.5-4.5Zm4.8 8.6v16.4a1.3 1.3 0 0 0 1.3 1.3h24.6a1.3 1.3 0 0 0 1.3-1.3V33.1Z"
        fill="#fff"
        fillRule="evenodd"
      />
      <g fill="#fff">
        <rect x="21.6" y="37.4" width="5.6" height="2.6" rx="1.3" />
        <rect x="29.2" y="37.4" width="5.6" height="2.6" rx="1.3" />
        <rect x="36.8" y="37.4" width="5.6" height="2.6" rx="1.3" />
        <rect x="21.6" y="43.8" width="5.6" height="2.6" rx="1.3" />
        <rect x="29.2" y="43.8" width="5.6" height="2.6" rx="1.3" />
        <rect x="36.8" y="43.8" width="5.6" height="2.6" rx="1.3" />
      </g>
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
