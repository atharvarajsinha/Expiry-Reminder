import { cn } from '../../utils/cn.js';

/**
 * Skeleton placeholders.
 *
 * The whole group should be wrapped in one container with
 * `role="status" aria-label="Loading ..."`, and the shapes themselves are
 * `aria-hidden` - otherwise assistive tech reads out a wall of empty boxes.
 */
export function Skeleton({ className, rounded = 'rounded-lg' }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-slate-200/80 dark:bg-slate-700/60',
        rounded,
        className,
      )}
    />
  );
}

export function SkeletonText({ lines = 3, className, lastWidth = 'w-2/3' }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 ? lastWidth : 'w-full')}
        />
      ))}
    </div>
  );
}

/** Wrapper that announces the loading state once for a group of skeletons. */
export function SkeletonGroup({ label = 'Loading', className, children }) {
  return (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  );
}
