import { REFUND_WINDOW_DAYS, type ReasonCode } from './policy.service.js';

// Static, reason-code-driven wording kept outside the policy engine so the
// engine stays free of presentation concerns. Customer text never flows in here.
const EXPLANATIONS: Record<ReasonCode, string> = {
  INVALID_ORDER_REFERENCE: 'We could not verify this order for the customer.',
  ORDER_CUSTOMER_MISMATCH: 'We could not verify this order for the customer.',
  FINAL_SALE: 'Final-sale items are not eligible for refunds.',
  RETURN_WINDOW_EXPIRED: `The order is outside the ${REFUND_WINDOW_DAYS}-day refund window.`,
  PROMPT_INJECTION_DETECTED: 'This request requires human review.',
  SUSPICIOUS_REQUEST: 'This request requires human review because it contains conflicting or unusual details.',
  HIGH_VALUE_REVIEW_REQUIRED: 'Refunds above $500 require human review.',
  DAMAGED_ITEM: 'The request qualifies because the item was reported damaged.',
  INCORRECT_ITEM: 'The request qualifies because the customer reported receiving the wrong item.',
  POLICY_UNCLEAR: 'The request does not match an automatic approval or denial rule and needs human review.'
};

export function explainPolicyDecision(reasonCode: ReasonCode): string {
  return EXPLANATIONS[reasonCode];
}
