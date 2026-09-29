import { useEffect, useRef } from 'react';
import { formatDateTime } from '../../../lib/format';
import type { RefundDecision, RefundResult } from '../../../types';
import type { SubmissionState } from '../useRefundSubmission';
import { StatusBadge } from './StatusBadge';

// Titles and next steps are presentation only; the policy explanation always comes from the backend.
const COPY: Record<RefundDecision, { title: string; nextStep: string }> = {
  APPROVED: { title: 'Refund approved', nextStep: 'Keep your reference for your records.' },
  DENIED: {
    title: 'Refund not approved',
    nextStep: 'If you believe this is a mistake, contact support and quote your reference.'
  },
  ESCALATED: {
    title: 'Manual review required',
    nextStep: 'No action is needed from you right now. Keep your reference for your records.'
  }
};

interface Props {
  state: SubmissionState;
  onStartNew: () => void;
}

export function RefundResultCard({ state, onStartNew }: Props) {
  return (
    <section className="card result-card" aria-labelledby="result-title">
      {/* Live region announces progress and outcome to screen readers. */}
      <div aria-live="polite">
        {state.status === 'succeeded' ? (
          <Outcome result={state.result} onStartNew={onStartNew} />
        ) : state.status === 'submitting' ? (
          <div className="result-pending" role="status">
            <span className="spinner" aria-hidden="true" />
            <div>
              <h2 id="result-title">Reviewing your request…</h2>
              <p className="muted">We're checking your order against our refund policy. This usually takes a few seconds.</p>
            </div>
          </div>
        ) : (
          <div className="result-empty">
            <h2 id="result-title">Your result</h2>
            <p className="muted">
              Choose an order and tell us what happened. We'll check it against our refund policy and show the outcome
              here.
            </p>
            <ul className="how-list">
              <li>Most requests get an answer straight away.</li>
              <li>Some requests are passed to our support team for a manual review.</li>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Outcome({ result, onStartNew }: { result: RefundResult; onStartNew: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = COPY[result.decision];

  // Move focus to the outcome so keyboard and screen-reader users land on it.
  useEffect(() => headingRef.current?.focus(), [result.requestId]);

  return (
    <div className={`result-outcome outcome-${result.decision.toLowerCase()}`}>
      <StatusBadge decision={result.decision} />
      <h2 id="result-title" ref={headingRef} tabIndex={-1}>
        {copy.title}
      </h2>
      <p className="result-explanation">{result.explanation}</p>
      <dl className="result-meta">
        <div>
          <dt>Reference</dt>
          <dd className="reference">{result.requestId}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatDateTime(result.createdAt)}</dd>
        </div>
      </dl>
      <p className="muted">{copy.nextStep}</p>
      <button type="button" className="button-secondary" onClick={onStartNew}>
        Submit another request
      </button>
    </div>
  );
}
