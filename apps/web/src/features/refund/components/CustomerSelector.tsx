import type { Customer } from '../../../types';
import type { Resource } from '../../../lib/useResource';
import { loadErrorMessage } from '../messages';

interface Props {
  customers: Resource<Customer[]>;
  value: string;
  onChange: (customerId: string) => void;
  onRetry: () => void;
  disabled: boolean;
}

export function CustomerSelector({ customers, value, onChange, onRetry, disabled }: Props) {
  if (customers.status === 'error') {
    return (
      <div className="field">
        <span className="field-label">Customer</span>
        <div className="inline-alert" role="alert">
          <p>{loadErrorMessage(customers.error, 'customers')}</p>
          <button type="button" className="button-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const list = customers.status === 'ready' ? customers.data : [];
  const loading = customers.status !== 'ready';
  const selected = list.find((c) => c._id === value);

  return (
    <div className="field">
      <label htmlFor="customer" className="field-label">
        Customer
      </label>
      <select
        id="customer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-describedby={selected ? 'customer-email' : undefined}
      >
        <option value="">{loading ? 'Loading customers…' : 'Select a customer'}</option>
        {list.map((customer) => (
          <option key={customer._id} value={customer._id}>
            {customer.name}
          </option>
        ))}
      </select>
      {selected && (
        <p id="customer-email" className="field-hint">
          Requesting as <strong>{selected.name}</strong> · {selected.email}
        </p>
      )}
    </div>
  );
}
