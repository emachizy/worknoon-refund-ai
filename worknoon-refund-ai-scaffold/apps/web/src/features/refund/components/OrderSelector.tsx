import { forwardRef } from 'react';
import { formatCurrency, formatDate } from '../../../lib/format';
import type { Order } from '../../../types';
import type { Resource } from '../useResource';
import { loadErrorMessage } from '../messages';

interface Props {
  orders: Resource<Order[]>;
  value: string | null;
  onChange: (orderNumber: string) => void;
  onRetry: () => void;
  disabled: boolean;
  error?: string;
}

/** Orders as a radio-card group: native radios give keyboard (arrow key) navigation and labels for free. */
export const OrderSelector = forwardRef<HTMLFieldSetElement, Props>(function OrderSelector(
  { orders, value, onChange, onRetry, disabled, error },
  ref
) {
  return (
    <fieldset className="field order-fieldset" ref={ref} tabIndex={-1} aria-describedby={error ? 'order-error' : undefined}>
      <legend className="field-label">Order</legend>
      <OrderOptions orders={orders} value={value} onChange={onChange} onRetry={onRetry} disabled={disabled} />
      {error && (
        <p id="order-error" className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
});

function OrderOptions({ orders, value, onChange, onRetry, disabled }: Omit<Props, 'error'>) {
  switch (orders.status) {
    case 'idle':
      return <p className="field-hint">Select a customer to see their orders.</p>;
    case 'loading':
      return (
        <div className="order-list" aria-busy="true">
          <p className="visually-hidden" role="status">
            Loading orders…
          </p>
          <div className="order-skeleton" aria-hidden="true" />
          <div className="order-skeleton" aria-hidden="true" />
        </div>
      );
    case 'error':
      return (
        <div className="inline-alert" role="alert">
          <p>{loadErrorMessage(orders.error, 'orders')}</p>
          <button type="button" className="button-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      );
    case 'ready':
      if (orders.data.length === 0) return <p className="field-hint">This customer has no orders.</p>;
      return (
        <div className="order-list">
          {orders.data.map((order) => {
            const selected = order.orderNumber === value;
            return (
              <label key={order._id} className="order-option">
                <input
                  type="radio"
                  name="order"
                  className="visually-hidden"
                  value={order.orderNumber}
                  checked={selected}
                  onChange={() => onChange(order.orderNumber)}
                  disabled={disabled}
                />
                <span className="order-card">
                  <span className="order-card-main">
                    <span className="order-item">{order.itemName}</span>
                    <span className="order-meta">
                      {order.orderNumber} · Ordered {formatDate(order.orderedAt)}
                    </span>
                  </span>
                  <span className="order-card-side">
                    <span className="order-price">{formatCurrency(order.total, order.currency)}</span>
                    {order.isFinalSale && <span className="tag">Final sale</span>}
                  </span>
                  <span className="order-check" aria-hidden="true">
                    {selected ? '✓ Selected' : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      );
  }
}
