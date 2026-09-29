import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey, keyForSubmission } from './idempotency';
import { parseRefundResult } from '../../api/client';

const payload = { customerId: 'c1', orderNumber: 'ORD-1', message: 'It arrived broken.' };

afterEach(() => vi.restoreAllMocks());

describe('keyForSubmission', () => {
  it('creates a key when there is none', () => {
    expect(keyForSubmission(null, payload, () => 'k1').key).toBe('k1');
  });

  it('reuses the key for the same payload (a retry), ignoring surrounding whitespace', () => {
    const first = keyForSubmission(null, payload, () => 'k1');
    const retry = keyForSubmission(first, { ...payload, message: '  It arrived broken. ' }, () => 'k2');
    expect(retry).toBe(first);
  });

  it.each([
    ['message', { message: 'Different text.' }],
    ['order', { orderNumber: 'ORD-2' }],
    ['customer', { customerId: 'c2' }]
  ])('creates a new key when the %s changes', (_label, change) => {
    const first = keyForSubmission(null, payload, () => 'k1');
    expect(keyForSubmission(first, { ...payload, ...change }, () => 'k2').key).toBe('k2');
  });
});

describe('createIdempotencyKey', () => {
  it('uses crypto.randomUUID when available', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-4333-8444-555555555555');
    expect(createIdempotencyKey()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('falls back to getRandomValues outside secure contexts, producing a server-acceptable key', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const key = createIdempotencyKey();
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(createIdempotencyKey()).not.toBe(key);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('parseRefundResult', () => {
  const valid = {
    requestId: 'r1',
    decision: 'APPROVED',
    humanReviewRequired: false,
    explanation: 'ok',
    createdAt: '2026-06-15T12:00:00.000Z'
  };

  it('keeps only the customer-safe fields', () => {
    expect(parseRefundResult({ ...valid, reasonCode: 'X', matchedRules: ['Y'] })).toEqual(valid);
  });

  it.each([
    ['unknown decision', { ...valid, decision: 'MAYBE' }],
    ['missing explanation', { ...valid, explanation: undefined }],
    ['wrong type', { ...valid, humanReviewRequired: 'no' }],
    ['not an object', 'APPROVED'],
    ['null', null]
  ])('rejects a malformed response (%s)', (_label, value) => {
    expect(parseRefundResult(value)).toBeNull();
  });
});
