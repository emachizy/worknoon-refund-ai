import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createRefundClassifier, type RefundClassifier } from './ai/index.js';

/** Builds the configured classifier. Called once at startup so configuration problems fail fast. */
export function createClassifierFromEnv(): RefundClassifier {
  const aiLogger = logger.child({ component: 'ai-classifier' });
  const classifier = createRefundClassifier(env, { logger: aiLogger });
  aiLogger.info({ provider: classifier.provider, model: classifier.provider === 'openai' ? env.OPENAI_MODEL : undefined }, 'AI classifier ready');
  if (classifier.provider === 'mock') {
    aiLogger.warn('AI_PROVIDER=mock: using the deterministic keyword classifier, not a language model.');
  }
  return classifier;
}
