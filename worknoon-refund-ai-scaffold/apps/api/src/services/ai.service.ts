import { pino } from 'pino';
import { env } from '../config/env.js';
import type { AiClassification } from '../types/refund.js';
import { createRefundClassifier, type RefundClassifier } from './ai/index.js';

export { ClassificationError, type ClassificationFailureKind } from './ai/index.js';

const logger = pino({ name: 'ai-classifier', level: env.NODE_ENV === 'test' ? 'silent' : 'info' });

// Built at import time so configuration problems surface at startup, not on the first request.
const classifier: RefundClassifier = createRefundClassifier(env, { logger });
logger.info({ provider: classifier.provider, model: classifier.provider === 'openai' ? env.OPENAI_MODEL : undefined }, 'AI classifier ready');
if (classifier.provider === 'mock') {
  logger.warn('AI_PROVIDER=mock: using the deterministic keyword classifier, not a language model.');
}

/**
 * Converts an untrusted customer message into validated structured signals.
 * Rejects with ClassificationError on any failure; callers must not turn that into an approval or denial.
 */
export function classifyRefundMessage(message: string): Promise<AiClassification> {
  return classifier.classify(message);
}
