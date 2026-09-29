/**
 * Deterministic, conservative detection of obvious prompt-injection and
 * social-engineering attempts. This is one layer of defense in depth, not a
 * complete solution: paraphrased or novel attacks will get past it, which is
 * why the model is also asked to flag injection, and why neither layer can
 * approve anything. Patterns favour precision over recall so ordinary
 * complaints are not escalated needlessly.
 */

export type InjectionSignal =
  | 'INSTRUCTION_OVERRIDE'
  | 'ROLE_MARKER'
  | 'DELIMITER_ESCAPE'
  | 'FORCED_APPROVAL'
  | 'AUTHORITY_IMPERSONATION';

interface Rule {
  signal: InjectionSignal;
  pattern: RegExp;
  /** Social-engineering signals are also marked suspicious, not only injection. */
  suspicious: boolean;
}

const RULES: Rule[] = [
  {
    // "ignore previous instructions", "disregard the refund policy", "override policy".
    // Qualifiers are an explicit list so "I didn't ignore the care instructions" does not match.
    signal: 'INSTRUCTION_OVERRIDE',
    pattern:
      /\b(ignore|disregard|forget|bypass|override)\s+(all\s+|any\s+)?(of\s+)?(the\s+|your\s+|these\s+|those\s+)?(previous\s+|prior\s+|above\s+|earlier\s+|system\s+|refund\s+|return\s+)?(instructions?|prompts?|rules?|polic(y|ies)|guidelines?)\b/,
    suspicious: false
  },
  {
    // "system message:", "developer prompt", a line starting "system:" / "assistant:"
    signal: 'ROLE_MARKER',
    pattern: /\b(system|developer)\s+(message|prompt|instructions?)\b|(^|\n)\s*(system|developer|assistant)\s*:/,
    suspicious: false
  },
  {
    // Trying to close or open the delimiter the customer message is wrapped in.
    signal: 'DELIMITER_ESCAPE',
    pattern: /<\s*\/?\s*customer_message\b/,
    suspicious: false
  },
  {
    // "approve my refund regardless", "you must approve this refund"
    signal: 'FORCED_APPROVAL',
    pattern:
      /\b(approve|authori[sz]e|issue|process)\b.{0,40}\b(regardless|no matter what|without (any )?(review|checks?|verification|questions?))\b|\byou (must|have to|are required to|are instructed to) (approve|refund)\b/,
    suspicious: true
  },
  {
    // "I am the administrator", "this is your developer", "as an admin, ..."
    signal: 'AUTHORITY_IMPERSONATION',
    pattern:
      /\b(i am|i'm|this is|speaking as|as)\s+(an?|the|your)\s+(site |store |system )?(admin(istrator)?|developer|supervisor|support manager|store manager|refund manager)\b|\badmin(istrator)? (override|mode|access)\b/,
    suspicious: true
  }
];

export interface InjectionScan {
  promptInjectionDetected: boolean;
  suspicious: boolean;
  signals: InjectionSignal[];
}

export function scanForInjection(message: string): InjectionScan {
  const text = normalize(message);
  const matched = RULES.filter((rule) => rule.pattern.test(text));
  return {
    promptInjectionDetected: matched.length > 0,
    suspicious: matched.some((rule) => rule.suspicious),
    signals: matched.map((rule) => rule.signal)
  };
}

/** Folds common obfuscation (full-width letters, zero-width characters, curly quotes, spacing) before matching. */
export function normalize(message: string): string {
  return message
    .normalize('NFKC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^\S\n]+/g, ' ');
}
