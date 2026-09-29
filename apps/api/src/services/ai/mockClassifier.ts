import type { AiClassification, RefundReason } from '../../types/refund.js';
import type { RefundClassifier } from './classifier.js';
import { normalize } from './injectionDetector.js';

/**
 * Deterministic keyword classifier for tests, offline development, and
 * reviewers without an API key. It is not intelligent: it matches a handful of
 * phrases, does not understand negation beyond a few conflict patterns, and its
 * confidence values are fixed constants rather than calibrated estimates.
 * Prompt-injection flags come from the shared deterministic detector that
 * wraps every provider, not from this class.
 */

// First match wins, so more specific product problems are checked before softer reasons.
const REASON_PATTERNS: ReadonlyArray<[Exclude<RefundReason, 'OTHER'>, RegExp]> = [
  ['DAMAGED_ITEM', /\b(broken|broke|damaged|cracked|smashed|shattered|dented|defective|torn|stopped working|(doesn't|does not|won't) (work|turn on))\b/],
  ['INCORRECT_ITEM', /\b(wrong|incorrect|different) (item|product|size|colou?r|model|order)\b|\bnot what i ordered\b/],
  ['NOT_AS_DESCRIBED', /\bnot as described\b|\b(isn't|is not|wasn't|was not|not) what the (description|listing|website|photos?|pictures?) (said|says|showed|shows)\b|\bdoes(n't| not) match the (description|listing|photos?|pictures?)\b/],
  ['CHANGED_MIND', /\b(changed my mind|no longer (want|need)|(don't|do not) (want|need) (it|this|them) anymore)\b/],
  ['LATE_DELIVERY', /\b(arrived|came|delivered|shipped) (too )?late\b|\blate (delivery|arrival)\b|\b(delayed|took (too long|weeks))\b/]
];

const REFUND_INTENT = /\b(refund|return|money back|reimburse(ment)?|send it back)\b/;
const SUSPICIOUS = /\b(refund (me )?twice|double refund|chargeback|keep (the item|it) and (get|have) (a|my) refund)\b/;
// Mutually exclusive claims, e.g. describing the item's condition while saying it never arrived.
const CONFLICTING = [
  /\b(never (arrived|received|got)|(didn't|did not) (receive|get|arrive))\b[\s\S]*\b(broken|damaged|cracked|wrong|defective)\b/,
  /\b(broken|damaged|cracked|wrong|defective)\b[\s\S]*\b(never (arrived|received|got)|(didn't|did not) (receive|get|arrive))\b/,
  /\bnot (damaged|broken)\b[\s\S]*\b(is|was|arrived) (damaged|broken)\b|\b(is|was|arrived) (damaged|broken)\b[\s\S]*\bnot (damaged|broken)\b/
];

export const MOCK_CONFIDENCE = { matched: 0.6, unmatched: 0.3 } as const;

export class MockRefundClassifier implements RefundClassifier {
  readonly provider = 'mock';

  async classify(message: string): Promise<AiClassification> {
    const text = normalize(message);
    const reason = REASON_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'OTHER';

    return {
      // Describing a product problem through the refund endpoint counts as a refund request.
      intent: reason !== 'OTHER' || REFUND_INTENT.test(text) ? 'REFUND_REQUEST' : 'OTHER',
      reason,
      confidence: reason === 'OTHER' ? MOCK_CONFIDENCE.unmatched : MOCK_CONFIDENCE.matched,
      suspicious: SUSPICIOUS.test(text),
      conflicting: CONFLICTING.some((pattern) => pattern.test(text)),
      promptInjectionDetected: false,
      extractedFacts: []
    };
  }
}
