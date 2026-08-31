/**
 * A small toast store. No dependency needed: a list in state, a portal to
 * render it (see `components/common/Toast.jsx`) and auto-dismiss timers that
 * are cleared on unmount.
 *
 * The actions and the list live in *separate* contexts on purpose. Components
 * that only fire toasts subscribe to the actions, whose identity never
 * changes - otherwise every toast would change the context value, and any
 * `useCallback`/`useEffect` that depends on `useToast()` would re-run. A data
 * loader keyed on that would refetch every time a toast appeared.
 */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const TOAST_VARIANT = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

const DEFAULT_DURATION = 4500;
/** Errors stay a little longer - they usually carry an action to take. */
const ERROR_DURATION = 7000;
const MAX_VISIBLE = 4;

/** Stable `{ success, error, warning, info, dismiss }`. */
export const ToastContext = createContext(null);
/** The current toasts, for the viewport only. */
export const ToastListContext = createContext([]);

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant, message, options = {}) => {
      if (!message) return null;
      nextId += 1;
      const id = nextId;
      const duration =
        options.duration ??
        (variant === TOAST_VARIANT.ERROR ? ERROR_DURATION : DEFAULT_DURATION);

      setToasts((current) => {
        const next = [...current, { id, variant, message, title: options.title }];
        // Keep the newest few so a burst of errors cannot bury the screen.
        return next.slice(-MAX_VISIBLE);
      });

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // `push` and `dismiss` are stable, so this object is created exactly once.
  const actions = useMemo(
    () => ({
      dismiss,
      success: (message, options) => push(TOAST_VARIANT.SUCCESS, message, options),
      error: (message, options) => push(TOAST_VARIANT.ERROR, message, options),
      warning: (message, options) => push(TOAST_VARIANT.WARNING, message, options),
      info: (message, options) => push(TOAST_VARIANT.INFO, message, options),
    }),
    [dismiss, push],
  );

  return (
    <ToastContext.Provider value={actions}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastContext.Provider>
  );
}
