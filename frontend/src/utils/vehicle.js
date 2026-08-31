/**
 * Registration-number handling and vehicle presentation helpers.
 *
 * The validation rules mirror `core/validators.py` on the backend so the user
 * gets instant feedback, but the backend stays authoritative: it normalises and
 * re-validates every number it receives.
 */
import { Bike, Bus, Car, Truck } from 'lucide-react';

const NON_ALNUM = /[^A-Za-z0-9]/g;

// Classic series: state code + RTO code + optional letters + running number.
const STANDARD = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/;
// Bharat series: 22BH1234AB
const BH_SERIES = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
// Older / defence style plates such as 12A123456 or 09AB1234A.
const DEFENCE = /^[0-9]{2}[A-Z]{1,2}[0-9]{4,6}[A-Z]?$/;

/** `up25 ak 4922` / `UP-25-AK-4922` -> `UP25AK4922`. Never throws. */
export function normalizeVehicleNumber(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(NON_ALNUM, '').toUpperCase();
}

export function isValidVehicleNumber(value) {
  const normalized = normalizeVehicleNumber(value);
  if (normalized.length < 5 || normalized.length > 12) return false;
  return (
    STANDARD.test(normalized) || BH_SERIES.test(normalized) || DEFENCE.test(normalized)
  );
}

/** A user-facing reason the number was rejected, or `null` when it is fine. */
export function vehicleNumberError(value) {
  const normalized = normalizeVehicleNumber(value);
  if (!normalized) return 'Enter the vehicle registration number.';
  if (normalized.length < 5) return 'That looks too short for a registration number.';
  if (normalized.length > 12) return 'That looks too long for a registration number.';
  if (!isValidVehicleNumber(normalized)) {
    return `"${normalized}" does not look like a valid Indian registration number.`;
  }
  return null;
}

/** `HONDA CB TWISTER`, falling back to the registration number. */
export function vehicleTitle(vehicle) {
  if (!vehicle) return 'Vehicle';
  const parts = [vehicle.maker, vehicle.model].filter(Boolean);
  return parts.length ? parts.join(' ') : vehicle.vehicleNo || 'Vehicle';
}

const CATEGORY_LABELS = {
  '2W': 'Two wheeler',
  '3W': 'Three wheeler',
  '4W': 'Four wheeler',
  LMV: 'Light motor vehicle',
  HMV: 'Heavy motor vehicle',
  HGV: 'Heavy goods vehicle',
  HPV: 'Heavy passenger vehicle',
  MCV: 'Medium commercial vehicle',
  LGV: 'Light goods vehicle',
};

export function categoryLabel(category) {
  if (!category) return null;
  return CATEGORY_LABELS[String(category).toUpperCase()] || category;
}

/** A Lucide icon component that suits the vehicle category. */
export function vehicleIcon(category) {
  const key = String(category || '').toUpperCase();
  if (key.startsWith('2W') || key === 'MC' || key === 'MCWG') return Bike;
  if (key.includes('HGV') || key.includes('LGV') || key.includes('TRUCK')) return Truck;
  if (key.includes('HPV') || key.includes('BUS')) return Bus;
  return Car;
}
