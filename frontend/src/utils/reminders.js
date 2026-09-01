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

  const outcome = `Reminder check finished: ${parts.join(', ')}.`;
  // "3 failed" on its own leaves the user guessing. The server sends the
  // reasons, and they are written to be safe to show.
  const reason = summary.failures?.[0];
  return reason ? `${outcome} ${reason}` : outcome;
}

/**
 * A next step for the failures we can recognise.
 *
 * The server deliberately reports Brevo's *status code* and nothing else - no
 * response body, no key - which is safe but not actionable on its own. These
 * are the two that actually happen, and what each one means in practice.
 */
export function deliveryHint(lastError) {
  if (!lastError) return null;
  if (lastError.includes('not configured')) {
    return 'Set BREVO_API_KEY and BREVO_SENDER_EMAIL on the API service.';
  }
  if (lastError.includes('HTTP 401')) {
    return 'Brevo rejected the key. Usually Security -> Authorised IPs is still switched on, which blocks the server.';
  }
  if (lastError.includes('HTTP 400')) {
    return 'Brevo rejected the message. Usually the sender address is not verified under Brevo -> Senders.';
  }
  if (lastError.includes('could not be reached') || lastError.includes('respond in time')) {
    return 'The API could not reach Brevo. This one is usually temporary.';
  }
  return null;
}
