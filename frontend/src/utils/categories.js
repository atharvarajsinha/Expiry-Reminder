/**
 * Category presentation.
 *
 * The *content* of a category - its labels, its expiry presets, whether it is a
 * card - comes from `GET /api/items/categories/` so adding one is a
 * backend-only change. The only thing that cannot travel over JSON is the icon
 * component, so the server sends an icon *name* and this file maps it to a
 * Lucide component. An unknown name falls back rather than crashing the render,
 * which is what lets a new category appear in the UI before this file knows
 * about it.
 */
import {
  Car,
  CircleDot,
  CreditCard,
  FileText,
  Package,
  Repeat,
  Shield,
} from 'lucide-react';

const ICONS = {
  car: Car,
  'credit-card': CreditCard,
  'file-text': FileText,
  shield: Shield,
  repeat: Repeat,
  package: Package,
  'circle-dot': CircleDot,
};

/** The Lucide component for a category's icon name. */
export function categoryIcon(iconName) {
  return ICONS[iconName] || CircleDot;
}

/** Look a category up in the fetched catalogue. Safe with a missing list. */
export function findCategory(catalogue, key) {
  return (catalogue || []).find((entry) => entry.key === key) || null;
}

/** The icon for an item, resolved through its category. */
export function iconForItem(catalogue, item) {
  return categoryIcon(findCategory(catalogue, item?.category)?.icon);
}

/**
 * A blank form value set for a category, pre-filled with its default expiry
 * rows so the user starts from "fill in the dates" rather than a bare form.
 */
export function blankItemFor(category) {
  if (!category) {
    return { category: '', name: '', identifier: '', issuer: '', holder: '', notes: '', expiries: [] };
  }

  const presets = new Map(category.expiries.map((entry) => [entry.key, entry]));

  return {
    category: category.key,
    name: '',
    identifier: '',
    issuer: '',
    holder: '',
    notes: '',
    expiries: category.defaultExpiries.map((key) => ({
      key,
      label: presets.get(key)?.label || key,
      expiresOn: '',
      reference: '',
    })),
  };
}

/** Turn a saved item back into editable form values. */
export function formValuesFrom(item) {
  return {
    category: item.category,
    name: item.name || '',
    identifier: item.identifier || '',
    issuer: item.issuer || '',
    holder: item.holder || '',
    notes: item.notes || '',
    expiries: item.expiries.map((entry) => ({
      key: entry.key,
      label: entry.label || '',
      expiresOn: entry.expiresOn || '',
      reference: entry.reference || '',
    })),
  };
}

/**
 * The presets a category offers that are not already on the form, so the "add
 * another date" menu never suggests a duplicate.
 */
export function availablePresets(category, expiries) {
  if (!category) return [];
  const used = new Set((expiries || []).map((entry) => entry.key));
  return category.expiries.filter((preset) => !used.has(preset.key));
}

/** The label a preset gives an expiry key, for the reference field's hint. */
export function referenceLabelFor(category, expiryKey) {
  const preset = category?.expiries.find((entry) => entry.key === expiryKey);
  return preset?.referenceLabel || null;
}
