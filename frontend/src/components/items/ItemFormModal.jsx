import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Plus, Trash2 } from 'lucide-react';

import { Alert } from '../common/Alert.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { Modal } from '../common/Modal.jsx';
import { createItem, updateItem } from '../../api/items.js';
import { useToast } from '../../hooks/useToast.js';
import {
  availablePresets,
  blankItemFor,
  categoryIcon,
  detailFields,
  findCategory,
  formValuesFrom,
  referenceLabelFor,
} from '../../utils/categories.js';
import { cn } from '../../utils/cn.js';
import { getApiError, getFieldErrors } from '../../utils/errors.js';
import { identifierError } from '../../utils/identifier.js';

/** A slug for an expiry the user names themselves. */
function slugify(label, taken) {
  const base =
    String(label || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'expiry';
  // Keys must be unique within an item and start with a letter.
  const safe = /^[a-z]/.test(base) ? base : `x_${base}`;
  let key = safe;
  let suffix = 2;
  while (taken.has(key)) {
    key = `${safe}_${suffix}`;
    suffix += 1;
  }
  return key;
}

/** The category chooser, shown only when adding. */
function CategoryPicker({ categories, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        What are you tracking?
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {categories.map((category) => {
          const Icon = categoryIcon(category.icon);
          const isActive = value === category.key;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => onChange(category)}
              aria-pressed={isActive}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate">{category.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One editable expiry row. */
function ExpiryFields({ entry, index, category, error, onChange, onRemove, canRemove }) {
  const referenceLabel = referenceLabelFor(category, entry.key);

  return (
    <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
      <div className="mb-3 flex items-center gap-2">
        <Input
          id={`expiry-label-${index}`}
          label="What expires"
          labelHidden
          value={entry.label}
          onChange={(event) => onChange(index, { label: event.target.value })}
          placeholder="Name this date"
          maxLength={60}
          className="h-9 font-medium"
          containerClassName="flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={Trash2}
          onClick={() => onRemove(index)}
          disabled={!canRemove}
          aria-label={`Remove ${entry.label || 'this date'}`}
          title={canRemove ? 'Remove this date' : 'An item needs at least one date'}
          className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id={`expiry-date-${index}`}
          type="date"
          label="Expires on"
          value={entry.expiresOn}
          onChange={(event) => onChange(index, { expiresOn: event.target.value })}
          error={error}
          required
        />
        <Input
          id={`expiry-reference-${index}`}
          label={referenceLabel || 'Reference'}
          value={entry.reference}
          onChange={(event) => onChange(index, { reference: event.target.value })}
          placeholder="Optional"
          maxLength={60}
        />
      </div>
    </div>
  );
}

/**
 * Add or edit an item.
 *
 * One component for both because the fields, the validation and the category
 * rules are identical - the only differences are the endpoint it calls and
 * whether the category can still be changed. Splitting them would mean two
 * places to keep the card rule correct.
 *
 * Pass `item` to edit, omit it to add.
 */
export function ItemFormModal({ open, onClose, onSaved, categories, item = null }) {
  const toast = useToast();
  const isEditing = Boolean(item);

  const [values, setValues] = useState(() => blankItemFor(categories[0]));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const nameRef = useRef(null);

  const category = useMemo(
    () => findCategory(categories, values.category),
    [categories, values.category],
  );
  const presets = useMemo(
    () => availablePresets(category, values.expiries),
    [category, values.expiries],
  );
  const details = detailFields(category);

  // Reset whenever the dialog opens, so a cancelled edit never leaks into the
  // next one.
  useEffect(() => {
    if (!open) return;
    setValues(item ? formValuesFrom(item) : blankItemFor(categories[0]));
    setErrors({});
    setFormError(null);
  }, [open, item, categories]);

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const setDetail = (key, value) => {
    setValues((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }));
  };

  const onCategoryChange = (nextCategory) => {
    // Keep what the user has typed; swap only the category-shaped parts.
    setValues((current) => ({
      ...blankItemFor(nextCategory),
      name: current.name,
      issuer: current.issuer,
      holder: current.holder,
      notes: current.notes,
      // An identifier means different things per category (a plate is not four
      // digits), so it is cleared rather than carried across. The extra fields
      // go the same way: `blankItemFor` empties them, because a chassis number
      // means nothing on a passport.
      identifier: '',
    }));
    setErrors({});
  };

  const onExpiryChange = (index, patch) => {
    setValues((current) => ({
      ...current,
      expiries: current.expiries.map((entry, position) =>
        position === index ? { ...entry, ...patch } : entry,
      ),
    }));
    setErrors((current) => ({ ...current, [`expiry-${index}`]: undefined }));
  };

  const onExpiryRemove = (index) => {
    setValues((current) => ({
      ...current,
      expiries: current.expiries.filter((_, position) => position !== index),
    }));
    setErrors({});
  };

  const addExpiry = (preset) => {
    setValues((current) => {
      const taken = new Set(current.expiries.map((entry) => entry.key));
      const label = preset?.label || 'New date';
      return {
        ...current,
        expiries: [
          ...current.expiries,
          {
            key: preset?.key || slugify(label, taken),
            label,
            expiresOn: '',
            reference: '',
          },
        ],
      };
    });
  };

  const validate = () => {
    const next = {};

    if (!values.name.trim()) next.name = 'Give this item a name.';

    const identifierProblem = identifierError(category, values.identifier);
    if (identifierProblem) next.identifier = identifierProblem;

    if (!values.expiries.length) {
      next.form = 'Add at least one expiry date.';
    }
    values.expiries.forEach((entry, index) => {
      if (!entry.expiresOn) next[`expiry-${index}`] = 'Pick a date.';
    });

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSaving(true);
    try {
      // Any expiry the user renamed but never gave a key keeps its slug; the
      // backend re-derives labels, so sending both is safe.
      const saved = isEditing
        ? await updateItem(item.id, values)
        : await createItem(values);

      toast.success(isEditing ? `${saved.name} updated.` : `${saved.name} added.`);
      onSaved?.(saved);
      onClose?.();
    } catch (requestError) {
      const apiError = getApiError(requestError);
      const fieldErrors = getFieldErrors(requestError);
      setErrors((current) => ({ ...current, ...fieldErrors }));
      setFormError(apiError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={isSaving ? undefined : onClose}
      title={isEditing ? `Edit ${item.name}` : 'Add an item'}
      description={
        isEditing
          ? 'Everything here is editable, including which dates are tracked.'
          : 'Everything is typed in by you - nothing is looked up anywhere.'
      }
      size="lg"
      dismissible={!isSaving}
      initialFocusRef={nameRef}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
            className="sm:w-auto"
            fullWidth
          >
            Cancel
          </Button>
          <Button type="submit" form="item-form" loading={isSaving} fullWidth>
            {isEditing ? 'Save Changes' : 'Add Item'}
          </Button>
        </div>
      }
    >
      <form id="item-form" onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {errors.form ? <Alert variant="error">{errors.form}</Alert> : null}

        {isEditing ? null : (
          <CategoryPicker
            categories={categories}
            value={values.category}
            onChange={onCategoryChange}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            ref={nameRef}
            id="item-name"
            label={category?.nameLabel || 'Name'}
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder={category?.namePlaceholder}
            error={errors.name}
            maxLength={120}
            autoComplete="off"
            required
          />

          <Input
            id="item-identifier"
            label={category?.identifierLabel || 'Reference'}
            value={values.identifier}
            onChange={(event) => setField('identifier', event.target.value)}
            // Checked on blur as well as on submit, so someone who pastes a
            // whole card number is told immediately rather than after saving.
            onBlur={(event) =>
              setErrors((current) => ({
                ...current,
                identifier: identifierError(category, event.target.value) || undefined,
              }))
            }
            placeholder={category?.identifierPlaceholder}
            error={errors.identifier}
            hint={
              category?.isCard
                ? 'Only the last 4 digits. Full card numbers are never stored.'
                : undefined
            }
            // Deliberately *not* capped at 4 for cards. A maxLength would let
            // the browser silently keep the first four digits of a pasted card
            // number - the wrong four, with no warning. Letting the whole value
            // through means the validator can reject it and say why.
            maxLength={60}
            inputMode={category?.isCard ? 'numeric' : undefined}
            autoComplete="off"
          />

          <Input
            id="item-issuer"
            label={category?.issuerLabel || 'Provider'}
            value={values.issuer}
            onChange={(event) => setField('issuer', event.target.value)}
            placeholder="Optional"
            maxLength={120}
            autoComplete="off"
          />

          <Input
            id="item-holder"
            label={category?.holderLabel || 'Belongs to'}
            value={values.holder}
            onChange={(event) => setField('holder', event.target.value)}
            placeholder="Optional"
            maxLength={120}
            autoComplete="off"
          />

          {/* Whatever extras this category asks for - a vehicle's engine
              number, chassis number and registration date. All optional, and
              rendered from the catalogue so a new one needs no change here.
              The category's placeholder is an example of the value, so
              "Optional" is said in the hint instead - and said for every one of
              them, including the dates, which cannot show a placeholder. */}
          {details.map((field) => (
            <Input
              key={field.key}
              id={`item-detail-${field.key}`}
              type={field.kind === 'date' ? 'date' : 'text'}
              label={field.label}
              value={values.details?.[field.key] || ''}
              onChange={(event) => setDetail(field.key, event.target.value)}
              placeholder={field.kind === 'date' ? undefined : field.placeholder}
              hint="Optional"
              maxLength={field.kind === 'date' ? undefined : 60}
              autoComplete="off"
            />
          ))}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Dates to track
            </h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Reminders are sent for each of these
            </span>
          </div>

          <div className="space-y-3">
            {values.expiries.map((entry, index) => (
              <ExpiryFields
                key={entry.key}
                entry={entry}
                index={index}
                category={category}
                error={errors[`expiry-${index}`]}
                onChange={onExpiryChange}
                onRemove={onExpiryRemove}
                canRemove={values.expiries.length > 1}
              />
            ))}
          </div>

          {/* Presets first, because they carry the right label and reference
              wording; the generic button covers everything else. */}
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.key}
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => addExpiry(preset)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              icon={CalendarPlus}
              onClick={() => addExpiry(null)}
            >
              Another date
            </Button>
          </div>
        </div>

        <div>
          <label
            htmlFor="item-notes"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Notes
          </label>
          <textarea
            id="item-notes"
            rows={2}
            value={values.notes}
            onChange={(event) => setField('notes', event.target.value)}
            placeholder="Anything you want to remember about this item"
            maxLength={1000}
            className={cn(
              'block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5',
              'text-base text-slate-900 shadow-sm placeholder:text-slate-400 sm:text-sm',
              'focus:border-primary-500',
              'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
            )}
          />
        </div>
      </form>
    </Modal>
  );
}
