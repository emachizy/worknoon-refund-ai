import type { ClassificationAudit } from '../../../types';

const flag = (value: boolean | null) =>
  value === true ? (
    <span className="flag flag-raised">
      <span aria-hidden="true">⚠ </span>Yes
    </span>
  ) : value === false ? (
    'No'
  ) : (
    '—'
  );

/**
 * Shows only the validated, structured classifier output that was stored.
 * There is no reasoning text to show, by design, and nothing is inferred for missing fields.
 */
export function ClassificationPanel({ classification }: { classification: ClassificationAudit | null }) {
  if (!classification || !classification.status) {
    return <p className="muted">No classification data was recorded for this request (created before audit fields existed).</p>;
  }

  if (classification.status === 'SKIPPED') {
    return (
      <div className="notice">
        <p className="notice-title">Not run</p>
        <p>
          Classification was unnecessary: the customer/order relationship had already failed validation, so the message
          was not sent to the classifier.
        </p>
      </div>
    );
  }

  if (classification.status === 'FAILED') {
    return (
      <div className="notice notice-warning">
        <p className="notice-title">
          <span aria-hidden="true">⚠ </span>Classification unavailable
        </p>
        <dl className="kv">
          <dt>Provider</dt>
          <dd>{classification.provider ?? '—'}</dd>
          <dt>Failure type</dt>
          <dd className="mono">{classification.failureKind ?? '—'}</dd>
          {classification.durationMs !== null && (
            <>
              <dt>Duration</dt>
              <dd>{classification.durationMs} ms</dd>
            </>
          )}
        </dl>
        <p className="muted small">The workflow escalated this request for human review without evaluating policy.</p>
      </div>
    );
  }

  const result = classification.result;
  return (
    <div className="stack-sm">
      <dl className="kv">
        <dt>Provider</dt>
        <dd>
          {classification.provider ?? '—'}
          {classification.durationMs !== null && <span className="muted"> · {classification.durationMs} ms</span>}
        </dd>
        <dt>Intent</dt>
        <dd className="mono">{result?.intent ?? '—'}</dd>
        <dt>Reason</dt>
        <dd className="mono">{result?.reason ?? '—'}</dd>
        <dt>Confidence</dt>
        <dd>
          {result?.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'}
          <span className="muted small block">Classifier's confidence in the reason label, not the likelihood of approval.</span>
        </dd>
        <dt>Suspicious</dt>
        <dd>{flag(result?.suspicious ?? null)}</dd>
        <dt>Conflicting</dt>
        <dd>{flag(result?.conflicting ?? null)}</dd>
        <dt>Prompt injection</dt>
        <dd>{flag(result?.promptInjectionDetected ?? null)}</dd>
      </dl>
      {result && result.extractedFacts.length > 0 && (
        <div>
          <p className="kv-heading">Extracted facts</p>
          <ul className="fact-list">
            {result.extractedFacts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
