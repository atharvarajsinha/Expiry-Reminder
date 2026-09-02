/**
 * Item endpoints, plus the one place where the backend's snake_case payloads
 * are translated into the shape the components use. Keeping the mapping here
 * means a backend field rename touches this file only.
 *
 * Unlike the old vehicle API there is only *one* item shape: `GET /items/` and
 * `GET /items/{id}/` return exactly the same fields, so a card in a list and
 * the detail screen can never disagree about an item's status.
 *
 * Everything is synchronous. An item is typed in by the user, so creating one
 * is a single request that answers with the stored record - there is no job to
 * poll and no upstream service to wait for.
 */
import { client, unwrap } from './client.js';

/** One expiry date on an item. */
export function mapExpiry(raw) {
  return {
    key: raw.key,
    label: raw.label,
    expiresOn: raw.expires_on ?? null,
    issuedOn: raw.issued_on ?? null,
    reference: raw.reference ?? null,
    status: raw.status ?? null,
    statusLabel: raw.status_label ?? null,
    daysRemaining: raw.days_remaining ?? null,
  };
}

/**
 * One of a category's optional extras, as saved on an item - a vehicle's
 * engine number, say. The server resolves the label and says whether the value
 * is a date, so nothing here has to cross-reference the catalogue.
 */
export function mapDetail(raw) {
  return {
    key: raw.key,
    label: raw.label,
    kind: raw.kind,
    value: raw.value ?? null,
  };
}

/** `GET /api/items/` list entry and `GET /api/items/{id}/` detail alike. */
export function mapItem(raw) {
  return {
    id: raw.id,
    category: raw.category,
    categoryLabel: raw.category_label,
    name: raw.name,
    identifier: raw.identifier ?? null,
    issuer: raw.issuer ?? null,
    holder: raw.holder ?? null,
    notes: raw.notes ?? null,
    // Only the extras that were filled in, in catalogue order.
    details: Array.isArray(raw.details) ? raw.details.map(mapDetail) : [],
    expiries: Array.isArray(raw.expiries) ? raw.expiries.map(mapExpiry) : [],
    // The soonest date still ahead - what the card headlines.
    nextExpiry: raw.next_expiry ? mapExpiry(raw.next_expiry) : null,
    overallStatus: raw.overall_status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/** One entry from `GET /api/items/categories/`. */
export function mapCategory(raw) {
  return {
    key: raw.key,
    label: raw.label,
    plural: raw.plural,
    icon: raw.icon,
    description: raw.description,
    nameLabel: raw.name_label,
    namePlaceholder: raw.name_placeholder,
    identifierLabel: raw.identifier_label,
    identifierPlaceholder: raw.identifier_placeholder,
    identifierRequired: Boolean(raw.identifier_required),
    issuerLabel: raw.issuer_label,
    holderLabel: raw.holder_label,
    isCard: Boolean(raw.is_card),
    expiries: (raw.expiries || []).map((entry) => ({
      key: entry.key,
      label: entry.label,
      referenceLabel: entry.reference_label ?? null,
    })),
    defaultExpiries: raw.default_expiries || [],
    // The optional fields this category adds to the form. Empty for most of
    // them; a vehicle asks for its engine number, chassis number and
    // registration date.
    details: (raw.details || []).map((entry) => ({
      key: entry.key,
      label: entry.label,
      kind: entry.kind,
      placeholder: entry.placeholder || '',
    })),
  };
}

/** The request body shared by create and update. */
function toPayload({
  category,
  name,
  identifier,
  issuer,
  holder,
  notes,
  details,
  expiries,
}) {
  return {
    category,
    name,
    identifier: identifier || '',
    issuer: issuer || '',
    holder: holder || '',
    notes: notes || '',
    // Sent as typed; the server drops the blanks and anything the category
    // does not declare, so there is nothing to filter here.
    details: details || {},
    expiries: (expiries || []).map((entry) => ({
      key: entry.key,
      label: entry.label || '',
      expires_on: entry.expiresOn,
      issued_on: entry.issuedOn || '',
      reference: entry.reference || '',
    })),
  };
}

/**
 * `GET /api/items/categories/`
 *
 * The catalogue the forms are built from: field labels, expiry presets and
 * which categories are cards. Fetched from the server rather than hardcoded
 * here so adding a category is a backend-only change.
 */
export async function getCategories() {
  const data = unwrap(await client.get('/items/categories/'));
  return Array.isArray(data) ? data.map(mapCategory) : [];
}

/** `GET /api/items/[?category=...]` - soonest expiry first. */
export async function getItems({ category } = {}) {
  const params = category ? { category } : undefined;
  const data = unwrap(await client.get('/items/', { params }));
  return Array.isArray(data) ? data.map(mapItem) : [];
}

/** `GET /api/items/{id}/` */
export async function getItem(id) {
  return mapItem(unwrap(await client.get(`/items/${encodeURIComponent(id)}/`)));
}

/**
 * `POST /api/items/`
 *
 * A 409 (ITEM_ALREADY_EXISTS) carries the clashing item's id in
 * `error.details.item_id`; a 400 CARD_NUMBER_REJECTED means a full card number
 * was submitted and nothing was saved.
 */
export async function createItem(values) {
  return mapItem(unwrap(await client.post('/items/', toPayload(values))));
}

/** `PUT /api/items/{id}/` - replaces every editable field, expiries included. */
export async function updateItem(id, values) {
  return mapItem(
    unwrap(await client.put(`/items/${encodeURIComponent(id)}/`, toPayload(values))),
  );
}

/** `DELETE /api/items/{id}/` - also removes the item's reminder history. */
export async function deleteItem(id) {
  await client.delete(`/items/${encodeURIComponent(id)}/`);
  return true;
}
