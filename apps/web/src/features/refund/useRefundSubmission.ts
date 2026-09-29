import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { RefundRequestPayload, RefundResult } from '../../types';
import { keyForSubmission, type SubmissionKey } from './idempotency';

export type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'succeeded'; result: RefundResult }
  | { status: 'failed'; error: unknown };

export interface SubmissionOptions {
  /** Test seam for the automatic transient-failure retry delay. */
  retryDelayMs?: number;
}

/**
 * Owns the lifecycle of one logical refund request, including its idempotency key:
 * - the key is created on first submit and reused for any retry of the same payload;
 * - after a result, re-submitting is only possible via reset(), which discards the key,
 *   so the next request gets a new one;
 * - the key is kept in a ref, never regenerated on render.
 */
export function useRefundSubmission(options: SubmissionOptions = {}) {
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const keyRef = useRef<SubmissionKey | null>(null);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (payload: RefundRequestPayload) => {
      // Guards against double clicks before React has re-rendered the disabled button.
      if (inFlight.current) return;
      inFlight.current = true;
      keyRef.current = keyForSubmission(keyRef.current, payload);
      setState({ status: 'submitting' });
      try {
        const result = await api.submitRefund(payload, keyRef.current.key, { retryDelayMs: options.retryDelayMs });
        setState({ status: 'succeeded', result });
      } catch (error) {
        // A conflict means the key was already used for different data; start over with a new key.
        if (error instanceof ApiError && error.status === 409) keyRef.current = null;
        setState({ status: 'failed', error });
      } finally {
        inFlight.current = false;
      }
    },
    [options.retryDelayMs]
  );

  const reset = useCallback(() => {
    keyRef.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, submit, reset };
}
