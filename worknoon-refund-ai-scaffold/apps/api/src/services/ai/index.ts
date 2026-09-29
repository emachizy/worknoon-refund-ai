import type { AiClassification } from '../../types/refund.js';
import { aiClassificationSchema, ClassificationError, type RefundClassifier } from './classifier.js';
import { scanForInjection } from './injectionDetector.js';
import { MockRefundClassifier } from './mockClassifier.js';
import { createOpenAiResponseFn, OpenAiRefundClassifier, type ClassifierLogger, type CreateResponse } from './openaiClassifier.js';

export { ClassificationError, type ClassificationFailureKind, type RefundClassifier } from './classifier.js';

export interface ClassifierConfig {
  AI_PROVIDER: 'mock' | 'openai';
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  OPENAI_TIMEOUT_MS: number;
}

export interface ClassifierDependencies {
  logger: ClassifierLogger;
  /** Overrides the real OpenAI call; used by tests so no network request is made. */
  createResponse?: CreateResponse;
}

export function createRefundClassifier(config: ClassifierConfig, deps: ClassifierDependencies): RefundClassifier {
  if (config.AI_PROVIDER === 'mock') return withDeterministicSafeguards(new MockRefundClassifier());

  if (!config.OPENAI_API_KEY && !deps.createResponse) {
    // Normally unreachable: loadEnv() rejects this configuration at startup.
    throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY.');
  }
  const createResponse = deps.createResponse ?? createOpenAiResponseFn(config.OPENAI_API_KEY!, config.OPENAI_TIMEOUT_MS);
  return withDeterministicSafeguards(
    new OpenAiRefundClassifier({
      createResponse,
      model: config.OPENAI_MODEL,
      timeoutMs: config.OPENAI_TIMEOUT_MS,
      logger: deps.logger
    })
  );
}

/**
 * Applies provider-independent guarantees to any classifier:
 * - output is re-validated against the AiClassification contract (unknown keys stripped);
 * - the deterministic injection scan can only raise flags, never clear them the model raised;
 * - any failure surfaces as a ClassificationError, never as a raw provider error.
 */
export function withDeterministicSafeguards(inner: RefundClassifier): RefundClassifier {
  return {
    provider: inner.provider,
    async classify(message: string): Promise<AiClassification> {
      const scan = scanForInjection(message);

      let output: unknown;
      try {
        output = await inner.classify(message);
      } catch (error) {
        throw error instanceof ClassificationError ? error : new ClassificationError('PROVIDER_ERROR', inner.provider);
      }

      const parsed = aiClassificationSchema.safeParse(output);
      if (!parsed.success) throw new ClassificationError('INVALID_OUTPUT', inner.provider);

      return {
        ...parsed.data,
        promptInjectionDetected: parsed.data.promptInjectionDetected || scan.promptInjectionDetected,
        suspicious: parsed.data.suspicious || scan.suspicious
      };
    }
  };
}
