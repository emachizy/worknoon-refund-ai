import { describe, expect, it } from 'vitest';
import { seedOrders } from '../../src/data/seedData.js';
import { evaluateRefundPolicy, type PolicyRequestSignals } from '../../src/services/policy.service.js';

// Resolves seed fixtures the same way ensureSeedData does (orderedAt = now - daysAgo),
// against a fixed clock, and checks each fixture lands on the branch its comment claims.
const EVALUATED_AT = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 86_400_000;

const noRisk = { suspicious: false, conflicting: false, promptInjectionDetected: false };
const signals = {
  damaged: { reason: 'DAMAGED_ITEM', ...noRisk },
  incorrect: { reason: 'INCORRECT_ITEM', ...noRisk },
  changedMind: { reason: 'CHANGED_MIND', ...noRisk },
  injection: { reason: 'DAMAGED_ITEM', ...noRisk, promptInjectionDetected: true },
  suspicious: { reason: 'DAMAGED_ITEM', ...noRisk, suspicious: true }
} satisfies Record<string, PolicyRequestSignals>;

function evaluateSeed(orderNumber: string, requestSignals: PolicyRequestSignals, requestingEmail?: string) {
  const order = seedOrders.find((o) => o.orderNumber === orderNumber);
  if (!order) throw new Error(`Unknown seed order ${orderNumber}`);
  return evaluateRefundPolicy({
    requestingCustomerId: requestingEmail ?? order.customerEmail,
    order: {
      customerId: order.customerEmail,
      total: order.total,
      orderedAt: new Date(EVALUATED_AT.getTime() - order.daysAgo * DAY_MS),
      isFinalSale: order.isFinalSale
    },
    signals: requestSignals,
    evaluatedAt: EVALUATED_AT
  });
}

describe('seed fixtures exercise every policy branch', () => {
  it.each([
    ['ORD-1001', signals.damaged, 'APPROVED', 'DAMAGED_ITEM'],
    ['ORD-1016', signals.incorrect, 'APPROVED', 'INCORRECT_ITEM'],
    ['ORD-1002', signals.changedMind, 'ESCALATED', 'POLICY_UNCLEAR'],
    ['ORD-1017', signals.damaged, 'DENIED', 'RETURN_WINDOW_EXPIRED'],
    ['ORD-1004', signals.damaged, 'DENIED', 'RETURN_WINDOW_EXPIRED'],
    ['ORD-1005', signals.damaged, 'ESCALATED', 'HIGH_VALUE_REVIEW_REQUIRED'],
    ['ORD-1006', signals.damaged, 'DENIED', 'FINAL_SALE'],
    ['ORD-1007', signals.injection, 'ESCALATED', 'PROMPT_INJECTION_DETECTED'],
    ['ORD-1019', signals.damaged, 'DENIED', 'RETURN_WINDOW_EXPIRED'],
    ['ORD-1008', signals.damaged, 'APPROVED', 'DAMAGED_ITEM'],
    ['ORD-1009', signals.damaged, 'DENIED', 'RETURN_WINDOW_EXPIRED'],
    ['ORD-1010', signals.damaged, 'DENIED', 'FINAL_SALE'],
    ['ORD-1011', signals.damaged, 'APPROVED', 'DAMAGED_ITEM'],
    ['ORD-1012', signals.damaged, 'DENIED', 'FINAL_SALE'],
    ['ORD-1013', signals.suspicious, 'ESCALATED', 'SUSPICIOUS_REQUEST'],
    ['ORD-1014', signals.damaged, 'ESCALATED', 'HIGH_VALUE_REVIEW_REQUIRED'],
    ['ORD-1021', signals.damaged, 'DENIED', 'RETURN_WINDOW_EXPIRED']
  ] as const)('%s -> %s (%s)', (orderNumber, requestSignals, decision, reasonCode) => {
    expect(evaluateSeed(orderNumber, requestSignals)).toMatchObject({ decision, reasonCode });
  });

  it('a customer requesting another customer\'s seed order is denied', () => {
    expect(evaluateSeed('ORD-1001', signals.damaged, 'customer2@example.com')).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'ORDER_CUSTOMER_MISMATCH'
    });
  });
});
