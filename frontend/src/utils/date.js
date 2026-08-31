/**
 * Date helpers.
 *
 * The API sends date-only values as `YYYY-MM-DD` and timestamps as ISO 8601.
 * `new Date('2027-08-12')` is parsed as UTC midnight, which renders as
 * 11 Aug in any timezone behind UTC - so date-only values are always split by
 * hand and rebuilt in local time. Never pass a bare `YYYY-MM-DD` string to the
 * `Date` constructor anywhere in this project.
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

/**
 * Parses an API date-only value into a local-midnight `Date`.
 * Accepts `YYYY-MM-DD` and ISO timestamps (the date part is used).
 * Returns `null` for anything unusable.
 */
export function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfDay(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  const datePart = text.includes('T') ? text.split('T')[0] : text;
  const match = DATE_ONLY.exec(datePart);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Rejects impossible dates such as 2027-02-31, which JS would roll over.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Parses an ISO timestamp (`2026-08-31T09:15:00Z`) into a `Date`. */
export function parseApiDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Today at local midnight. */
export function todayLocal() {
  return startOfDay(new Date());
}

/** `12 Aug 2027`, or the fallback when the value is missing/unparseable. */
export function formatDate(value, fallback = 'Not available') {
  const date = parseApiDate(value);
  if (!date) return fallback;
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** `12 August 2027`. */
export function formatDateLong(value, fallback = 'Not available') {
  const date = parseApiDate(value);
  if (!date) return fallback;
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** `31 Aug 2026, 14:05` for timestamps. */
export function formatDateTime(value, fallback = 'Never') {
  const date = parseApiDateTime(value);
  if (!date) return fallback;
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}, ${time}`;
}

/**
 * Whole days from today to `value`; negative once past.
 * Returns `null` when the date cannot be parsed.
 */
export function daysUntil(value, reference = todayLocal()) {
  const date = parseApiDate(value);
  if (!date) return null;
  // Both operands are local midnight, so DST cannot shift the result by a day.
  return Math.round((date.getTime() - startOfDay(reference).getTime()) / MS_PER_DAY);
}

/**
 * Human phrasing for a day count:
 * `Expires in 346 days`, `Expires tomorrow`, `Expires today`,
 * `Expired yesterday`, `Expired 3 days ago`.
 */
export function formatExpiryDistance(days) {
  if (days === null || days === undefined || Number.isNaN(days)) return null;
  if (days > 1) return `Expires in ${days} days`;
  if (days === 1) return 'Expires tomorrow';
  if (days === 0) return 'Expires today';
  if (days === -1) return 'Expired yesterday';
  return `Expired ${Math.abs(days)} days ago`;
}

/** `2 hours ago` / `just now`, used for "last updated" lines. */
export function formatRelativeTime(value) {
  const date = parseApiDateTime(value);
  if (!date) return null;

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(date, 'a while ago');
}

/** A new `Date` `days` after `date` (negative to go back). Stays local-midnight. */
export function addDays(date, days) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** `YYYY-MM-DD` for a local `Date` (no timezone shift). */
export function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
