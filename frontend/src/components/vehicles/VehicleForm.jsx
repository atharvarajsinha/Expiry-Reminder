import { useState } from 'react';
import { Search } from 'lucide-react';

import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { normalizeVehicleNumber, vehicleNumberError } from '../../utils/vehicle.js';

/**
 * The add-vehicle form: one registration number.
 *
 * Input is normalised as it is typed (`up25 ak 4922` becomes `UP25AK4922`), and
 * checked against the same patterns the backend uses so an obvious typo is
 * caught before a job is queued. The backend still re-validates - this is
 * convenience, not authority.
 *
 * The submit button is disabled while a request is in flight, which is what
 * stops a double-click from queueing two jobs.
 */
export function VehicleForm({
  onSubmit,
  isSubmitting = false,
  disabled = false,
  initialValue = '',
  inputRef,
}) {
  // Seeded so "Try Again" after a failed job does not make the user retype.
  const [value, setValue] = useState(() => normalizeVehicleNumber(initialValue));
  const [error, setError] = useState(null);

  const onChange = (event) => {
    setValue(normalizeVehicleNumber(event.target.value));
    if (error) setError(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting || disabled) return;

    const normalized = normalizeVehicleNumber(value);
    const validationError = vehicleNumberError(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSubmit(normalized);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Input
        ref={inputRef}
        id="vehicle-no"
        name="vehicleNo"
        label="Vehicle Registration Number"
        placeholder="UP25AK4922"
        value={value}
        onChange={onChange}
        error={error}
        hint={error ? undefined : 'Spaces and dashes are removed automatically.'}
        icon={Search}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck="false"
        inputMode="text"
        maxLength={16}
        disabled={isSubmitting || disabled}
        className="font-mono uppercase tracking-wider"
        required
      />

      <Button
        type="submit"
        fullWidth
        loading={isSubmitting}
        disabled={disabled}
        size="md"
      >
        {isSubmitting ? 'Creating fetch job...' : 'Fetch Vehicle Details'}
      </Button>
    </form>
  );
}
