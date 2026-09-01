import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, MailCheck } from 'lucide-react';

import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { cn } from '../../utils/cn.js';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { offsetLabel, reminderTypeLabel, sendDistanceLabel } from '../../utils/reminders.js';

/** The name of the date a reminder is about, e.g. "Insurance", "Card expiry". */
function ExpiryChip({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
      <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
      {label || 'Expiry'}
    </span>
  );
}

/**
 * One entry of the sent/attempted history.
 *
 * `sent: false` with attempts > 0 means delivery was tried and failed - worth
 * surfacing, because the user would otherwise be waiting for an email that is
 * never coming. The next sweep retries it.
 */
function ReminderHistoryItem({ reminder }) {
  const failed = !reminder.sent && reminder.attempts > 0;

  return (
    <li className="surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            reminder.sent
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
              : failed
                ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {reminder.sent ? (
            <MailCheck aria-hidden="true" className="h-4 w-4" />
          ) : failed ? (
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          ) : (
            <CalendarClock aria-hidden="true" className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reminder.itemName || 'Deleted item'}
            </p>
            <ExpiryChip label={reminder.expiryLabel} />
          </div>

          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            {reminderTypeLabel(reminder.reminderType)}
            <span className="text-slate-400 dark:text-slate-500">
              {' · expiry '}
              <time dateTime={reminder.expiryDate || undefined}>
                {formatDate(reminder.expiryDate)}
              </time>
            </span>
          </p>

          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {reminder.sent
              ? `Sent ${formatDateTime(reminder.sentAt)}`
              : failed
                ? `Not sent after ${reminder.attempts} attempt${reminder.attempts === 1 ? '' : 's'}`
                : `Due ${formatDate(reminder.scheduledFor)}`}
          </p>

          {failed ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Delivery failed. The next reminder check will try again.
            </p>
          ) : null}
        </div>

        {reminder.itemId && reminder.itemName ? (
          <Link
            to={`/items/${reminder.itemId}`}
            className="shrink-0 self-center rounded-lg px-2 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
          >
            Open
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function ReminderHistoryList({ reminders }) {
  return (
    <ul className="grid gap-3">
      {reminders.map((reminder) => (
        <ReminderHistoryItem
          key={`${reminder.itemId}-${reminder.expiryKey}-${reminder.reminderType}-${reminder.expiryDate}`}
          reminder={reminder}
        />
      ))}
    </ul>
  );
}

/** One upcoming send, as the server derived it from expiry date + offset. */
function UpcomingItem({ entry }) {
  const isToday = entry.daysUntilSend <= 0;

  return (
    <li className="surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isToday
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
              : 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400',
          )}
        >
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {entry.itemName}
            </p>
            <ExpiryChip label={entry.expiryLabel} />
          </div>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {entry.categoryLabel}
            {entry.identifier ? (
              <span className="font-mono tracking-wide"> · {entry.identifier}</span>
            ) : null}
          </p>

          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            <time
              dateTime={entry.sendOn}
              className="font-medium text-slate-900 dark:text-white"
            >
              {formatDate(entry.sendOn)}
            </time>{' '}
            <span className="text-slate-400 dark:text-slate-500">
              · {offsetLabel(entry.offset)}
            </span>
          </p>

          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {sendDistanceLabel(entry.daysUntilSend)}
            {' · expiry '}
            {formatDate(entry.expiresOn)}
          </p>
        </div>

        <Link
          to={`/items/${entry.itemId}`}
          className="shrink-0 self-center rounded-lg px-2 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
        >
          Open
        </Link>
      </div>
    </li>
  );
}

export function UpcomingReminderList({ entries }) {
  return (
    <ul className="grid gap-3">
      {entries.map((entry) => (
        <UpcomingItem key={entry.key} entry={entry} />
      ))}
    </ul>
  );
}

export function ReminderListSkeleton({ count = 3 }) {
  return (
    <SkeletonGroup label="Loading reminders" className="grid gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface flex items-start gap-3 p-4">
          <Skeleton className="h-9 w-9" rounded="rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
