/**
 * Reminder history.
 *
 * A reminder *record* only exists once the backend's daily sweep has claimed
 * it, so this endpoint is a log of what was actually sent (or attempted), not
 * a schedule of what is coming. The upcoming schedule is derived on the client
 * from each vehicle's expiry dates and the configured offsets - see
 * `utils/reminders.js`.
 */
import { client, unwrap } from './client.js';

export function mapReminder(raw) {
  return {
    vehicleId: raw.vehicle_id,
    documentType: raw.document_type,
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

/** `GET /api/reminders/?limit=n[&vehicle_id=...]` - newest first. */
export async function getReminders({ limit = 50, vehicleId } = {}) {
  const params = { limit };
  if (vehicleId) params.vehicle_id = vehicleId;
  const data = unwrap(await client.get('/reminders/', { params }));
  return Array.isArray(data) ? data.map(mapReminder) : [];
}

/**
 * `POST /api/reminders/run/` - queue the daily check immediately.
 *
 * This *sends email* for anything currently due, so every caller must confirm
 * with the user first. It is idempotent: a reminder already sent is not sent
 * again.
 */
export async function runReminderCheck() {
  const data = unwrap(await client.post('/reminders/run/', {}));
  return { queued: Boolean(data?.queued), taskId: data?.task_id ?? null };
}
