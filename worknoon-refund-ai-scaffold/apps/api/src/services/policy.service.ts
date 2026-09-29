import type { PolicyInput, PolicyResult } from '../types/refund.js';

export const REFUND_WINDOW_DAYS = 30;
export const HUMAN_REVIEW_THRESHOLD = 500;

export function evaluateRefundPolicy(input: PolicyInput): PolicyResult {
  const matchedRules: string[] = [];

  if (!input.orderExists || !input.ownsOrder) {
    matchedRules.push('ORDER_NOT_FOUND_OR_NOT_OWNED');
    return result('DENIED', false, 'ORDER_INVALID', 'We could not verify this order for the customer.', matchedRules);
  }

  if (input.isFinalSale) {
    matchedRules.push('FINAL_SALE_NOT_REFUNDABLE');
    return result('DENIED', false, 'FINAL_SALE', 'Final-sale items are not eligible for refunds.', matchedRules);
  }

  if (input.daysSinceOrder > REFUND_WINDOW_DAYS) {
    matchedRules.push('OUTSIDE_REFUND_WINDOW');
    return result('DENIED', false, 'OUTSIDE_WINDOW', `The order is outside the ${REFUND_WINDOW_DAYS}-day refund window.`, matchedRules);
  }

  if (
    input.classification.promptInjectionDetected ||
    input.classification.suspicious ||
    input.classification.conflicting
  ) {
    matchedRules.push('SUSPICIOUS_OR_CONFLICTING_REQUEST');
    return result('ESCALATED', true, 'RISK_REVIEW', 'This request requires human review because it contains conflicting or suspicious signals.', matchedRules);
  }

  if (input.refundAmount > HUMAN_REVIEW_THRESHOLD) {
    matchedRules.push('AMOUNT_ABOVE_AUTO_APPROVAL_LIMIT');
    return result('ESCALATED', true, 'HIGH_VALUE', `Refunds above $${HUMAN_REVIEW_THRESHOLD} require human review.`, matchedRules);
  }

  if (input.classification.reason === 'DAMAGED_ITEM') {
    matchedRules.push('DAMAGED_ITEM_ELIGIBLE');
    return result('APPROVED', false, 'DAMAGED_ITEM', 'The request qualifies because the item was reported damaged.', matchedRules);
  }

  if (input.classification.reason === 'INCORRECT_ITEM') {
    matchedRules.push('INCORRECT_ITEM_ELIGIBLE');
    return result('APPROVED', false, 'INCORRECT_ITEM', 'The request qualifies because the customer reported receiving the wrong item.', matchedRules);
  }

  matchedRules.push('NO_AUTOMATIC_POLICY_MATCH');
  return result('ESCALATED', true, 'MANUAL_REVIEW', 'The request does not match an automatic approval or denial rule and needs human review.', matchedRules);
}

function result(
  decision: PolicyResult['decision'],
  humanReviewRequired: boolean,
  reasonCode: string,
  explanation: string,
  matchedRules: string[]
): PolicyResult {
  return { decision, humanReviewRequired, reasonCode, explanation, matchedRules };
}
