/**
 * Reminder settings.
 *
 * `reminders.insurance` / `reminders.pucc` are lists of "days before expiry"
 * offsets: `[7, 1, 0]` means seven days before, one day before and on the
 * expiry day itself. The backend accepts 0-365, de-duplicates and sorts them.
 */
import { client, unwrap } from './client.js';

export const DOCUMENT_TYPES = ['insurance', 'pucc'];

function mapSettings(raw) {
  return {
    reminderEmail: raw?.reminder_email ?? '',
    reminders: {
      insurance: normalizeOffsets(raw?.reminders?.insurance),
      pucc: normalizeOffsets(raw?.reminders?.pucc),
    },
    updatedAt: raw?.updated_at ?? null,
  };
}

function normalizeOffsets(offsets) {
  if (!Array.isArray(offsets)) return [];
  const unique = new Set(
    offsets
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 365),
  );
  // Descending, matching how the backend stores them: [30, 7, 1, 0].
  return [...unique].sort((a, b) => b - a);
}

/** `GET /api/settings/` */
export async function getSettings() {
  return mapSettings(unwrap(await client.get('/settings/')));
}

/**
 * `PUT /api/settings/`
 *
 * Both fields are optional server-side, but at least one must be present -
 * this always sends both, which is what the settings form produces.
 */
export async function updateSettings({ reminderEmail, reminders }) {
  const body = {};
  if (reminderEmail !== undefined) body.reminder_email = reminderEmail;
  if (reminders !== undefined) {
    body.reminders = {
      insurance: normalizeOffsets(reminders.insurance),
      pucc: normalizeOffsets(reminders.pucc),
    };
  }
  return mapSettings(unwrap(await client.put('/settings/', body)));
}
