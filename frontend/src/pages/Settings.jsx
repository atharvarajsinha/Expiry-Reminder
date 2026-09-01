import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Clock, Mail, Save, Server } from 'lucide-react';

import { Alert } from '../components/common/Alert.jsx';
import { Button } from '../components/common/Button.jsx';
import { DetailList, SectionCard } from '../components/common/DetailList.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Input } from '../components/common/Input.jsx';
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton.jsx';
import { getCategories } from '../api/items.js';
import { getSettings, updateSettings } from '../api/settings.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useToast } from '../hooks/useToast.js';
import { categoryIcon } from '../utils/categories.js';
import { cn } from '../utils/cn.js';
import { formatDateTime } from '../utils/date.js';
import { ERROR_CODE, getApiError, getFieldErrors } from '../utils/errors.js';
import { offsetLabel } from '../utils/reminders.js';

/** Offsets offered as checkboxes; anything else already saved is kept too. */
const PRESET_OFFSETS = [30, 7, 1, 0];

/** The fallback row, shown first: it covers every category without its own. */
const DEFAULT_KEY = 'default';

/** `9` -> `9:00 am`. The send hour is a server setting, not a constant. */
function formatHour(hour) {
  if (hour === null || hour === undefined) return '9:00 am';
  if (hour === 0) return '12:00 am';
  if (hour === 12) return '12:00 pm';
  return hour < 12 ? `${hour}:00 am` : `${hour - 12}:00 pm`;
}

function sortedDesc(values) {
  return [...new Set(values)].sort((a, b) => b - a);
}

function sameOffsets(a = [], b = []) {
  const first = sortedDesc(a);
  const second = sortedDesc(b);
  return first.length === second.length && first.every((value, i) => value === second[i]);
}

function Checkbox({ id, label, checked, onChange, disabled }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors',
        checked
          ? 'border-primary-300 bg-primary-50/60 dark:border-primary-500/40 dark:bg-primary-500/10'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
    </label>
  );
}

/**
 * Reminder settings: where reminders go, and how far ahead they are sent.
 *
 * An offset is "days before expiry": `[7, 1, 0]` means a week before, a day
 * before, and on the day itself. Every category gets its own schedule (an
 * annual fee wants a month's notice; a domain renewal wants a week), with a
 * `default` row covering anything not set explicitly.
 *
 * Offsets already saved that are not one of the presets stay on screen as their
 * own checkbox, so editing the email can never silently drop a schedule set
 * elsewhere - through the API or an environment variable.
 */
export default function Settings() {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [loaded, setLoaded] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [email, setEmail] = useState('');
  const [offsets, setOffsets] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // Non-preset offsets per key, so nothing already stored gets lost.
  const extraOffsets = useRef({});

  const applySettings = useCallback((settings) => {
    setLoaded(settings);
    setEmail(settings.reminderEmail || '');

    const next = {};
    const extras = {};
    for (const [key, values] of Object.entries(settings.reminders)) {
      next[key] = sortedDesc(values);
      extras[key] = values.filter((value) => !PRESET_OFFSETS.includes(value));
    }
    setOffsets(next);
    extraOffsets.current = extras;
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settings, catalogue] = await Promise.all([getSettings(), getCategories()]);
      applySettings(settings);
      setCategories(catalogue);
      setLoadError(null);
    } catch (requestError) {
      const apiError = getApiError(requestError);
      if (!apiError.isUnauthorized) setLoadError(apiError);
    } finally {
      setIsLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * The rows to render: the fallback first, then one per category the server
   * knows about. Built from the catalogue rather than from the settings keys so
   * a category added on the backend appears here immediately.
   */
  const rows = useMemo(
    () => [
      {
        key: DEFAULT_KEY,
        label: 'Every other category',
        icon: Bell,
        description: 'Used for any category without its own schedule below.',
      },
      ...categories.map((category) => ({
        key: category.key,
        label: category.plural,
        icon: categoryIcon(category.icon),
        description: category.description,
      })),
    ],
    [categories],
  );

  const optionsFor = (key) =>
    sortedDesc([...PRESET_OFFSETS, ...(extraOffsets.current[key] || [])]);

  const toggle = (key, offset, checked) => {
    setOffsets((current) => {
      const existing = current[key] || [];
      return {
        ...current,
        [key]: checked
          ? sortedDesc([...existing, offset])
          : existing.filter((value) => value !== offset),
      };
    });
    setSavedAt(null);
  };

  const isDirty = useMemo(() => {
    if (!loaded) return false;
    if (email.trim() !== (loaded.reminderEmail || '')) return true;
    return Object.keys(offsets).some(
      (key) => !sameOffsets(offsets[key], loaded.reminders[key]),
    );
  }, [loaded, email, offsets]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    setFieldErrors({});
    setSaveError(null);
    setSavedAt(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setFieldErrors({ reminder_email: 'Enter the address reminders should go to.' });
      return;
    }

    if (!isOnline) {
      setSaveError("You're offline. Reconnect to save your settings.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateSettings({
        reminderEmail: trimmed,
        reminders: offsets,
      });
      applySettings(updated);
      setSavedAt(updated.updatedAt || new Date().toISOString());
      toast.success('Settings saved successfully.');
    } catch (requestError) {
      const apiError = getApiError(requestError);
      const fields = getFieldErrors(requestError);
      setFieldErrors(fields);
      // A field-level message is already shown next to the input.
      if (!Object.keys(fields).length) setSaveError(apiError.message);
      else if (apiError.code !== ERROR_CODE.VALIDATION_ERROR) {
        setSaveError(apiError.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <header className="mb-5">
          <Skeleton className="h-7 w-40" />
        </header>
        <SkeletonGroup label="Loading settings" className="grid gap-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="surface p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <Skeleton className="h-8 w-8" rounded="rounded-lg" />
                <Skeleton className="h-3.5 w-36" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-12" rounded="rounded-xl" />
                <Skeleton className="h-12" rounded="rounded-xl" />
              </div>
            </div>
          ))}
        </SkeletonGroup>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Settings
          </h1>
        </header>
        <ErrorState
          title="We couldn't load your settings."
          description={loadError.message}
          onRetry={load}
          offline={loadError.code === ERROR_CODE.OFFLINE}
        />
      </>
    );
  }

  const delivery = loaded?.delivery;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose where reminders go and how far ahead they are sent.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {saveError ? <Alert variant="error">{saveError}</Alert> : null}
        {savedAt ? <Alert variant="success">Settings saved successfully.</Alert> : null}

        <SectionCard icon={Mail} title="Reminder Email">
          <Input
            id="reminder-email"
            name="reminderEmail"
            type="email"
            label="Reminder Email"
            labelHidden
            placeholder="example@gmail.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSavedAt(null);
            }}
            error={fieldErrors.reminder_email}
            hint={
              fieldErrors.reminder_email
                ? undefined
                : 'Expiry reminders for every item are sent to this address.'
            }
            icon={Mail}
            autoComplete="email"
            inputMode="email"
            disabled={isSaving}
            required
          />

          {delivery && !delivery.emailConfigured ? (
            <Alert variant="warning" className="mt-3">
              The server has no mail credentials set, so nothing can be emailed
              yet. The app will still show you what is expiring.
            </Alert>
          ) : null}
        </SectionCard>

        {rows.map(({ key, label, icon: Icon, description }) => {
          const selected = offsets[key] || [];
          return (
            <SectionCard key={key} icon={Icon} title={label}>
              <fieldset>
                <legend className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                  {description}
                </legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {optionsFor(key).map((offset) => (
                    <Checkbox
                      key={offset}
                      id={`${key}-${offset}`}
                      label={offsetLabel(offset)}
                      checked={selected.includes(offset)}
                      onChange={(checked) => toggle(key, offset, checked)}
                      disabled={isSaving}
                    />
                  ))}
                </div>
              </fieldset>

              {selected.length === 0 ? (
                <Alert variant="warning" className="mt-3">
                  No reminders will be sent for {label.toLowerCase()}.
                </Alert>
              ) : null}
            </SectionCard>
          );
        })}

        <SectionCard icon={Server} title="How reminders are sent">
          <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            There is no background worker and nothing on the server runs on a
            timer. An external pinger calls the API, and the first call at or
            after {formatHour(delivery?.reminderHour)} each day checks every
            date and emails whatever is due. Calling it more often is harmless
            - it does the work once a day and nothing the rest of the time.
          </p>

          {delivery && !delivery.cronConfigured ? (
            <Alert variant="warning" className="mb-4">
              The daily job is not set up, so nothing is emailed automatically.
              Reminders only go out when you press &ldquo;Send Due Now&rdquo; on
              the Reminders screen. See <code>script.txt</code> in the backend
              for the setup.
            </Alert>
          ) : null}

          <DetailList
            items={[
              {
                label: 'Daily check',
                value: delivery?.cronConfigured
                  ? `${formatHour(delivery.reminderHour)}, every day`
                  : 'Not scheduled',
              },
              {
                // The one line that reveals a pinger which has stopped firing,
                // so it says "Never" rather than the generic "Not set".
                label: 'Last ran',
                value: formatDateTime(delivery?.sweep?.lastRunAt, 'Never'),
              },
              {
                label: 'Expiring soon window',
                value: delivery ? `${delivery.expiringSoonDays} days` : null,
              },
              { label: 'Timezone', value: delivery?.timezone },
            ]}
          />
        </SectionCard>

        <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            {loaded?.updatedAt
              ? `Last saved ${formatDateTime(loaded.updatedAt)}`
              : 'Using the server defaults'}
          </p>

          <Button
            type="submit"
            icon={Save}
            loading={isSaving}
            disabled={!isDirty}
            className="ml-auto"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </>
  );
}
