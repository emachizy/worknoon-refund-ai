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

// Static, reason-code-driven customer wording. Customer text and provider details never flow in here.
const EXPLANATIONS: Record<OutcomeReasonCode, string> = {
  INVALID_ORDER_REFERENCE: 'We could not verify this order for the customer.',
  ORDER_CUSTOMER_MISMATCH: 'We could not verify this order for the customer.',
  FINAL_SALE: 'Final-sale items are not eligible for refunds.',
  RETURN_WINDOW_EXPIRED: `The order is outside the ${REFUND_WINDOW_DAYS}-day refund window.`,
  PROMPT_INJECTION_DETECTED: 'This request requires human review.',
  SUSPICIOUS_REQUEST: 'This request requires human review because it contains conflicting or unusual details.',
  HIGH_VALUE_REVIEW_REQUIRED: 'Refunds above $500 require human review.',
  DAMAGED_ITEM: 'The request qualifies because the item was reported damaged.',
  INCORRECT_ITEM: 'The request qualifies because the customer reported receiving the wrong item.',
  POLICY_UNCLEAR: 'The request does not match an automatic approval or denial rule and needs human review.',
  AI_CLASSIFICATION_UNAVAILABLE: 'Your request requires manual review because our automated assessment could not be completed.'
};

export function explainOutcome(reasonCode: OutcomeReasonCode): string {
  return EXPLANATIONS[reasonCode];
}
