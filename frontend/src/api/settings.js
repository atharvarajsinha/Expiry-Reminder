/**
 * Reminder settings.
 *
 * `reminders` is a map of `category -> [days before expiry]`: `[30, 7, 1, 0]`
 * means a month before, a week before, the day before and on the expiry day
 * itself. The `default` key covers any category without its own entry.
 *
 * An empty list is a meaningful choice - "never email me about this category" -
 * and is stored as such, not treated as "unset".
 *
 * The response also carries a read-only `delivery` block describing what is
 * actually wired up on the server (is email configured? is a cron token set?
 * when did the sweep last run?). It contains booleans and dates only; no key
 * is ever returned.
 */
import { client, unwrap } from './client.js';

export const MAX_OFFSET_DAYS = 365;
export const MAX_OFFSETS_PER_CATEGORY = 10;

/** Sorted descending and de-duplicated, matching how the backend stores them. */
export function normalizeOffsets(offsets) {
  if (!Array.isArray(offsets)) return [];
  const unique = new Set(
    offsets
      .map((value) => Number(value))
      .filter(
        (value) => Number.isInteger(value) && value >= 0 && value <= MAX_OFFSET_DAYS,
      ),
  );
  return [...unique].sort((a, b) => b - a).slice(0, MAX_OFFSETS_PER_CATEGORY);
}

function mapSettings(raw) {
  const reminders = {};
  for (const [key, offsets] of Object.entries(raw?.reminders || {})) {
    reminders[key] = normalizeOffsets(offsets);
  }

  return {
    reminderEmail: raw?.reminder_email ?? '',
    reminders,
    updatedAt: raw?.updated_at ?? null,
    delivery: {
      emailConfigured: Boolean(raw?.delivery?.email_configured),
      cronConfigured: Boolean(raw?.delivery?.cron_configured),
      sweepOnRequest: Boolean(raw?.delivery?.sweep_on_request),
      expiringSoonDays: raw?.delivery?.expiring_soon_days ?? 30,
      timezone: raw?.delivery?.timezone ?? null,
      sweep: {
        lastRunDate: raw?.delivery?.sweep?.last_run_date ?? null,
        lastRunAt: raw?.delivery?.sweep?.last_run_at ?? null,
      },
    },
  };
}

/** `GET /api/settings/` */
export async function getSettings() {
  return mapSettings(unwrap(await client.get('/settings/')));
}

/**
 * `PUT /api/settings/`
 *
 * Both fields are optional server-side, but at least one must be present.
 * Categories left out of `reminders` keep their stored values.
 */
export async function updateSettings({ reminderEmail, reminders }) {
  const body = {};
  if (reminderEmail !== undefined) body.reminder_email = reminderEmail;
  if (reminders !== undefined) {
    body.reminders = Object.fromEntries(
      Object.entries(reminders).map(([key, offsets]) => [
        key,
        normalizeOffsets(offsets),
      ]),
    );
  }
  return mapSettings(unwrap(await client.put('/settings/', body)));
}
