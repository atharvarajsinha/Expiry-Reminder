/**
 * Reminders.
 *
 * Two endpoints, two very different things:
 *
 *  - **`/reminders/upcoming/`** is the schedule. The backend derives it from
 *    the items and the configured offsets on every request, so what you see is
 *    exactly what the sweep will send. Nothing is stored to produce it, which
 *    is why the client no longer has to recompute the schedule itself.
 *  - **`/reminders/`** is the log: one row per reminder actually claimed for
 *    sending, including failures.
 */
import { client, unwrap } from './client.js';

/** One row from `GET /api/reminders/` - what was sent or attempted. */
export function mapReminder(raw) {
  return {
    itemId: raw.item_id,
    itemName: raw.item_name,
    category: raw.category,
    expiryKey: raw.expiry_key,
    expiryLabel: raw.expiry_label,
    expiryDate: raw.expiry_date,
    reminderType: raw.reminder_type,
    scheduledFor: raw.scheduled_for,
    sent: Boolean(raw.sent),
    sentAt: raw.sent_at,
    attempts: raw.attempts ?? 0,
    lastError: raw.last_error,
    createdAt: raw.created_at,
  };
}

/** One entry from `GET /api/reminders/upcoming/` - a send date still ahead. */
export function mapUpcoming(raw) {
  return {
    key: raw.key,
    itemId: raw.item_id,
    itemName: raw.item_name,
    category: raw.category,
    categoryLabel: raw.category_label,
    identifier: raw.identifier,
    expiryKey: raw.expiry_key,
    expiryLabel: raw.expiry_label,
    expiresOn: raw.expires_on,
    offset: raw.offset,
    reminderType: raw.reminder_type,
    sendOn: raw.send_on,
    daysUntilSend: raw.days_until_send,
  };
}

/**
 * `GET /api/reminders/upcoming/`
 *
 * Also reports when the sweep last ran, which is how the UI can say whether
 * today's check has already happened.
 */
export async function getUpcomingReminders({ limit = 100 } = {}) {
  const data = unwrap(await client.get('/reminders/upcoming/', { params: { limit } }));
  return {
    today: data?.today ?? null,
    upcoming: Array.isArray(data?.upcoming) ? data.upcoming.map(mapUpcoming) : [],
    sweep: {
      lastRunDate: data?.sweep?.last_run_date ?? null,
      lastRunAt: data?.sweep?.last_run_at ?? null,
    },
  };
}

/** `GET /api/reminders/?limit=n[&item_id=...]` - newest first. */
export async function getReminders({ limit = 50, itemId } = {}) {
  const params = { limit };
  if (itemId) params.item_id = itemId;
  const data = unwrap(await client.get('/reminders/', { params }));
  return Array.isArray(data) ? data.map(mapReminder) : [];
}

/**
 * `POST /api/reminders/run/` - run the sweep now, synchronously.
 *
 * This *sends email* for anything currently due, so every caller must confirm
 * with the user first. It is idempotent: a reminder already sent is not sent
 * again, so pressing it twice is harmless. Unlike the old queued version this
 * returns the finished summary, so the UI can report exactly what went out.
 */
export async function runReminderCheck() {
  const data = unwrap(await client.post('/reminders/run/', {}));
  return {
    triggeredBy: data?.triggered_by ?? 'user',
    date: data?.date ?? null,
    itemsChecked: data?.items_checked ?? 0,
    due: data?.due ?? 0,
    sent: data?.sent ?? 0,
    skipped: data?.skipped_already_sent ?? 0,
    failed: data?.failed ?? 0,
    error: data?.error ?? null,
  };
}
