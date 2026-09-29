import type { ReactNode } from 'react';
import { formatCurrency, formatDate, formatDateTime } from '../../../lib/format';
import type { RefundDetail as Detail } from '../../../types';
import { DECIDED_BY, reasonLabel } from '../labels';
import { AuditTimeline } from './AuditTimeline';
import { ClassificationPanel } from './ClassificationPanel';
import { OutcomeBadge } from './OutcomeBadge';
import { PolicyTrace } from './PolicyTrace';

const yesNo = (value: boolean | null, yes = 'Yes', no = 'No') => (value === null ? '—' : value ? yes : no);

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="detail-section" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {description && <p className="muted small">{description}</p>}
      {children}
    </section>
  );
}

export function RefundDetail({ detail }: { detail: Detail }) {
  const { outcome, facts, request } = detail;
  return (
    <div className="detail">
      <Section id="detail-outcome" title="Outcome">
        <div className="outcome-row">
          <OutcomeBadge decision={outcome.decision} showCode />
          {outcome.humanReviewRequired && (
            <span className="chip chip-review">
              <span aria-hidden="true">⚑ </span>Human review required
            </span>
          )}
        </div>
        <dl className="kv">
          <dt>Reason code</dt>
          <dd>
            <code>{outcome.reasonCode ?? '—'}</code>
            {outcome.reasonCode && <span className="muted"> · {reasonLabel(outcome.reasonCode)}</span>}
          </dd>
          <dt>Decided by</dt>
          <dd>
            {outcome.decidedBy ? (DECIDED_BY[outcome.decidedBy] ?? outcome.decidedBy) : 'Not recorded'}
            {outcome.decidedBy && <code className="muted"> {outcome.decidedBy}</code>}
          </dd>
          <dt>Human review</dt>
          <dd>{yesNo(outcome.humanReviewRequired, 'Required', 'Not required')}</dd>
          <dt>Customer saw</dt>
          <dd>{outcome.explanation ?? '—'}</dd>
        </dl>
      </Section>

      <Section id="detail-request" title="Customer request" description="Submitted by the customer. Untrusted text, shown exactly as written.">
        <dl className="kv">
          <dt>Customer</dt>
          <dd>{facts?.customerName ?? 'Not recorded'}</dd>
          <dt>Order</dt>
          <dd className="mono">{request.orderNumber ?? '—'}</dd>
          <dt>Submitted</dt>
          <dd>{detail.createdAt ? formatDateTime(detail.createdAt) : '—'}</dd>
        </dl>
        {/* Rendered as a text node only: React escapes it, and there is no HTML injection path. */}
        <blockquote className="customer-message">{request.message ?? '—'}</blockquote>
      </Section>

      <Section id="detail-facts" title="Order facts" description="Authoritative database facts used for the decision (snapshot at evaluation time).">
        {facts ? (
          <dl className="kv facts">
            <dt>Customer found</dt>
            <dd>{yesNo(facts.customerFound)}</dd>
            <dt>Order found</dt>
            <dd>{yesNo(facts.orderFound)}</dd>
            <dt>Ownership verified</dt>
            <dd>{yesNo(facts.ownershipVerified)}</dd>
            <dt>Item</dt>
            <dd>{facts.itemName ?? '—'}</dd>
            <dt>Amount</dt>
            <dd>{facts.orderTotal === null ? '—' : formatCurrency(facts.orderTotal)}</dd>
            <dt>Order date</dt>
            <dd>{facts.orderedAt ? formatDate(facts.orderedAt) : '—'}</dd>
            <dt>Final sale</dt>
            <dd>{yesNo(facts.isFinalSale)}</dd>
            <dt>Evaluated at</dt>
            <dd>{facts.evaluatedAt ? formatDateTime(facts.evaluatedAt) : '—'}</dd>
          </dl>
        ) : (
          <p className="muted">
            No facts snapshot was recorded for this request (created before audit fields existed).
            {outcome.amount !== null && ` Recorded amount: ${formatCurrency(outcome.amount)}.`}
          </p>
        )}
      </Section>

      <Section id="detail-classification" title="AI classification" description="Structured signals only. The AI does not decide refunds.">
        <ClassificationPanel classification={detail.classification} />
      </Section>

      <Section id="detail-policy" title="Policy evaluation" description="Rules evaluated by the deterministic policy engine, in order.">
        <PolicyTrace rules={outcome.matchedRules} />
      </Section>

      <Section id="detail-audit" title="Audit timeline">
        <AuditTimeline events={detail.auditEvents} />
      </Section>

      <p className="muted small">
        Reference <code>{detail.requestId}</code>
      </p>
    </div>
  );
}
