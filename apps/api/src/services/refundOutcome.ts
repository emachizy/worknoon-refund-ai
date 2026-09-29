import { REFUND_WINDOW_DAYS, type PolicyDecision, type ReasonCode } from './policy.service.js';

/**
 * Outcome of the refund workflow. Normally this is the policy engine's decision.
 * The one exception is an orchestration-level escalation when the AI classification
 * could not be obtained: that is an infrastructure condition, not a refund-policy
 * fact, so it is represented here rather than inside evaluateRefundPolicy().
 */
export const WORKFLOW_REASON_CODES = {
  AI_CLASSIFICATION_UNAVAILABLE: 'AI_CLASSIFICATION_UNAVAILABLE'
} as const;
export type WorkflowReasonCode = keyof typeof WORKFLOW_REASON_CODES;
export type OutcomeReasonCode = ReasonCode | WorkflowReasonCode;

export type DecidedBy = 'POLICY_ENGINE' | 'WORKFLOW';

export type RefundOutcome =
  | (PolicyDecision & { decidedBy: 'POLICY_ENGINE' })
  | {
      decidedBy: 'WORKFLOW';
      decision: 'ESCALATED';
      reasonCode: WorkflowReasonCode;
      humanReviewRequired: true;
      matchedRules: [];
    };

export const AI_UNAVAILABLE_OUTCOME: RefundOutcome = {
  decidedBy: 'WORKFLOW',
  decision: 'ESCALATED',
  reasonCode: 'AI_CLASSIFICATION_UNAVAILABLE',
  humanReviewRequired: true,
  matchedRules: []
};

/**
 * Static, customer-safe wording chosen by reason code. Customer text and provider details never flow in here.
 *
 * Every escalation uses the same sentence, so a customer cannot tell a security escalation
 * (prompt injection, suspicious request) from a routine one (high value, unclear reason,
 * AI unavailable). Wording never mentions fraud, injection, detection, vendors, or internal rules.
 */
const APPROVED_MESSAGE = 'Your refund request has been approved.';
const ESCALATED_MESSAGE = 'Your request requires manual review. Our support team will review it.';
const ORDER_NOT_VERIFIED_MESSAGE = 'We could not verify this order for your account.';

const EXPLANATIONS: Record<OutcomeReasonCode, string> = {
  INVALID_ORDER_REFERENCE: ORDER_NOT_VERIFIED_MESSAGE,
  ORDER_CUSTOMER_MISMATCH: ORDER_NOT_VERIFIED_MESSAGE,
  FINAL_SALE: 'This order is not eligible for a refund under the refund policy.',
  RETURN_WINDOW_EXPIRED: `This order is outside the ${REFUND_WINDOW_DAYS}-day refund window.`,
  PROMPT_INJECTION_DETECTED: ESCALATED_MESSAGE,
  SUSPICIOUS_REQUEST: ESCALATED_MESSAGE,
  HIGH_VALUE_REVIEW_REQUIRED: ESCALATED_MESSAGE,
  POLICY_UNCLEAR: ESCALATED_MESSAGE,
  AI_CLASSIFICATION_UNAVAILABLE: ESCALATED_MESSAGE,
  DAMAGED_ITEM: APPROVED_MESSAGE,
  INCORRECT_ITEM: APPROVED_MESSAGE
};

export function explainOutcome(reasonCode: OutcomeReasonCode): string {
  return EXPLANATIONS[reasonCode];
}
