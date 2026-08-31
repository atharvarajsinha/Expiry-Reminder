import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, MailCheck, ShieldCheck, Wind } from 'lucide-react';

import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { cn } from '../../utils/cn.js';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { documentLabel, offsetLabel, reminderTypeLabel } from '../../utils/reminders.js';

const DOCUMENT_ICONS = {
  insurance: ShieldCheck,
  pucc: Wind,
};

function DocumentChip({ documentType }) {
  const Icon = DOCUMENT_ICONS[documentType] || ShieldCheck;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {documentLabel(documentType)}
    </span>
  );
}

/**
 * One entry of the sent/attempted history.
 *
 * `sent: false` with attempts > 0 means delivery was tried and failed - worth
 * surfacing, because the user would otherwise be waiting for an email that is
 * never coming.
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
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {reminderTypeLabel(reminder.reminderType)}
            </p>
            <DocumentChip documentType={reminder.documentType} />
          </div>

          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Expiry{' '}
            <time dateTime={reminder.expiryDate || undefined} className="font-medium">
              {formatDate(reminder.expiryDate)}
            </time>
          </p>

          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {reminder.sent
              ? `Sent ${formatDateTime(reminder.sentAt)}`
              : failed
                ? `Not sent after ${reminder.attempts} attempt${reminder.attempts === 1 ? '' : 's'}`
                : `Due ${formatDate(reminder.scheduledFor)}`}
          </p>

          {failed && reminder.lastError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Delivery failed. The server could not send this reminder.
            </p>
          ) : null}
        </div>

        {reminder.vehicleId ? (
          <Link
            to={`/vehicles/${reminder.vehicleId}`}
            className="shrink-0 self-center rounded-lg px-2 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
          >
            Vehicle
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
          key={`${reminder.vehicleId}-${reminder.documentType}-${reminder.reminderType}-${reminder.expiryDate}`}
          reminder={reminder}
        />
      ))}
    </ul>
  );
}

/** One upcoming send, derived from expiry date + configured offset. */
function UpcomingItem({ item }) {
  const title = [item.maker, item.model].filter(Boolean).join(' ') || item.vehicleNo;

  return (
    <li className="surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </p>
            <DocumentChip documentType={item.documentType} />
          </div>

          <p className="mt-1 font-mono text-xs tracking-wide text-slate-500 dark:text-slate-400">
            {item.vehicleNo}
          </p>

          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            <time dateTime={item.sendOn} className="font-medium text-slate-900 dark:text-white">
              {formatDate(item.sendOn)}
            </time>{' '}
            <span className="text-slate-400 dark:text-slate-500">
              · {offsetLabel(item.offset)}
            </span>
          </p>

          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {item.daysUntilSend === 0
              ? 'Due today'
              : item.daysUntilSend === 1
                ? 'Due tomorrow'
                : `In ${item.daysUntilSend} days`}
            {' · expiry '}
            {formatDate(item.expiresOn)}
          </p>
        </div>
      </div>
    </li>
  );
}

export function UpcomingReminderList({ items }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <UpcomingItem key={item.key} item={item} />
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
