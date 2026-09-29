import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { CustomerSelector } from '../features/refund/components/CustomerSelector';
import { OrderSelector } from '../features/refund/components/OrderSelector';
import { MESSAGE_MIN_LENGTH, RefundMessageField } from '../features/refund/components/RefundMessageField';
import { RefundResultCard } from '../features/refund/components/RefundResultCard';
import { submitErrorMessage } from '../features/refund/messages';
import { useRefundSubmission, type SubmissionOptions } from '../features/refund/useRefundSubmission';
import { useResource } from '../lib/useResource';

interface FieldErrors {
  order?: string;
  message?: string;
}

/**
 * Customer refund flow: choose customer, choose order, describe the problem, submit, see the outcome.
 *
 * State lives here with plain React state; data loading and submission live in small hooks.
 * "Submit another request" keeps the chosen customer (the common case when demoing several orders)
 * and clears the order, message, result and idempotency key.
 */
export function CustomerRefundPage({ submissionOptions }: { submissionOptions?: SubmissionOptions } = {}) {
  const customers = useResource('customers', (signal) => api.customers(signal));
  const [customerId, setCustomerId] = useState('');
  const orders = useResource(customerId ? `orders:${customerId}` : null, (signal) => api.orders(customerId, signal));
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const submission = useRefundSubmission(submissionOptions);

  const orderRef = useRef<HTMLFieldSetElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const { state } = submission;
  const locked = state.status === 'submitting' || state.status === 'succeeded';

  function changeCustomer(id: string) {
    setCustomerId(id);
    setOrderNumber(null);
    setErrors((e) => ({ ...e, order: undefined }));
  }

  function changeOrder(value: string) {
    setOrderNumber(value);
    setErrors((e) => ({ ...e, order: undefined }));
  }

  function changeMessage(value: string) {
    setMessage(value);
    if (errors.message && value.trim().length >= MESSAGE_MIN_LENGTH) setErrors((e) => ({ ...e, message: undefined }));
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!orderNumber) next.order = 'Choose the order you want a refund for.';
    const length = message.trim().length;
    if (length === 0) next.message = 'Tell us what happened with your order.';
    else if (length < MESSAGE_MIN_LENGTH) next.message = `Please add a little more detail (at least ${MESSAGE_MIN_LENGTH} characters).`;
    return next;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (locked || !customerId) return;
    const next = validate();
    setErrors(next);
    if (next.order) return orderRef.current?.focus();
    if (next.message) return messageRef.current?.focus();
    void submission.submit({ customerId, orderNumber: orderNumber!, message: message.trim() });
  }

  function startNewRequest() {
    submission.reset();
    setOrderNumber(null);
    setMessage('');
    setErrors({});
    // Return focus to the start of the next step once the form is unlocked.
    requestAnimationFrame(() => orderRef.current?.focus());
  }

  return (
    <div className="page">
      <header className="page-intro">
        <p className="eyebrow">Refund assistant</p>
        <h1>Request a refund</h1>
        <p className="lead">
          Pick the order, tell us what went wrong, and we'll check it against our refund policy. You'll see the outcome
          straight away.
        </p>
      </header>

      <div className="refund-layout">
        <form className="card refund-form" onSubmit={handleSubmit} noValidate aria-labelledby="form-title">
          <h2 id="form-title" className="visually-hidden">
            Refund request
          </h2>
          <fieldset className="form-body" disabled={locked}>
            <CustomerSelector
              customers={customers.resource}
              value={customerId}
              onChange={changeCustomer}
              onRetry={customers.retry}
              disabled={locked}
            />

            {customerId && (
              <>
                <OrderSelector
                  ref={orderRef}
                  orders={orders.resource}
                  value={orderNumber}
                  onChange={changeOrder}
                  onRetry={orders.retry}
                  disabled={locked}
                  error={errors.order}
                />
                <RefundMessageField
                  ref={messageRef}
                  value={message}
                  onChange={changeMessage}
                  disabled={locked}
                  error={errors.message}
                />
              </>
            )}
          </fieldset>

          {state.status === 'failed' && (
            <div className="inline-alert" role="alert">
              <p>{submitErrorMessage(state.error)}</p>
            </div>
          )}

          {customerId && state.status !== 'succeeded' && (
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={state.status === 'submitting'}>
                {state.status === 'submitting'
                  ? 'Reviewing request…'
                  : state.status === 'failed'
                    ? 'Try again'
                    : 'Submit refund request'}
              </button>
            </div>
          )}
        </form>

        <RefundResultCard state={state} onStartNew={startNewRequest} />
      </div>
    </div>
  );
}
