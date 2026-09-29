import type { AuditEvent, RefundDecision } from '../../types';

/** Support-facing outcome labels. The stored enum stays visible as secondary text where it matters. */
export const OUTCOME: Record<RefundDecision, { label: string; icon: string }> = {
  APPROVED: { label: 'Approved', icon: '✓' },
  DENIED: { label: 'Denied', icon: '✕' },
  ESCALATED: { label: 'Needs review', icon: '⚠' }
};

/** Short labels for reason codes. Unknown (e.g. legacy) codes fall back to the raw code. */
const REASON_LABELS: Record<string, string> = {
  INVALID_ORDER_REFERENCE: 'Customer or order not found',
  ORDER_CUSTOMER_MISMATCH: 'Order belongs to another customer',
  FINAL_SALE: 'Final-sale item',
  RETURN_WINDOW_EXPIRED: 'Outside 30-day window',
  PROMPT_INJECTION_DETECTED: 'Prompt injection flagged',
  SUSPICIOUS_REQUEST: 'Suspicious or conflicting request',
  HIGH_VALUE_REVIEW_REQUIRED: 'Over $500 — review required',
  DAMAGED_ITEM: 'Damaged item',
  INCORRECT_ITEM: 'Incorrect item',
  POLICY_UNCLEAR: 'Not covered by automatic rules',
  AI_CLASSIFICATION_UNAVAILABLE: 'Classification unavailable'
};

export const reasonLabel = (code: string | null) => (code ? (REASON_LABELS[code] ?? code) : 'Not recorded');

export const DECIDED_BY: Record<string, string> = {
  POLICY_ENGINE: 'Policy engine',
  WORKFLOW: 'Workflow (classification unavailable)'
};

/**
 * Rule-trace markers, taken from the backend's POLICY_RULES semantics:
 * - check: a precondition that passed and let evaluation continue;
 * - eligible: an approval rule matched;
 * - review: a condition that escalates to a human;
 * - blocked: a condition that denies.
 * Unknown codes get no marker, so the UI never invents a meaning.
 */
export type RuleKind = 'check' | 'eligible' | 'review' | 'blocked' | 'unknown';

const RULES: Record<string, { label: string; kind: RuleKind }> = {
  ORDER_OWNED_BY_CUSTOMER: { label: 'Order belongs to the customer', kind: 'check' },
  NOT_FINAL_SALE: { label: 'Not a final-sale item', kind: 'check' },
  WITHIN_RETURN_WINDOW: { label: 'Within the 30-day window', kind: 'check' },
  NO_RISK_SIGNALS: { label: 'No risk signals raised', kind: 'check' },
  WITHIN_AUTO_APPROVAL_LIMIT: { label: 'Within the $500 automatic limit', kind: 'check' },
  DAMAGED_ITEM_REPORTED: { label: 'Damaged item reported', kind: 'eligible' },
  INCORRECT_ITEM_REPORTED: { label: 'Incorrect item reported', kind: 'eligible' },
  PROMPT_INJECTION_FLAG: { label: 'Prompt-injection flag raised', kind: 'review' },
  SUSPICIOUS_FLAG: { label: 'Suspicious flag raised', kind: 'review' },
  CONFLICTING_CLAIMS_FLAG: { label: 'Conflicting claims flag raised', kind: 'review' },
  HIGH_VALUE_REFUND: { label: 'Refund above $500', kind: 'review' },
  ORDER_DATE_INVALID: { label: 'Order date invalid or in the future', kind: 'review' },
  REFUND_AMOUNT_INVALID: { label: 'Refund amount invalid', kind: 'review' },
  NO_AUTOMATIC_RULE_MATCHED: { label: 'No automatic rule matched', kind: 'review' },
  CUSTOMER_NOT_FOUND: { label: 'Customer not found', kind: 'blocked' },
  ORDER_NOT_FOUND: { label: 'Order not found', kind: 'blocked' },
  ORDER_NOT_OWNED_BY_CUSTOMER: { label: 'Order belongs to another customer', kind: 'blocked' },
  FINAL_SALE_ITEM: { label: 'Final-sale item', kind: 'blocked' },
  RETURN_WINDOW_EXPIRED: { label: 'Outside the 30-day window', kind: 'blocked' }
};

export const RULE_MARKER: Record<RuleKind, { icon: string; text: string }> = {
  check: { icon: '✓', text: 'Check passed' },
  eligible: { icon: '✓', text: 'Eligible reason' },
  review: { icon: '⚠', text: 'Requires review' },
  blocked: { icon: '✕', text: 'Blocks refund' },
  unknown: { icon: '•', text: 'Recorded rule' }
};

export const describeRule = (code: string) => RULES[code] ?? { label: code, kind: 'unknown' as const };

const EVENT_LABELS: Record<string, string> = {
  REQUEST_RECEIVED: 'Request received',
  FACTS_LOADED: 'Facts loaded',
  CLASSIFICATION_SUCCEEDED: 'Classification succeeded',
  CLASSIFICATION_FAILED: 'Classification failed',
  CLASSIFICATION_SKIPPED: 'Classification skipped',
  POLICY_EVALUATED: 'Policy evaluated',
  ESCALATED_WITHOUT_POLICY: 'Escalated without policy evaluation'
};

export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type;

const yesNo = (value: unknown, yes: string, no: string) => (value === true ? yes : value === false ? no : null);

/** One-line summary of an audit event's structured data. Never dumps raw JSON. */
export function eventSummary(event: AuditEvent): string {
  const d = event.data;
  const parts: Array<string | null> = (() => {
    switch (event.type) {
      case 'REQUEST_RECEIVED':
        return [d.orderNumber ? `Order ${d.orderNumber}` : null, yesNo(d.idempotencyKeyProvided, 'Idempotency key provided', 'No idempotency key')];
      case 'FACTS_LOADED':
        return [
          yesNo(d.customerFound, 'Customer found', 'Customer not found'),
          yesNo(d.orderFound, 'Order found', 'Order not found'),
          yesNo(d.ownershipVerified, 'Ownership verified', 'Ownership not verified')
        ];
      case 'CLASSIFICATION_SUCCEEDED':
      case 'CLASSIFICATION_FAILED':
        return [
          d.provider ? `Provider: ${d.provider}` : null,
          d.failureKind ? `Failure: ${d.failureKind}` : null,
          typeof d.durationMs === 'number' ? `${d.durationMs} ms` : null
        ];
      case 'CLASSIFICATION_SKIPPED':
        return [d.cause === 'CUSTOMER_ORDER_RELATIONSHIP_INVALID' ? 'Customer/order relationship invalid' : (d.cause ? String(d.cause) : null)];
      case 'POLICY_EVALUATED':
      case 'ESCALATED_WITHOUT_POLICY':
        return [d.decision ? String(d.decision) : null, d.reasonCode ? String(d.reasonCode) : null];
      default:
        return Object.entries(d).map(([key, value]) => `${key}: ${String(value)}`);
    }
  })();
  return parts.filter(Boolean).join(' · ');
}
