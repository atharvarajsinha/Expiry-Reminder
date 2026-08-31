import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarClock, History, Mail, RefreshCw, Send } from 'lucide-react';

import { Alert } from '../components/common/Alert.jsx';
import { Button } from '../components/common/Button.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import {
  ReminderHistoryList,
  ReminderListSkeleton,
  UpcomingReminderList,
} from '../components/reminders/ReminderList.jsx';
import { getReminders, runReminderCheck } from '../api/reminders.js';
import { getSettings } from '../api/settings.js';
import { getVehicles } from '../api/vehicles.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useToast } from '../hooks/useToast.js';
import { cn } from '../utils/cn.js';
import { ERROR_CODE, getApiError } from '../utils/errors.js';
import { upcomingReminders } from '../utils/reminders.js';

const VIEWS = [
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock },
  { key: 'history', label: 'History', icon: History },
];

/**
 * What reminders are coming, and what has already gone out.
 *
 * Two different sources, deliberately kept apart:
 *  - **Upcoming** is derived on the client from each vehicle's expiry dates and
 *    the configured offsets, because the backend only writes a reminder record
 *    once the daily sweep claims it - there is nothing to read beforehand.
 *  - **History** is the real record from `GET /api/reminders/`, including
 *    delivery failures.
 */
export default function RemindersPage() {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [view, setView] = useState('upcoming');
  const [settings, setSettings] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (initial) setIsLoading(true);
    else setIsReloading(true);

    try {
      // One round trip each, in parallel - none of them depends on the others.
      const [nextSettings, nextVehicles, nextHistory] = await Promise.all([
        getSettings(),
        getVehicles(),
        getReminders({ limit: 50 }),
      ]);
      setSettings(nextSettings);
      setVehicles(nextVehicles);
      setHistory(nextHistory);
      setError(null);
    } catch (requestError) {
      const apiError = getApiError(requestError);
      if (!apiError.isUnauthorized) setError(apiError);
    } finally {
      setIsLoading(false);
      setIsReloading(false);
    }
  }, []);

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const upcoming = useMemo(
    () => upcomingReminders(vehicles, settings?.reminders),
    [vehicles, settings],
  );

  const onRunNow = async () => {
    if (!isOnline) {
      toast.error("You're offline. Reconnect to run the reminder check.");
      setIsConfirmOpen(false);
      return;
    }

    setIsRunning(true);
    try {
      await runReminderCheck();
      toast.success(
        'Reminder check queued. Any reminder due today will be emailed shortly.',
      );
      setIsConfirmOpen(false);
      // The sweep runs in the worker; give it a moment before re-reading.
      setTimeout(() => load(), 3000);
    } catch (requestError) {
      toast.error(getApiError(requestError).message);
    } finally {
      setIsRunning(false);
    }
  };

  const activeList = view === 'upcoming' ? upcoming : history;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Reminders
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            When expiry emails go out, and which ones already have.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            iconOnly
            icon={RefreshCw}
            loading={isReloading}
            onClick={() => load()}
            aria-label="Reload reminders"
            title="Reload reminders"
          />
          <Button
            variant="secondary"
            icon={Send}
            onClick={() => setIsConfirmOpen(true)}
            disabled={isLoading || Boolean(error)}
          >
            Send Due Now
          </Button>
        </div>
      </header>

      {!isLoading && !error ? (
        <div className="surface mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 p-4 text-sm">
          <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-slate-500 dark:text-slate-400">Reminders are sent to</span>
          <span className="font-medium text-slate-900 dark:text-white">
            {settings?.reminderEmail || 'no address configured'}
          </span>
          <Link
            to="/settings"
            className="ml-auto font-medium text-primary-700 hover:underline dark:text-primary-300"
          >
            Change
          </Link>
        </div>
      ) : null}

      {isLoading ? (
        <ReminderListSkeleton count={3} />
      ) : error ? (
        <ErrorState
          title="We couldn't load your reminders."
          description={error.message}
          onRetry={() => load({ initial: true })}
          isRetrying={isReloading}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : (
        <>
          <div
            role="group"
            aria-label="Choose which reminders to show"
            className="mb-4 flex flex-wrap gap-2"
          >
            {VIEWS.map(({ key, label, icon: Icon }) => {
              const isActive = view === key;
              const count = key === 'upcoming' ? upcoming.length : history.length;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                  <span
                    className={cn(
                      'tabular rounded-full px-1.5 text-xs',
                      isActive
                        ? 'bg-white/20'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {view === 'upcoming' ? (
            <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
              Worked out from each vehicle&apos;s expiry dates and your reminder
              settings. Expired documents are not reminded about again.
            </p>
          ) : null}

          {activeList.length === 0 ? (
            view === 'upcoming' ? (
              <EmptyState
                icon={BellRing}
                title="No reminders scheduled."
                description={
                  vehicles.length === 0
                    ? 'Add a vehicle and its insurance and PUC expiry dates will be tracked here.'
                    : 'Nothing is due before your documents expire. Check your reminder offsets in Settings.'
                }
              />
            ) : (
              <EmptyState
                icon={History}
                title="No reminders sent yet."
                description="Once a reminder falls due, the daily check sends it and it will be listed here."
              />
            )
          ) : view === 'upcoming' ? (
            <UpcomingReminderList items={upcoming} />
          ) : (
            <ReminderHistoryList reminders={history} />
          )}
        </>
      )}

      <ConfirmDialog
        open={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={onRunNow}
        title="Send due reminders now?"
        confirmLabel={isRunning ? 'Queueing...' : 'Send Now'}
        variant="primary"
        loading={isRunning}
      >
        <p>
          This runs the daily check immediately and emails any reminder that is due
          today to:
        </p>
        <p className="mt-2 font-medium text-slate-900 dark:text-white">
          {settings?.reminderEmail || 'the configured address'}
        </p>
        <Alert variant="info" className="mt-3">
          Reminders that have already been sent are not sent again, so this is safe to
          run more than once.
        </Alert>
      </ConfirmDialog>
    </>
  );
}
