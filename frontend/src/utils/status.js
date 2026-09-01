/**
 * Expiry status.
 *
 * The backend already computes `status`, `status_label` and `days_remaining`
 * for every expiry date and it is the source of truth (it uses the project
 * timezone, Asia/Kolkata by default). These helpers prefer the server values
 * and only fall back to a local calculation when a field is missing.
 */
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react';

import { daysUntil } from './date.js';

export const STATUS = {
  VALID: 'valid',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRES_TODAY: 'expires_today',
  EXPIRED: 'expired',
  UNKNOWN: 'unknown',
};

/** Keep in step with the backend's EXPIRING_SOON_DAYS (default 30). */
export const EXPIRING_SOON_DAYS =
  Number(import.meta.env.VITE_EXPIRING_SOON_DAYS) > 0
    ? Number(import.meta.env.VITE_EXPIRING_SOON_DAYS)
    : 30;

export const STATUS_META = {
  [STATUS.VALID]: {
    label: 'Valid',
    icon: CheckCircle2,
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    accent: 'bg-emerald-500',
  },
  [STATUS.EXPIRING_SOON]: {
    label: 'Expiring Soon',
    icon: Clock,
    badge:
      'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    dot: 'bg-amber-500',
    text: 'text-amber-800 dark:text-amber-300',
    accent: 'bg-amber-500',
  },
  [STATUS.EXPIRES_TODAY]: {
    label: 'Expires Today',
    icon: AlertTriangle,
    badge:
      'bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20',
    dot: 'bg-orange-500',
    text: 'text-orange-800 dark:text-orange-300',
    accent: 'bg-orange-500',
  },
  [STATUS.EXPIRED]: {
    label: 'Expired',
    icon: XCircle,
    badge:
      'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
    dot: 'bg-red-500',
    text: 'text-red-700 dark:text-red-300',
    accent: 'bg-red-500',
  },
  [STATUS.UNKNOWN]: {
    label: 'Not available',
    icon: HelpCircle,
    badge:
      'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-400/20',
    dot: 'bg-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    accent: 'bg-slate-400',
  },
};

const SEVERITY = {
  [STATUS.UNKNOWN]: 0,
  [STATUS.VALID]: 1,
  [STATUS.EXPIRING_SOON]: 2,
  [STATUS.EXPIRES_TODAY]: 3,
  [STATUS.EXPIRED]: 4,
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META[STATUS.UNKNOWN];
}

/** Local fallback: derive a status from a day count. */
export function statusFromDays(days) {
  if (days === null || days === undefined) return STATUS.UNKNOWN;
  if (days < 0) return STATUS.EXPIRED;
  if (days === 0) return STATUS.EXPIRES_TODAY;
  if (days <= EXPIRING_SOON_DAYS) return STATUS.EXPIRING_SOON;
  return STATUS.VALID;
}

/**
 * Normalises one expiry into everything a badge needs.
 * Accepts the mapped shape `{ expiresOn, status, statusLabel, daysRemaining }`.
 */
export function resolveExpiryStatus(expiry) {
  const expiresOn = expiry?.expiresOn ?? null;
  const daysRemaining =
    expiry?.daysRemaining === null || expiry?.daysRemaining === undefined
      ? daysUntil(expiresOn)
      : expiry.daysRemaining;

  const status =
    expiry?.status && STATUS_META[expiry.status]
      ? expiry.status
      : statusFromDays(daysRemaining);

  return {
    status,
    label: expiry?.statusLabel || statusMeta(status).label,
    daysRemaining,
    expiresOn,
    meta: statusMeta(status),
  };
}

/** The most urgent of several statuses - mirrors the backend's worst_status. */
export function worstStatus(statuses) {
  const known = statuses.filter(Boolean);
  if (!known.length) return STATUS.UNKNOWN;
  return known.reduce((worst, next) =>
    (SEVERITY[next] ?? 0) > (SEVERITY[worst] ?? 0) ? next : worst,
  );
}

/**
 * Dashboard counters.
 *
 * `items` counts things you own; the other three count *dates*, because one
 * item can carry several (a vehicle with insurance, PUC and fitness is one
 * item and three dates). "Expires today" is counted with "expired" - both need
 * acting on now, and splitting them would give the dashboard a fifth number
 * that is almost always zero.
 */
export function summarizeItems(items) {
  const counts = {
    items: items.length,
    valid: 0,
    expiringSoon: 0,
    expired: 0,
    unknown: 0,
  };

  for (const item of items) {
    for (const expiry of item.expiries || []) {
      const { status } = resolveExpiryStatus(expiry);
      if (status === STATUS.VALID) counts.valid += 1;
      else if (status === STATUS.EXPIRING_SOON) counts.expiringSoon += 1;
      else if (status === STATUS.EXPIRES_TODAY || status === STATUS.EXPIRED) {
        counts.expired += 1;
      } else counts.unknown += 1;
    }
  }

  return counts;
}

/** True when an item needs attention today - expired, or expiring now. */
export function needsAttention(item) {
  return (
    item.overallStatus === STATUS.EXPIRED ||
    item.overallStatus === STATUS.EXPIRES_TODAY
  );
}
