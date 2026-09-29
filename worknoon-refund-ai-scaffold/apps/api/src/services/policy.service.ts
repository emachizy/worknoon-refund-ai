import type { RefundReason } from '../types/refund.js';

/**
 * Deterministic refund policy engine.
 *
 * This module is the single source of truth for refund eligibility. It is a
 * pure function of its arguments: no database, HTTP, AI, environment, or clock
 * access. The caller supplies every fact, including the evaluation time, so the
 * same input always yields the same decision.
 *
 * The AI layer may only contribute `PolicyRequestSignals` (what the customer
 * claims and whether the message looks risky). Those signals can move a
 * request toward DENIED or ESCALATED, but can only produce APPROVED when every
 * deterministic check on the order facts has already passed.
 */

export const REFUND_WINDOW_DAYS = 30;
/** Refunds strictly above this amount (in cents) require human review. $500.00 itself does not. */
export const HUMAN_REVIEW_THRESHOLD_CENTS = 50_000;

const MS_PER_DAY = 86_400_000;

export const REASON_CODES = {
  INVALID_ORDER_REFERENCE: 'INVALID_ORDER_REFERENCE',
  ORDER_CUSTOMER_MISMATCH: 'ORDER_CUSTOMER_MISMATCH',
  FINAL_SALE: 'FINAL_SALE',
  RETURN_WINDOW_EXPIRED: 'RETURN_WINDOW_EXPIRED',
  PROMPT_INJECTION_DETECTED: 'PROMPT_INJECTION_DETECTED',
  SUSPICIOUS_REQUEST: 'SUSPICIOUS_REQUEST',
  HIGH_VALUE_REVIEW_REQUIRED: 'HIGH_VALUE_REVIEW_REQUIRED',
  DAMAGED_ITEM: 'DAMAGED_ITEM',
  INCORRECT_ITEM: 'INCORRECT_ITEM',
  POLICY_UNCLEAR: 'POLICY_UNCLEAR'
} as const;

export type ReasonCode = keyof typeof REASON_CODES;
export type DenialReasonCode = Extract<
  ReasonCode,
  'INVALID_ORDER_REFERENCE' | 'ORDER_CUSTOMER_MISMATCH' | 'FINAL_SALE' | 'RETURN_WINDOW_EXPIRED'
>;
export type EscalationReasonCode = Extract<
  ReasonCode,
  'PROMPT_INJECTION_DETECTED' | 'SUSPICIOUS_REQUEST' | 'HIGH_VALUE_REVIEW_REQUIRED' | 'POLICY_UNCLEAR'
>;
export type ApprovalReasonCode = Extract<ReasonCode, 'DAMAGED_ITEM' | 'INCORRECT_ITEM'>;

/** Audit trail entries: every check the engine evaluated, in order, with its outcome. */
export const POLICY_RULES = {
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_OWNED_BY_CUSTOMER: 'ORDER_OWNED_BY_CUSTOMER',
  ORDER_NOT_OWNED_BY_CUSTOMER: 'ORDER_NOT_OWNED_BY_CUSTOMER',
  NOT_FINAL_SALE: 'NOT_FINAL_SALE',
  FINAL_SALE_ITEM: 'FINAL_SALE_ITEM',
  WITHIN_RETURN_WINDOW: 'WITHIN_RETURN_WINDOW',
  RETURN_WINDOW_EXPIRED: 'RETURN_WINDOW_EXPIRED',
  ORDER_DATE_INVALID: 'ORDER_DATE_INVALID',
  NO_RISK_SIGNALS: 'NO_RISK_SIGNALS',
  PROMPT_INJECTION_FLAG: 'PROMPT_INJECTION_FLAG',
  SUSPICIOUS_FLAG: 'SUSPICIOUS_FLAG',
  CONFLICTING_CLAIMS_FLAG: 'CONFLICTING_CLAIMS_FLAG',
  WITHIN_AUTO_APPROVAL_LIMIT: 'WITHIN_AUTO_APPROVAL_LIMIT',
  HIGH_VALUE_REFUND: 'HIGH_VALUE_REFUND',
  REFUND_AMOUNT_INVALID: 'REFUND_AMOUNT_INVALID',
  DAMAGED_ITEM_REPORTED: 'DAMAGED_ITEM_REPORTED',
  INCORRECT_ITEM_REPORTED: 'INCORRECT_ITEM_REPORTED',
  NO_AUTOMATIC_RULE_MATCHED: 'NO_AUTOMATIC_RULE_MATCHED'
} as const;

export type PolicyRule = keyof typeof POLICY_RULES;

/** Authoritative order facts, as loaded from the database. */
export interface PolicyOrderFacts {
  /** Id of the customer who owns the order. */
  customerId: string;
  /** Refund amount in USD (the order total). */
  total: number;
  orderedAt: Date;
  isFinalSale: boolean;
}

/** Untrusted, AI-derived claims about the request. Never sufficient on their own for approval. */
export interface PolicyRequestSignals {
  reason: RefundReason;
  suspicious: boolean;
  conflicting: boolean;
  promptInjectionDetected: boolean;
}

export interface RefundPolicyInput {
  /** Id of the requesting customer, or null if no such customer exists. */
  requestingCustomerId: string | null;
  /** The referenced order, or null if no such order exists. */
  order: PolicyOrderFacts | null;
  signals: PolicyRequestSignals;
  /** The moment the policy is evaluated. Injected so results never depend on the real clock. */
  evaluatedAt: Date;
}

interface DecisionBase {
  matchedRules: PolicyRule[];
}

export type PolicyDecision =
  | (DecisionBase & { decision: 'APPROVED'; reasonCode: ApprovalReasonCode; humanReviewRequired: false })
  | (DecisionBase & { decision: 'DENIED'; reasonCode: DenialReasonCode; humanReviewRequired: false })
  | (DecisionBase & { decision: 'ESCALATED'; reasonCode: EscalationReasonCode; humanReviewRequired: true });

export function evaluateRefundPolicy(input: RefundPolicyInput): PolicyDecision {
  const rules: PolicyRule[] = [];
  const deny = (reasonCode: DenialReasonCode): PolicyDecision =>
    ({ decision: 'DENIED', reasonCode, humanReviewRequired: false, matchedRules: rules });
  const escalate = (reasonCode: EscalationReasonCode): PolicyDecision =>
    ({ decision: 'ESCALATED', reasonCode, humanReviewRequired: true, matchedRules: rules });
  const approve = (reasonCode: ApprovalReasonCode): PolicyDecision =>
    ({ decision: 'APPROVED', reasonCode, humanReviewRequired: false, matchedRules: rules });

  const { requestingCustomerId, order, signals } = input;

  // 1. The customer/order relationship must be resolvable.
  if (!requestingCustomerId || !order) {
    if (!requestingCustomerId) rules.push('CUSTOMER_NOT_FOUND');
    if (!order) rules.push('ORDER_NOT_FOUND');
    return deny('INVALID_ORDER_REFERENCE');
  }

  // 2. The requesting customer must own the order.
  if (order.customerId !== requestingCustomerId) {
    rules.push('ORDER_NOT_OWNED_BY_CUSTOMER');
    return deny('ORDER_CUSTOMER_MISMATCH');
  }
  rules.push('ORDER_OWNED_BY_CUSTOMER');

  // 3. Final-sale items are never refundable, regardless of reason, amount, or risk.
  if (order.isFinalSale) {
    rules.push('FINAL_SALE_ITEM');
    return deny('FINAL_SALE');
  }
  rules.push('NOT_FINAL_SALE');

  // 4. The refund window is inclusive: day 30 is eligible, day 31 is not.
  const daysSinceOrder = calendarDaysBetween(order.orderedAt, input.evaluatedAt);
  if (daysSinceOrder === null || daysSinceOrder < 0) {
    // Unparseable or future-dated order: the window cannot be verified, so a human must look.
    rules.push('ORDER_DATE_INVALID');
    return escalate('POLICY_UNCLEAR');
  }
  if (daysSinceOrder > REFUND_WINDOW_DAYS) {
    rules.push('RETURN_WINDOW_EXPIRED');
    return deny('RETURN_WINDOW_EXPIRED');
  }
  rules.push('WITHIN_RETURN_WINDOW');

  // 5. Risk signals always block automatic approval. Every raised flag is recorded.
  if (signals.promptInjectionDetected) rules.push('PROMPT_INJECTION_FLAG');
  if (signals.suspicious) rules.push('SUSPICIOUS_FLAG');
  if (signals.conflicting) rules.push('CONFLICTING_CLAIMS_FLAG');
  if (signals.promptInjectionDetected) return escalate('PROMPT_INJECTION_DETECTED');
  if (signals.suspicious || signals.conflicting) return escalate('SUSPICIOUS_REQUEST');
  rules.push('NO_RISK_SIGNALS');

  // 6. High-value refunds need a human, even when otherwise eligible. Compared in cents to avoid float drift.
  const amountCents = toCents(order.total);
  if (amountCents === null) {
    rules.push('REFUND_AMOUNT_INVALID');
    return escalate('POLICY_UNCLEAR');
  }
  if (amountCents > HUMAN_REVIEW_THRESHOLD_CENTS) {
    rules.push('HIGH_VALUE_REFUND');
    return escalate('HIGH_VALUE_REVIEW_REQUIRED');
  }
  rules.push('WITHIN_AUTO_APPROVAL_LIMIT');

  // 7–8. Only these reasons are approved automatically, and only after all checks above passed.
  if (signals.reason === 'DAMAGED_ITEM') {
    rules.push('DAMAGED_ITEM_REPORTED');
    return approve('DAMAGED_ITEM');
  }
  if (signals.reason === 'INCORRECT_ITEM') {
    rules.push('INCORRECT_ITEM_REPORTED');
    return approve('INCORRECT_ITEM');
  }

  // 9. Anything else is not covered confidently by the rules.
  rules.push('NO_AUTOMATIC_RULE_MATCHED');
  return escalate('POLICY_UNCLEAR');
}

/**
 * Whole calendar days (UTC) from the order date to the evaluation date, ignoring time of day.
 * An order placed any time on 1 June is on day 30 for the whole of 1 July. Returns null for invalid dates.
 */
export function calendarDaysBetween(from: Date, to: Date): number | null {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toDay - fromDay) / MS_PER_DAY);
}

function toCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}
