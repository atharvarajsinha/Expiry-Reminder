import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, RefreshCw } from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { JobList, JobListSkeleton } from '../components/jobs/JobList.jsx';
import { getJobs, isActiveJob } from '../api/jobs.js';
import { ERROR_CODE, getApiError } from '../utils/errors.js';

const PAGE_SIZE = 25;
/** How often to re-check while something is still running. */
const LIVE_REFRESH_MS = 5000;

/**
 * Recent background jobs - the vehicle fetches and refreshes handled by Celery.
 *
 * The list refreshes itself only while at least one job is `queued` or
 * `processing`; once everything has settled the polling stops and the page
 * sits still until the user asks for more. That keeps a parked tab from
 * hammering the API.
 */
export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState(null);

  const inFlight = useRef(false);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (initial) setIsLoading(true);
    else setIsReloading(true);

    try {
      const list = await getJobs({ limit: PAGE_SIZE });
      setJobs(list);
      setError(null);
    } catch (requestError) {
      const apiError = getApiError(requestError);
      if (!apiError.isUnauthorized) setError(apiError);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
      setIsReloading(false);
    }
  }, []);

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const activeCount = useMemo(() => jobs.filter(isActiveJob).length, [jobs]);

  // One pending timer at a time; it stops scheduling as soon as nothing is active.
  useEffect(() => {
    if (!activeCount) return undefined;
    const timer = setTimeout(() => load(), LIVE_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [activeCount, jobs, load]);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Background Jobs
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Vehicle lookups and refreshes run in the background - here is what has run.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeCount ? (
            <span className="inline-flex items-center gap-2 text-sm text-primary-700 dark:text-primary-300">
              <Spinner size="xs" />
              {activeCount} running
            </span>
          ) : null}

          <Button
            variant="secondary"
            iconOnly
            icon={RefreshCw}
            loading={isReloading}
            onClick={() => load()}
            aria-label="Reload jobs"
            title="Reload jobs"
          />
        </div>
      </header>

      {isLoading ? (
        <JobListSkeleton count={3} />
      ) : error ? (
        <ErrorState
          title="We couldn't load your jobs."
          description={error.message}
          onRetry={() => load({ initial: true })}
          isRetrying={isReloading}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No background jobs yet."
          description="Adding or refreshing a vehicle queues a job, and it will show up here with its progress."
        />
      ) : (
        <JobList jobs={jobs} />
      )}
    </>
  );
}
