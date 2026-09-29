export type RefundDecision = 'APPROVED' | 'DENIED' | 'ESCALATED';

export const REFUND_REASONS = [
  'DAMAGED_ITEM',
  'INCORRECT_ITEM',
  'CHANGED_MIND',
  'NOT_AS_DESCRIBED',
  'LATE_DELIVERY',
  'OTHER'
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const CLASSIFICATION_INTENTS = ['REFUND_REQUEST', 'OTHER'] as const;
export type ClassificationIntent = (typeof CLASSIFICATION_INTENTS)[number];

/** Structured, validated signals extracted from untrusted customer text. Never a refund decision. */
export interface AiClassification {
  intent: ClassificationIntent;
  reason: RefundReason;
  confidence: number;
  suspicious: boolean;
  conflicting: boolean;
  promptInjectionDetected: boolean;
  extractedFacts: string[];
}
