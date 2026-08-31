import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

import { VehicleFetchProgress } from './VehicleFetchProgress.jsx';
import { VehicleForm } from './VehicleForm.jsx';
import { Alert } from '../common/Alert.jsx';
import { Button } from '../common/Button.jsx';
import { Modal } from '../common/Modal.jsx';
import { fetchVehicle } from '../../api/vehicles.js';
import { useAsyncJob } from '../../hooks/useJobPolling.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { useToast } from '../../hooks/useToast.js';
import { ERROR_CODE, getApiError } from '../../utils/errors.js';

const PHASE = {
  FORM: 'form',
  WORKING: 'working',
  DONE: 'done',
  FAILED: 'failed',
};

/**
 * The full add-vehicle flow.
 *
 *   POST /vehicles/fetch/  ->  job_id  ->  poll GET /jobs/{id}/  ->  completed
 *
 * The initial POST is never awaited for the upstream lookup: the backend
 * answers 202 immediately and everything after that is polling. The dialog
 * stays put while the job runs (it is what reports the outcome), but
 * "Continue in background" lets the user leave without cancelling the job -
 * Celery keeps working regardless of what this tab does.
 */
export function AddVehicleModal({ open, onClose, onAdded }) {
  const navigate = useNavigate();
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [phase, setPhase] = useState(PHASE.FORM);
  const [vehicleNo, setVehicleNo] = useState('');
  const [formError, setFormError] = useState(null);
  const [jobError, setJobError] = useState(null);
  const [completedJob, setCompletedJob] = useState(null);
  const inputRef = useRef(null);

  const onJobComplete = useCallback(
    (job) => {
      setCompletedJob(job);
      setPhase(PHASE.DONE);
      // Refresh the list behind the dialog so it is correct either way.
      onAdded?.();
    },
    [onAdded],
  );

  const onJobError = useCallback((message) => {
    setJobError(message);
    setPhase(PHASE.FAILED);
  }, []);

  const job = useAsyncJob({ onComplete: onJobComplete, onError: onJobError });

  // Start every opening from a clean slate.
  useEffect(() => {
    if (!open) return;
    setPhase(PHASE.FORM);
    setFormError(null);
    setJobError(null);
    setCompletedJob(null);
  }, [open]);

  const reset = () => {
    setPhase(PHASE.FORM);
    setFormError(null);
    setJobError(null);
    setCompletedJob(null);
  };

  const onSubmit = async (number) => {
    if (!isOnline) {
      toast.error("You're offline. Reconnect to add a vehicle.");
      return;
    }

    setVehicleNo(number);
    setFormError(null);

    try {
      const started = await job.start(() => fetchVehicle(number));
      // `start` returns null when a job is already running - nothing to do.
      if (started) setPhase(PHASE.WORKING);
    } catch (error) {
      const apiError = getApiError(error);
      setFormError({
        message: apiError.message,
        // A 409 tells us which vehicle already holds this number.
        vehicleId:
          apiError.code === ERROR_CODE.VEHICLE_ALREADY_EXISTS
            ? apiError.details?.vehicle_id
            : null,
      });
    }
  };

  const goToVehicle = (id) => {
    onClose?.();
    navigate(`/vehicles/${id}`);
  };

  const onWorkingClose = () => {
    onClose?.();
    toast.info(
      'The vehicle is still being fetched in the background. Refresh the dashboard in a moment.',
    );
  };

  const footer = (() => {
    if (phase === PHASE.WORKING) {
      return (
        <Button variant="ghost" fullWidth onClick={onWorkingClose}>
          Continue in background
        </Button>
      );
    }

    if (phase === PHASE.DONE) {
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={reset} fullWidth>
            Add Another
          </Button>
          {completedJob?.vehicleId ? (
            <Button onClick={() => goToVehicle(completedJob.vehicleId)} fullWidth>
              View Vehicle
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onClose} fullWidth>
              Done
            </Button>
          )}
        </div>
      );
    }

    if (phase === PHASE.FAILED) {
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Close
          </Button>
          <Button onClick={reset} fullWidth>
            Try Again
          </Button>
        </div>
      );
    }

    return null;
  })();

  const titles = {
    [PHASE.FORM]: 'Add Vehicle',
    [PHASE.WORKING]: 'Adding Vehicle',
    [PHASE.DONE]: 'Vehicle Added',
    [PHASE.FAILED]: 'Could Not Add Vehicle',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titles[phase]}
      description={
        phase === PHASE.FORM
          ? 'Enter the registration number and we will fetch the details.'
          : undefined
      }
      // While the job runs the dialog is the only thing reporting progress.
      dismissible={phase !== PHASE.WORKING}
      initialFocusRef={phase === PHASE.FORM ? inputRef : undefined}
      footer={footer}
    >
      {phase === PHASE.FORM ? (
        <div className="space-y-4">
          {formError ? (
            <Alert
              variant="warning"
              action={
                formError.vehicleId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => goToVehicle(formError.vehicleId)}
                  >
                    View Vehicle
                  </Button>
                ) : null
              }
            >
              {formError.message}
            </Alert>
          ) : null}

          <VehicleForm
            inputRef={inputRef}
            initialValue={vehicleNo}
            onSubmit={onSubmit}
            isSubmitting={job.isStarting}
            disabled={!isOnline}
          />

          {!isOnline ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You need a connection to look up a registration number.
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === PHASE.WORKING ? (
        <VehicleFetchProgress
          vehicleNo={vehicleNo}
          status={job.status}
          attempts={job.attempts}
        />
      ) : null}

      {phase === PHASE.DONE ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
            <CheckCircle2
              aria-hidden="true"
              className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
            />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
            Vehicle added successfully.
          </p>
          <p className="mt-1 font-mono text-sm tracking-wide text-slate-500 dark:text-slate-400">
            {completedJob?.vehicleNo || vehicleNo}
          </p>
        </div>
      ) : null}

      {phase === PHASE.FAILED ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10">
            <XCircle
              aria-hidden="true"
              className="h-7 w-7 text-red-600 dark:text-red-400"
            />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
            Unable to fetch vehicle details.
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {jobError}
          </p>
          {vehicleNo ? (
            <p className="mt-3 font-mono text-sm tracking-wide text-slate-400 dark:text-slate-500">
              {vehicleNo}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
