/**
 * Identifier validation, mirroring `core/validators.py`.
 *
 * The point of duplicating the rules here is instant feedback, not authority:
 * the backend normalises and re-validates everything it receives, so a
 * disagreement between the two can only ever be a rejected save, never a bad
 * record.
 *
 * The card rule is the one that matters. A full card number is *refused* - not
 * trimmed to its last four digits - because silently truncating would teach
 * the user that pasting a whole card into this app is fine. It is not: this app
 * stores four digits so you can tell your cards apart, and nothing more.
 */

const NON_ALNUM = /[^A-Za-z0-9]/g;

// Classic series: state code + RTO code + optional letters + running number.
const STANDARD = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/;
// Bharat series: 22BH1234AB
const BH_SERIES = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
// Older / defence style plates such as 12A123456 or 09AB1234A.
const DEFENCE = /^[0-9]{2}[A-Z]{1,2}[0-9]{4,6}[A-Z]?$/;

// Anything that is only digits and separators reads as a card number.
const CARD_LIKE = /^[0-9][0-9 -]*[0-9]$/;

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

/** A user-facing reason a registration number was rejected, or `null`. */
export function vehicleNumberError(value) {
  const normalized = normalizeVehicleNumber(value);
  if (!normalized) return 'Enter the registration number.';
  if (normalized.length < 5) return 'That looks too short for a registration number.';
  if (normalized.length > 12) return 'That looks too long for a registration number.';
  if (!isValidVehicleNumber(normalized)) {
    return `"${normalized}" does not look like a valid Indian registration number.`;
  }
  return null;
}

/** A user-facing reason a card identifier was rejected, or `null`. Blank is fine. */
export function cardLast4Error(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const digits = text.replace(/[^0-9]/g, '');
  if (CARD_LIKE.test(text) && digits.length > 4) {
    return 'Enter only the last 4 digits. This app never stores full card numbers.';
  }
  if (!digits || digits.length !== text.replace(/[ -]/g, '').length) {
    return 'Enter the last 4 digits, digits only.';
  }
  if (digits.length !== 4) {
    return 'Enter exactly 4 digits - the last four printed on the card.';
  }
  return null;
}

/**
 * The right check for a category, or `null` when the identifier is free-form.
 *
 * @param category the mapped catalogue entry for the item's category
 */
export function identifierError(category, value) {
  const text = String(value ?? '').trim();

  if (category?.isCard) return cardLast4Error(text);

  if (category?.key === 'vehicle') {
    if (!text && !category.identifierRequired) return null;
    return vehicleNumberError(text);
  }

  if (category?.identifierRequired && !text) {
    return `Enter the ${String(category.identifierLabel || 'reference').toLowerCase()}.`;
  }
  return null;
}

/** How an identifier is shown: card digits are masked to make the point. */
export function displayIdentifier(category, identifier) {
  if (!identifier) return null;
  return category?.isCard ? `•••• ${identifier}` : identifier;
}
