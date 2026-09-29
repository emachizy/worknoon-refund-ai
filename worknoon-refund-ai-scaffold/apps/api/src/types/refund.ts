export type RefundDecision = 'APPROVED' | 'DENIED' | 'ESCALATED';
export type RefundReason =
  | 'DAMAGED_ITEM'
  | 'INCORRECT_ITEM'
  | 'CHANGED_MIND'
  | 'NOT_AS_DESCRIBED'
  | 'LATE_DELIVERY'
  | 'OTHER';

export interface AiClassification {
  intent: 'REFUND_REQUEST' | 'OTHER';
  reason: RefundReason;
  confidence: number;
  suspicious: boolean;
  conflicting: boolean;
  promptInjectionDetected: boolean;
  extractedFacts: string[];
}

export interface PolicyInput {
  orderExists: boolean;
  ownsOrder: boolean;
  isFinalSale: boolean;
  daysSinceOrder: number;
  refundAmount: number;
  classification: AiClassification;
}

export interface PolicyResult {
  decision: RefundDecision;
  humanReviewRequired: boolean;
  reasonCode: string;
  explanation: string;
  matchedRules: string[];
}
