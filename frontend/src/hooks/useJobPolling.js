/**
 * Polls a background job until it finishes.
 *
 *   const { job, status, error, isPolling, attempts } = useJobPolling(jobId, {
 *     onComplete: (job) => ...,
 *     onError: (message, job) => ...,
 *   });
 *
 * Guarantees:
 *  - one loop per job, never two. The next request is only scheduled *after*
 *    the previous one settles (a `setTimeout` chain rather than `setInterval`,
 *    which would fire again while a slow request is still in flight);
 *  - stops on `completed`, on `failed`, on a fatal HTTP error, after too many
 *    consecutive network failures, and on an overall timeout;
 *  - clears its timer and ignores late responses on unmount or when `jobId`
 *    changes, so callbacks never fire for a job the UI has moved on from;
 *  - transient network blips are retried instead of failing the job - the
 *    Celery worker keeps going regardless of what the browser can reach.
 *
 * Pass `jobId = null` (or `enabled: false`) to idle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { JOB_STATUS, getJob } from '../api/jobs.js';
import { getApiError, getJobErrorMessage } from '../utils/errors.js';

const DEFAULT_INTERVAL_MS = Number(import.meta.env.VITE_JOB_POLL_INTERVAL_MS) || 2500;
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_JOB_POLL_TIMEOUT_MS) || 300000;

/** After this long, poll half as often - the job is clearly a slow one. */
const SLOW_JOB_AFTER_MS = 60000;
const MAX_CONSECUTIVE_FAILURES = 5;

const TIMEOUT_MESSAGE =
  'This is taking longer than expected. The update may still finish in the ' +
  'background - please check again in a few minutes.';

export function useJobPolling(jobId, options = {}) {
  const {
    onComplete,
    onError,
    interval = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    enabled = true,
  } = options;

  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // Callbacks live in a ref so a parent re-render cannot restart the loop.
  const callbacks = useRef({ onComplete, onError });
  useEffect(() => {
    callbacks.current = { onComplete, onError };
  }, [onComplete, onError]);

  useEffect(() => {
    // Reset whenever we switch jobs so stale state is never shown.
    setJob(null);
    setError(null);
    setAttempts(0);

    if (!jobId || !enabled) {
      setIsPolling(false);
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let failures = 0;
    const startedAt = Date.now();

    setIsPolling(true);

    const finish = (invoke) => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setIsPolling(false);
      invoke?.();
    };

    const fail = (message, failedJob) => {
      setError(message);
      finish(() => callbacks.current.onError?.(message, failedJob ?? null));
    };

    const poll = async () => {
      if (cancelled) return;
      setAttempts((count) => count + 1);

      try {
        const next = await getJob(jobId);
        if (cancelled) return;
        failures = 0;
        setJob(next);

        if (next.status === JOB_STATUS.COMPLETED) {
          finish(() => callbacks.current.onComplete?.(next));
          return;
        }
        if (next.status === JOB_STATUS.FAILED) {
          fail(getJobErrorMessage(next), next);
          return;
        }
      } catch (requestError) {
        if (cancelled) return;
        const apiError = getApiError(requestError);
        failures += 1;

        // 404: the job record is gone. 401/403: the session or CSRF token is
        // no longer valid and the API client is already handling it. Neither
        // gets better by asking again.
        const fatal = [401, 403, 404].includes(apiError.status);
        if (fatal || failures >= MAX_CONSECUTIVE_FAILURES) {
          fail(apiError.message, null);
          return;
        }
      }

      if (Date.now() - startedAt > timeoutMs) {
        fail(TIMEOUT_MESSAGE, null);
        return;
      }

      const elapsed = Date.now() - startedAt;
      const delay = elapsed > SLOW_JOB_AFTER_MS ? interval * 2 : interval;
      timer = setTimeout(poll, delay);
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, enabled, interval, timeoutMs]);

  /**
   * The status to render. Before the first response arrives we already know
   * the job was accepted as `queued`, because that is what the POST returned.
   */
  const status = job?.status ?? (jobId && enabled ? JOB_STATUS.QUEUED : 'idle');

  return { job, status, error, isPolling, attempts };
}

/**
 * Shared plumbing for "start an async job, poll it, then reload".
 *
 * Used by both the vehicle refresh buttons and the add-vehicle flow: it holds
 * the job id, prevents a second start while one is already running, and clears
 * itself when the job settles.
 */
export function useAsyncJob({ onComplete, onError } = {}) {
  const [jobId, setJobId] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [context, setContext] = useState(null);

  const handleComplete = useCallback(
    (finishedJob) => {
      setJobId(null);
      onComplete?.(finishedJob, context);
      setContext(null);
    },
    [onComplete, context],
  );

  const handleError = useCallback(
    (message, failedJob) => {
      setJobId(null);
      onError?.(message, failedJob, context);
      setContext(null);
    },
    [onError, context],
  );

  const { job, status, isPolling, attempts } = useJobPolling(jobId, {
    onComplete: handleComplete,
    onError: handleError,
  });

  /**
   * `start(() => api.refreshVehicle(id), { vehicleId: id })`
   *
   * Returns the job, or `null` when a job is already running or the request
   * failed (the caller reports the error - it has the user-facing context).
   */
  const start = useCallback(
    async (request, meta = null) => {
      if (jobId || isStarting) return null;
      setIsStarting(true);
      // Set before awaiting so the UI can show which row is busy straight away.
      setContext(meta);
      try {
        const started = await request();
        setJobId(started.jobId);
        return started;
      } catch (error) {
        setContext(null);
        throw error;
      } finally {
        setIsStarting(false);
      }
    },
    [jobId, isStarting],
  );

  return {
    start,
    jobId,
    job,
    status,
    context,
    attempts,
    isStarting,
    isRunning: Boolean(jobId) || isStarting || isPolling,
  };
}
