import { describe, expect, it } from 'vitest';
import { evaluateRefundPolicy } from '../../src/services/policy.service.js';
import type { AiClassification, PolicyInput } from '../../src/types/refund.js';

const classification: AiClassification = {
  intent: 'REFUND_REQUEST',
  reason: 'DAMAGED_ITEM',
  confidence: 0.95,
  suspicious: false,
  conflicting: false,
  promptInjectionDetected: false,
  extractedFacts: []
};

const base: PolicyInput = {
  orderExists: true,
  ownsOrder: true,
  isFinalSale: false,
  daysSinceOrder: 10,
  refundAmount: 100,
  classification
};

describe('evaluateRefundPolicy', () => {
  it('approves eligible damaged items', () => {
    expect(evaluateRefundPolicy(base).decision).toBe('APPROVED');
  });

  it('denies final-sale items', () => {
    expect(evaluateRefundPolicy({ ...base, isFinalSale: true }).decision).toBe('DENIED');
  });

  it('denies orders outside the refund window', () => {
    expect(evaluateRefundPolicy({ ...base, daysSinceOrder: 31 }).decision).toBe('DENIED');
  });

  it('escalates high-value refunds', () => {
    expect(evaluateRefundPolicy({ ...base, refundAmount: 501 }).decision).toBe('ESCALATED');
  });

  it('escalates prompt injection attempts', () => {
    expect(evaluateRefundPolicy({
      ...base,
      classification: { ...classification, promptInjectionDetected: true }
    }).decision).toBe('ESCALATED');
  });
});
