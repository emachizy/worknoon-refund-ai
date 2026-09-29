import { z } from 'zod';
import { CLASSIFICATION_INTENTS, REFUND_REASONS, type AiClassification } from '../../types/refund.js';

/**
 * Translates untrusted customer text into structured signals.
 * Implementations must never decide refund eligibility; that belongs to evaluateRefundPolicy().
 */
export interface RefundClassifier {
  readonly provider: string;
  /** Resolves with validated signals, or rejects with a ClassificationError. */
  classify(message: string): Promise<AiClassification>;
}

export type ClassificationFailureKind =
  /** The provider did not answer within the configured timeout. */
  | 'TIMEOUT'
  /** Network, authentication, rate-limit, or other provider-side failure. */
  | 'PROVIDER_ERROR'
  /** The provider answered, but not with output that passes validation. */
  | 'INVALID_OUTPUT'
  /** The model explicitly refused to classify. */
  | 'REFUSED';

/**
 * The only error a RefundClassifier rejects with. Its message is fixed, generic
 * text: it never carries raw provider errors, API keys, model output, or
 * customer text, so it is safe to log or surface. Callers must treat any
 * classification failure as "no signals available" (escalate), never as a decision.
 */
export class ClassificationError extends Error {
  readonly kind: ClassificationFailureKind;
  readonly provider: string;

  constructor(kind: ClassificationFailureKind, provider: string) {
    super(`Refund classification failed (${kind}) using provider "${provider}".`);
    this.name = 'ClassificationError';
    this.kind = kind;
    this.provider = provider;
  }
}

export const MAX_EXTRACTED_FACTS = 8;
export const MAX_FACT_LENGTH = 200;

/**
 * Boundary validator for any classifier output. Unknown keys are stripped, so
 * extra model fields (e.g. `decision: "APPROVED"`) can never reach the policy
 * engine. Types, enums and the confidence range are enforced; free-text facts
 * are informational only and are capped rather than rejected.
 */
export const aiClassificationSchema: z.ZodType<AiClassification, z.ZodTypeDef, unknown> = z.object({
  intent: z.enum(CLASSIFICATION_INTENTS),
  reason: z.enum(REFUND_REASONS),
  confidence: z.number().finite().min(0).max(1),
  suspicious: z.boolean(),
  conflicting: z.boolean(),
  promptInjectionDetected: z.boolean(),
  extractedFacts: z
    .array(z.string())
    .transform((facts) => facts.slice(0, MAX_EXTRACTED_FACTS).map((fact) => fact.slice(0, MAX_FACT_LENGTH)))
});
