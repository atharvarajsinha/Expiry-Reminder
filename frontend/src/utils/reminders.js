/**
 * Reminder wording.
 *
 * The *schedule* used to be computed here, because the backend only wrote a
 * reminder record once its daily sweep claimed one and there was nothing to
 * read beforehand. It now derives the upcoming list on request
 * (`GET /api/reminders/upcoming/`), so this file is only about turning stored
 * values into words - and the client can no longer drift from what the sweep
 * will actually do.
 */

/** `7` -> `7 days before`, `1` -> `1 day before`, `0` -> `On expiry day`. */
export function offsetLabel(days) {
  if (days === 0) return 'On expiry day';
  if (days === 1) return '1 day before';
  return `${days} days before`;
}

/**
 * The stored `reminder_type` back into words:
 * `expiry_day` / `1_day` / `7_days` -> the same phrasing as `offsetLabel`.
 */
export function reminderTypeLabel(reminderType) {
  if (!reminderType) return 'Reminder';
  if (reminderType === 'expiry_day') return 'On expiry day';
  const match = /^(\d+)_days?$/.exec(reminderType);
  if (match) return offsetLabel(Number(match[1]));
  return reminderType;
}

/** `Today` / `Tomorrow` / `In 5 days`, for a send date. */
export function sendDistanceLabel(daysUntilSend) {
  if (daysUntilSend === null || daysUntilSend === undefined) return null;
  if (daysUntilSend <= 0) return 'Today';
  if (daysUntilSend === 1) return 'Tomorrow';
  return `In ${daysUntilSend} days`;
}

/**
 * A one-line summary of a finished sweep, for the toast after "Send due now".
 *
 * The sweep is idempotent, so "0 sent, 2 already sent" is a success worth
 * wording clearly rather than an ambiguous "done".
 */
export function sweepSummaryMessage(summary) {
  if (!summary) return 'Reminder check finished.';
  if (summary.error) return summary.error;

  const parts = [];
  if (summary.sent) parts.push(`${summary.sent} sent`);
  if (summary.skipped) parts.push(`${summary.skipped} already sent today`);
  if (summary.failed) parts.push(`${summary.failed} failed`);

  if (!parts.length) return 'Nothing was due today.';
  return `Reminder check finished: ${parts.join(', ')}.`;
}
