/**
 * Turns any Axios/network failure into something safe to put on screen.
 *
 * The backend answers with a stable envelope:
 *
 *   { "success": false, "error": { "code": "...", "message": "...", "details": {...} } }
 *
 * Rules applied here:
 *  - a known error code maps to our own wording;
 *  - the server message is only shown for codes where it adds real detail and
 *    is known to be user-safe (it never contains credentials or upstream
 *    payloads - see `core/errors.py`);
 *  - anything unrecognised, and every 5xx, falls back to a generic sentence so
 *    stack traces or internal messages can never reach the UI.
 */

export const ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  CSRF_FAILED: 'CSRF_FAILED',
  AUTH_NOT_CONFIGURED: 'AUTH_NOT_CONFIGURED',

  INVALID_VEHICLE_NUMBER: 'INVALID_VEHICLE_NUMBER',
  VEHICLE_ALREADY_EXISTS: 'VEHICLE_ALREADY_EXISTS',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',

  VEHICLE_API_TIMEOUT: 'VEHICLE_API_TIMEOUT',
  VEHICLE_API_UNAVAILABLE: 'VEHICLE_API_UNAVAILABLE',
  VEHICLE_API_ERROR: 'VEHICLE_API_ERROR',
  VEHICLE_API_RATE_LIMITED: 'VEHICLE_API_RATE_LIMITED',
  VEHICLE_API_INVALID_RESPONSE: 'VEHICLE_API_INVALID_RESPONSE',
  VEHICLE_API_NOT_CONFIGURED: 'VEHICLE_API_NOT_CONFIGURED',
  VEHICLE_NOT_FOUND_UPSTREAM: 'VEHICLE_NOT_FOUND_UPSTREAM',

  QUEUE_UNAVAILABLE: 'QUEUE_UNAVAILABLE',
  EMAIL_NOT_CONFIGURED: 'EMAIL_NOT_CONFIGURED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',

  // Client-side only.
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN',
};

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const CODE_MESSAGES = {
  [ERROR_CODE.INVALID_CREDENTIALS]: 'Incorrect username or password.',
  [ERROR_CODE.AUTHENTICATION_REQUIRED]:
    'Your session has expired. Please sign in again.',
  [ERROR_CODE.TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ERROR_CODE.TOKEN_INVALID]: 'Your session is no longer valid. Please sign in again.',
  [ERROR_CODE.CSRF_FAILED]:
    'Your session could not be verified. Please sign in again.',
  [ERROR_CODE.AUTH_NOT_CONFIGURED]:
    'Sign-in is not configured on the server yet. Please check the backend setup.',

  [ERROR_CODE.VALIDATION_ERROR]: 'Please check the highlighted fields and try again.',
  [ERROR_CODE.NOT_FOUND]: 'We could not find what you were looking for.',
  [ERROR_CODE.RATE_LIMITED]: 'Too many requests. Please try again shortly.',
  [ERROR_CODE.INTERNAL_ERROR]: 'Something went wrong on the server.',

  [ERROR_CODE.VEHICLE_NOT_FOUND]: 'This vehicle is no longer available.',
  [ERROR_CODE.JOB_NOT_FOUND]:
    'We lost track of that background job. Please try again.',

  [ERROR_CODE.VEHICLE_API_TIMEOUT]:
    'The vehicle information service took too long to respond. Please try again.',
  [ERROR_CODE.VEHICLE_API_UNAVAILABLE]:
    'The vehicle information service is unavailable right now. Please try again later.',
  [ERROR_CODE.VEHICLE_API_ERROR]:
    'The vehicle information service could not complete the request.',
  [ERROR_CODE.VEHICLE_API_RATE_LIMITED]:
    'The vehicle information service is rate limiting requests. Please try again in a few minutes.',
  [ERROR_CODE.VEHICLE_API_INVALID_RESPONSE]:
    'The vehicle information service returned data we could not read.',
  [ERROR_CODE.VEHICLE_API_NOT_CONFIGURED]:
    'The vehicle information service is not configured on the server.',
  [ERROR_CODE.VEHICLE_NOT_FOUND_UPSTREAM]:
    'No records were found for this registration number. Please check it and try again.',

  [ERROR_CODE.QUEUE_UNAVAILABLE]:
    'The background worker is unavailable, so this could not be queued. Please try again shortly.',
  [ERROR_CODE.EMAIL_NOT_CONFIGURED]:
    'Email reminders are not configured on the server yet.',
  [ERROR_CODE.EMAIL_SEND_FAILED]: 'The reminder email could not be sent.',
  [ERROR_CODE.DATABASE_UNAVAILABLE]:
    'The server cannot reach its database right now. Please try again shortly.',

  [ERROR_CODE.NETWORK_ERROR]: 'Unable to connect to the server.',
  [ERROR_CODE.TIMEOUT]: 'The server took too long to respond. Please try again.',
  [ERROR_CODE.OFFLINE]: "You're offline. Reconnect and try again.",
};

const STATUS_MESSAGES = {
  400: 'That request could not be processed. Please check your input.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  405: 'That action is not supported.',
  409: 'That conflicts with something that already exists.',
  429: 'Too many requests. Please try again shortly.',
  500: 'Something went wrong on the server.',
  502: 'The server is temporarily unreachable. Please try again shortly.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The server took too long to respond. Please try again.',
};

/**
 * Codes whose server message is more specific than anything we could write
 * here (it names the vehicle or the offending value) and is safe to display.
 */
const PREFER_SERVER_MESSAGE = new Set([
  ERROR_CODE.INVALID_VEHICLE_NUMBER,
  ERROR_CODE.VEHICLE_ALREADY_EXISTS,
]);

function isPlainMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
}

/**
 * Normalises an error into `{ code, message, status, details, ... }`.
 * Safe to call with anything - including a plain `Error` or `undefined`.
 */
export function getApiError(error) {
  // No response at all: offline, DNS failure, CORS, or a hard timeout.
  if (error && !error.response) {
    const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const code = isTimeout
      ? ERROR_CODE.TIMEOUT
      : offline
        ? ERROR_CODE.OFFLINE
        : ERROR_CODE.NETWORK_ERROR;

    return {
      code,
      message: CODE_MESSAGES[code],
      status: 0,
      details: null,
      isNetworkError: !isTimeout,
      isTimeout,
      isUnauthorized: false,
    };
  }

  const status = error?.response?.status ?? 0;
  const payload = error?.response?.data;
  const serverError = payload && typeof payload === 'object' ? payload.error : null;
  const code = serverError?.code || STATUS_TO_CODE[status] || ERROR_CODE.UNKNOWN;

  let message;
  if (PREFER_SERVER_MESSAGE.has(code) && isPlainMessage(serverError?.message)) {
    message = serverError.message;
  } else if (CODE_MESSAGES[code]) {
    message = CODE_MESSAGES[code];
  } else if (STATUS_MESSAGES[status]) {
    message = STATUS_MESSAGES[status];
  } else {
    message = GENERIC_MESSAGE;
  }

  return {
    code,
    message,
    status,
    details: serverError?.details ?? null,
    isNetworkError: false,
    isTimeout: false,
    isUnauthorized: status === 401,
  };
}

const STATUS_TO_CODE = {
  400: ERROR_CODE.VALIDATION_ERROR,
  401: ERROR_CODE.AUTHENTICATION_REQUIRED,
  403: ERROR_CODE.AUTHENTICATION_REQUIRED,
  404: ERROR_CODE.NOT_FOUND,
  429: ERROR_CODE.RATE_LIMITED,
  500: ERROR_CODE.INTERNAL_ERROR,
};

/** Convenience wrapper: the message only. */
export function getErrorMessage(error) {
  return getApiError(error).message;
}

/**
 * Flattens DRF validation details into `{ fieldName: 'first message' }` so a
 * form can show the error next to the offending input.
 */
export function getFieldErrors(error) {
  const { details } = getApiError(error);
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};

  const result = {};
  for (const [field, value] of Object.entries(details)) {
    if (typeof value === 'string') result[field] = value;
    else if (Array.isArray(value) && value.length) result[field] = String(value[0]);
    else if (value && typeof value === 'object') {
      const nested = Object.values(value).flat();
      if (nested.length) result[field] = String(nested[0]);
    }
  }
  return result;
}

/**
 * A friendly sentence for a background job that ended in `failed`.
 * Job records carry `error_code` plus a safe `error` message.
 */
export function getJobErrorMessage(job) {
  if (!job) return CODE_MESSAGES[ERROR_CODE.VEHICLE_API_ERROR];
  if (job.errorCode && CODE_MESSAGES[job.errorCode]) return CODE_MESSAGES[job.errorCode];
  if (isPlainMessage(job.error)) return job.error;
  return CODE_MESSAGES[ERROR_CODE.VEHICLE_API_ERROR];
}
