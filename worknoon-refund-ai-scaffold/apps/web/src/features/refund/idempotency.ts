import type { RefundRequestPayload } from '../../types';

/** An idempotency key bound to the exact payload it was created for. */
export interface SubmissionKey {
  key: string;
  fingerprint: string;
}

export function fingerprintOf(payload: RefundRequestPayload): string {
  return JSON.stringify([payload.customerId, payload.orderNumber, payload.message.trim()]);
}

/**
 * Returns the key to send for this payload:
 * - the current key if the payload is unchanged (a retry of the same logical request), or
 * - a fresh key if there is none yet or the payload changed (a different logical request;
 *   reusing the old key would be rejected by the server as a conflict).
 */
export function keyForSubmission(
  current: SubmissionKey | null,
  payload: RefundRequestPayload,
  generate: () => string = createIdempotencyKey
): SubmissionKey {
  const fingerprint = fingerprintOf(payload);
  return current && current.fingerprint === fingerprint ? current : { key: generate(), fingerprint };
}

/**
 * crypto.randomUUID() only exists in secure contexts (HTTPS or localhost). When the dev server is
 * opened over plain HTTP on a LAN address it is missing, so fall back to getRandomValues, which is
 * available everywhere.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
