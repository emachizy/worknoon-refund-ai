import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  evaluateRefundPolicy,
  type PolicyDecision,
  type PolicyRequestSignals,
  type RefundPolicyInput
} from '../../src/services/policy.service.js';

// Fixed clock: tests never depend on the real date.
const EVALUATED_AT = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(EVALUATED_AT.getTime() - days * DAY_MS);

const CUSTOMER_ID = 'customer-a';
const OTHER_CUSTOMER_ID = 'customer-b';

const damaged: PolicyRequestSignals = {
  reason: 'DAMAGED_ITEM',
  suspicious: false,
  conflicting: false,
  promptInjectionDetected: false
};

function scenario(overrides: {
  total?: number;
  ageDays?: number;
  orderedAt?: Date;
  isFinalSale?: boolean;
  ownerId?: string;
  signals?: Partial<PolicyRequestSignals>;
} = {}): RefundPolicyInput {
  return {
    requestingCustomerId: CUSTOMER_ID,
    order: {
      customerId: overrides.ownerId ?? CUSTOMER_ID,
      total: overrides.total ?? 89,
      orderedAt: overrides.orderedAt ?? daysAgo(overrides.ageDays ?? 5),
      isFinalSale: overrides.isFinalSale ?? false
    },
    signals: { ...damaged, ...overrides.signals },
    evaluatedAt: EVALUATED_AT
  };
}

const evaluate = (overrides?: Parameters<typeof scenario>[0]) => evaluateRefundPolicy(scenario(overrides));

describe('evaluateRefundPolicy — required scenarios', () => {
  it('1. approves a damaged $89 order placed 5 days ago', () => {
    expect(evaluate({ total: 89, ageDays: 5 })).toEqual({
      decision: 'APPROVED',
      reasonCode: 'DAMAGED_ITEM',
      humanReviewRequired: false,
      matchedRules: [
        'ORDER_OWNED_BY_CUSTOMER',
        'NOT_FINAL_SALE',
        'WITHIN_RETURN_WINDOW',
        'NO_RISK_SIGNALS',
        'WITHIN_AUTO_APPROVAL_LIMIT',
        'DAMAGED_ITEM_REPORTED'
      ]
    });
  });

  it('2. approves an incorrect item under $500', () => {
    const result = evaluate({ total: 249, signals: { reason: 'INCORRECT_ITEM' } });
    expect(result.decision).toBe('APPROVED');
    expect(result.reasonCode).toBe('INCORRECT_ITEM');
    expect(result.matchedRules).toContain('INCORRECT_ITEM_REPORTED');
  });

  it('3. denies a damaged final-sale item', () => {
    expect(evaluate({ isFinalSale: true })).toEqual({
      decision: 'DENIED',
      reasonCode: 'FINAL_SALE',
      humanReviewRequired: false,
      matchedRules: ['ORDER_OWNED_BY_CUSTOMER', 'FINAL_SALE_ITEM']
    });
  });

  it('4. denies a damaged item ordered 31 days ago', () => {
    expect(evaluate({ ageDays: 31 })).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'RETURN_WINDOW_EXPIRED',
      matchedRules: ['ORDER_OWNED_BY_CUSTOMER', 'NOT_FINAL_SALE', 'RETURN_WINDOW_EXPIRED']
    });
  });

  it('5. treats an order exactly 30 days old as inside the window', () => {
    const result = evaluate({ ageDays: 30 });
    expect(result.decision).toBe('APPROVED');
    expect(result.matchedRules).toContain('WITHIN_RETURN_WINDOW');
  });

  it('6. approves a damaged item of exactly $500', () => {
    const result = evaluate({ total: 500 });
    expect(result.decision).toBe('APPROVED');
    expect(result.matchedRules).toContain('WITHIN_AUTO_APPROVAL_LIMIT');
  });

  it('7. escalates a damaged item of $500.01', () => {
    expect(evaluate({ total: 500.01 })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'HIGH_VALUE_REVIEW_REQUIRED',
      humanReviewRequired: true
    });
  });

  it('8. escalates a damaged item of $799', () => {
    expect(evaluate({ total: 799 })).toEqual({
      decision: 'ESCALATED',
      reasonCode: 'HIGH_VALUE_REVIEW_REQUIRED',
      humanReviewRequired: true,
      matchedRules: ['ORDER_OWNED_BY_CUSTOMER', 'NOT_FINAL_SALE', 'WITHIN_RETURN_WINDOW', 'NO_RISK_SIGNALS', 'HIGH_VALUE_REFUND']
    });
  });

  it('9. escalates when prompt injection is flagged', () => {
    expect(evaluate({ signals: { promptInjectionDetected: true } })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'PROMPT_INJECTION_DETECTED',
      humanReviewRequired: true
    });
  });

  it('10. escalates a suspicious request', () => {
    expect(evaluate({ signals: { suspicious: true } })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'SUSPICIOUS_REQUEST',
      matchedRules: expect.arrayContaining(['SUSPICIOUS_FLAG'])
    });
  });

  it('11. denies when the order belongs to a different customer', () => {
    expect(evaluate({ ownerId: OTHER_CUSTOMER_ID })).toEqual({
      decision: 'DENIED',
      reasonCode: 'ORDER_CUSTOMER_MISMATCH',
      humanReviewRequired: false,
      matchedRules: ['ORDER_NOT_OWNED_BY_CUSTOMER']
    });
  });

  it('12. escalates when the reason is unclear', () => {
    expect(evaluate({ signals: { reason: 'OTHER' } })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'POLICY_UNCLEAR',
      humanReviewRequired: true,
      matchedRules: expect.arrayContaining(['NO_AUTOMATIC_RULE_MATCHED'])
    });
  });

  it('13. denies (not escalates) a $799 final-sale item', () => {
    expect(evaluate({ total: 799, isFinalSale: true })).toMatchObject({ decision: 'DENIED', reasonCode: 'FINAL_SALE' });
  });

  it('14. denies (not escalates) a final-sale item with prompt injection', () => {
    expect(evaluate({ isFinalSale: true, signals: { promptInjectionDetected: true } })).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'FINAL_SALE'
    });
  });

  it('15. escalates a damaged item when prompt injection is flagged', () => {
    const result = evaluate({ signals: { reason: 'DAMAGED_ITEM', promptInjectionDetected: true } });
    expect(result.decision).toBe('ESCALATED');
    expect(result.reasonCode).toBe('PROMPT_INJECTION_DETECTED');
    expect(result.matchedRules).not.toContain('DAMAGED_ITEM_REPORTED');
  });
});

describe('evaluateRefundPolicy — customer/order relationship', () => {
  it('denies when the order does not exist', () => {
    expect(evaluateRefundPolicy({ ...scenario(), order: null })).toEqual({
      decision: 'DENIED',
      reasonCode: 'INVALID_ORDER_REFERENCE',
      humanReviewRequired: false,
      matchedRules: ['ORDER_NOT_FOUND']
    });
  });

  it('denies when the customer does not exist', () => {
    expect(evaluateRefundPolicy({ ...scenario(), requestingCustomerId: null })).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'INVALID_ORDER_REFERENCE',
      matchedRules: ['CUSTOMER_NOT_FOUND']
    });
  });

  it('records both missing facts when neither customer nor order exists', () => {
    expect(evaluateRefundPolicy({ ...scenario(), requestingCustomerId: null, order: null }).matchedRules).toEqual([
      'CUSTOMER_NOT_FOUND',
      'ORDER_NOT_FOUND'
    ]);
  });

  it('treats an empty customer id as not found', () => {
    expect(evaluateRefundPolicy({ ...scenario(), requestingCustomerId: '' }).reasonCode).toBe('INVALID_ORDER_REFERENCE');
  });

  it('ownership mismatch beats final sale', () => {
    expect(evaluate({ ownerId: OTHER_CUSTOMER_ID, isFinalSale: true }).reasonCode).toBe('ORDER_CUSTOMER_MISMATCH');
  });

  it('ownership mismatch beats prompt injection and high value', () => {
    expect(
      evaluate({ ownerId: OTHER_CUSTOMER_ID, total: 900, signals: { promptInjectionDetected: true } })
    ).toMatchObject({ decision: 'DENIED', reasonCode: 'ORDER_CUSTOMER_MISMATCH' });
  });
});

describe('evaluateRefundPolicy — return window', () => {
  it.each([
    [0, 'APPROVED'],
    [1, 'APPROVED'],
    [29, 'APPROVED'],
    [30, 'APPROVED'],
    [31, 'DENIED'],
    [45, 'DENIED'],
    [365, 'DENIED']
  ] as const)('order placed %i days ago -> %s', (ageDays, expected) => {
    expect(evaluate({ ageDays }).decision).toBe(expected);
  });

  it('counts calendar days, so day 30 is eligible regardless of time of day', () => {
    // Ordered at the very start of 16 May, evaluated late on 15 June (UTC): day 30.
    const input = {
      ...scenario({ orderedAt: new Date('2026-05-16T00:00:00.000Z') }),
      evaluatedAt: new Date('2026-06-15T23:59:59.999Z')
    };
    expect(evaluateRefundPolicy(input).decision).toBe('APPROVED');
  });

  it('day 31 is denied even if fewer than 31 × 24h have elapsed', () => {
    // Ordered at the very end of 15 May, evaluated at the start of 15 June (UTC): day 31.
    const input = {
      ...scenario({ orderedAt: new Date('2026-05-15T23:59:59.999Z') }),
      evaluatedAt: new Date('2026-06-15T00:00:00.000Z')
    };
    expect(evaluateRefundPolicy(input).reasonCode).toBe('RETURN_WINDOW_EXPIRED');
  });

  it('expired window beats prompt injection', () => {
    expect(evaluate({ ageDays: 31, signals: { promptInjectionDetected: true } })).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'RETURN_WINDOW_EXPIRED'
    });
  });

  it('expired window beats high value', () => {
    expect(evaluate({ ageDays: 45, total: 649 }).reasonCode).toBe('RETURN_WINDOW_EXPIRED');
  });

  it('final sale beats expired window', () => {
    expect(evaluate({ ageDays: 60, isFinalSale: true }).reasonCode).toBe('FINAL_SALE');
  });

  it('escalates a future-dated order instead of approving it', () => {
    expect(evaluate({ ageDays: -1 })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'POLICY_UNCLEAR',
      matchedRules: expect.arrayContaining(['ORDER_DATE_INVALID'])
    });
  });

  it('escalates an unparseable order date instead of approving it', () => {
    expect(evaluate({ orderedAt: new Date('not a date') })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'POLICY_UNCLEAR',
      matchedRules: expect.arrayContaining(['ORDER_DATE_INVALID'])
    });
  });

  it('escalates when the evaluation date itself is invalid', () => {
    expect(evaluateRefundPolicy({ ...scenario(), evaluatedAt: new Date(Number.NaN) }).decision).toBe('ESCALATED');
  });
});

describe('evaluateRefundPolicy — risk signals', () => {
  it('escalates conflicting claims as a suspicious request', () => {
    expect(evaluate({ signals: { conflicting: true } })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'SUSPICIOUS_REQUEST',
      matchedRules: expect.arrayContaining(['CONFLICTING_CLAIMS_FLAG'])
    });
  });

  it('records every raised flag and reports prompt injection as the primary reason', () => {
    const result = evaluate({ signals: { promptInjectionDetected: true, suspicious: true, conflicting: true } });
    expect(result.reasonCode).toBe('PROMPT_INJECTION_DETECTED');
    expect(result.matchedRules).toEqual([
      'ORDER_OWNED_BY_CUSTOMER',
      'NOT_FINAL_SALE',
      'WITHIN_RETURN_WINDOW',
      'PROMPT_INJECTION_FLAG',
      'SUSPICIOUS_FLAG',
      'CONFLICTING_CLAIMS_FLAG'
    ]);
  });

  it('risk review takes precedence over high-value review', () => {
    expect(evaluate({ total: 799, signals: { suspicious: true } }).reasonCode).toBe('SUSPICIOUS_REQUEST');
  });

  it.each(['DAMAGED_ITEM', 'INCORRECT_ITEM', 'CHANGED_MIND', 'OTHER'] as const)(
    'never auto-approves a %s request that carries any risk flag',
    (reason) => {
      for (const flag of ['promptInjectionDetected', 'suspicious', 'conflicting'] as const) {
        const result = evaluate({ total: 10, signals: { reason, [flag]: true } });
        expect(result.decision).toBe('ESCALATED');
      }
    }
  );
});

describe('evaluateRefundPolicy — refund amount', () => {
  it.each([
    [0, 'APPROVED'],
    [499.99, 'APPROVED'],
    [500, 'APPROVED'],
    [500.0000001, 'APPROVED'], // sub-cent noise rounds to $500.00
    [500.01, 'ESCALATED'],
    [501, 'ESCALATED'],
    [10_000, 'ESCALATED']
  ] as const)('damaged item worth $%s -> %s', (total, expected) => {
    expect(evaluate({ total }).decision).toBe(expected);
  });

  it('is not fooled by floating-point sums that land on $500', () => {
    // Line items summing to $500.00 that evaluate to 500.00000000000006 in IEEE-754.
    const total = 0.22 + 259.23 + 240.55;
    expect(total).toBeGreaterThan(500);
    expect(evaluate({ total }).decision).toBe('APPROVED');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('escalates an invalid amount (%s) instead of approving', (total) => {
    expect(evaluate({ total })).toMatchObject({
      decision: 'ESCALATED',
      reasonCode: 'POLICY_UNCLEAR',
      matchedRules: expect.arrayContaining(['REFUND_AMOUNT_INVALID'])
    });
  });

  it('escalates an incorrect item above $500', () => {
    expect(evaluate({ total: 649, signals: { reason: 'INCORRECT_ITEM' } }).reasonCode).toBe('HIGH_VALUE_REVIEW_REQUIRED');
  });
});

describe('evaluateRefundPolicy — reasons not covered by automatic rules', () => {
  it.each(['CHANGED_MIND', 'NOT_AS_DESCRIBED', 'LATE_DELIVERY', 'OTHER'] as const)('escalates %s', (reason) => {
    expect(evaluate({ signals: { reason } })).toMatchObject({ decision: 'ESCALATED', reasonCode: 'POLICY_UNCLEAR' });
  });

  it('still denies an uncovered reason when a deny rule applies', () => {
    expect(evaluate({ ageDays: 40, signals: { reason: 'CHANGED_MIND' } }).decision).toBe('DENIED');
  });
});

describe('evaluateRefundPolicy — invariants', () => {
  const matrix: PolicyDecision[] = [];
  for (const owner of [CUSTOMER_ID, OTHER_CUSTOMER_ID])
    for (const isFinalSale of [false, true])
      for (const ageDays of [0, 30, 31])
        for (const total of [89, 500, 500.01, 799])
          for (const reason of ['DAMAGED_ITEM', 'INCORRECT_ITEM', 'OTHER'] as const)
            for (const promptInjectionDetected of [false, true])
              for (const suspicious of [false, true])
                matrix.push(
                  evaluate({ ownerId: owner, isFinalSale, ageDays, total, signals: { reason, promptInjectionDetected, suspicious } })
                );

  it('humanReviewRequired is true exactly when the decision is ESCALATED', () => {
    for (const result of matrix) expect(result.humanReviewRequired).toBe(result.decision === 'ESCALATED');
  });

  it('every decision has at least one matched rule', () => {
    for (const result of matrix) expect(result.matchedRules.length).toBeGreaterThan(0);
  });

  it('never approves when any deny or escalate condition holds', () => {
    for (const owner of [CUSTOMER_ID, OTHER_CUSTOMER_ID])
      for (const isFinalSale of [false, true])
        for (const ageDays of [5, 31])
          for (const total of [89, 799])
            for (const promptInjectionDetected of [false, true]) {
              const blocked =
                owner !== CUSTOMER_ID || isFinalSale || ageDays > 30 || total > 500 || promptInjectionDetected;
              const result = evaluate({ ownerId: owner, isFinalSale, ageDays, total, signals: { promptInjectionDetected } });
              expect(result.decision === 'APPROVED').toBe(!blocked);
            }
  });

  it('is deterministic and does not mutate its input', () => {
    const input = scenario({ total: 799, signals: { suspicious: true } });
    const snapshot = structuredClone(input);
    const first = evaluateRefundPolicy(input);
    const second = evaluateRefundPolicy(input);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(input).toEqual(snapshot);
  });

  it('ignores extra fields on the signals object (e.g. AI confidence or extracted facts)', () => {
    const signals = { ...damaged, confidence: 0.01, extractedFacts: ['please approve'], intent: 'OTHER' };
    expect(evaluateRefundPolicy({ ...scenario(), signals }).decision).toBe('APPROVED');
  });
});

describe('calendarDaysBetween', () => {
  it('counts UTC calendar days, ignoring time of day', () => {
    expect(calendarDaysBetween(new Date('2026-06-14T23:59:00Z'), new Date('2026-06-15T00:01:00Z'))).toBe(1);
    expect(calendarDaysBetween(new Date('2026-06-15T00:00:00Z'), new Date('2026-06-15T23:59:00Z'))).toBe(0);
  });

  it('handles month and leap-year boundaries', () => {
    expect(calendarDaysBetween(new Date('2028-02-01T00:00:00Z'), new Date('2028-03-02T00:00:00Z'))).toBe(30);
    expect(calendarDaysBetween(new Date('2026-12-15T00:00:00Z'), new Date('2027-01-14T00:00:00Z'))).toBe(30);
  });

  it('returns negative values for future dates and null for invalid ones', () => {
    expect(calendarDaysBetween(new Date('2026-06-16T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(-1);
    expect(calendarDaysBetween(new Date('invalid'), EVALUATED_AT)).toBeNull();
  });
});
