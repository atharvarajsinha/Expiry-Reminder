import { useRef } from 'react';

import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';

/**
 * Confirmation for a destructive action.
 *
 * Focus lands on Cancel rather than the destructive button, so a stray Enter
 * or Space cannot delete anything. The dialog stays open and non-dismissible
 * while the request is in flight.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  children,
}) {
  const cancelRef = useRef(null);

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      size="sm"
      dismissible={!loading}
      initialFocusRef={cancelRef}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="sm:w-auto"
            fullWidth
          >
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading} fullWidth>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </Modal>
  );
}
