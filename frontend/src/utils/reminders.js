/**
 * Reminder labelling, and the upcoming-schedule calculation.
 *
 * The backend stores a reminder record only when the daily sweep claims one,
 * so "what is coming" cannot be read from the API. It is derived here from the
 * same two inputs the sweep uses - each vehicle's expiry dates and the
 * configured day offsets - using the identical rule:
 *
 *     send date = expiry date - offset days,  and only while expiry >= today
 *
 * (`reminders/services.py: due_reminders` skips documents that have already
 * expired, so this does too.)
 */
import { addDays, daysUntil, parseApiDate, toIsoDate, todayLocal } from './date.js';

export const DOCUMENT_LABELS = {
  insurance: 'Insurance',
  pucc: 'PUC',
};

export function documentLabel(documentType) {
  return DOCUMENT_LABELS[documentType] || documentType || 'Document';
}

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

/**
 * Every reminder still to come, soonest first.
 *
 * @param vehicles  mapped vehicle summaries (need `insurance`/`pucc` expiry)
 * @param reminders configured offsets, `{ insurance: [7,1,0], pucc: [...] }`
 */
export function upcomingReminders(vehicles, reminders) {
  if (!vehicles?.length || !reminders) return [];

  const today = todayLocal();
  const upcoming = [];

  for (const vehicle of vehicles) {
    for (const documentType of ['insurance', 'pucc']) {
      const expiresOn = vehicle[documentType]?.expiresOn;
      const expiryDate = parseApiDate(expiresOn);
      if (!expiryDate) continue;

      // An expired document never triggers another email.
      const remaining = daysUntil(expiresOn, today);
      if (remaining === null || remaining < 0) continue;

      for (const offset of reminders[documentType] || []) {
        if (offset > remaining) continue; // that send date has already passed
        const sendOn = addDays(expiryDate, -offset);
        upcoming.push({
          key: `${vehicle.id}-${documentType}-${offset}`,
          vehicleId: vehicle.id,
          vehicleNo: vehicle.vehicleNo,
          maker: vehicle.maker,
          model: vehicle.model,
          documentType,
          offset,
          expiresOn,
          sendOn: toIsoDate(sendOn),
          daysUntilSend: remaining - offset,
        });
      }
    }
  }

  return upcoming.sort((a, b) => a.sendOn.localeCompare(b.sendOn));
}
