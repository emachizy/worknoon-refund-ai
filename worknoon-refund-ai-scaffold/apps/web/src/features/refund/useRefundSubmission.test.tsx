import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRefundSubmission } from './useRefundSubmission';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('ignores a second submit while the first is in flight, even before a re-render', async () => {
  let resolve!: (r: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useRefundSubmission());
  const payload = { customerId: 'c1', orderNumber: 'ORD-1', message: 'It arrived broken.' };

  let first!: Promise<void>;
  act(() => {
    first = result.current.submit(payload);
    void result.current.submit(payload); // same tick: button not yet disabled
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolve(
      new Response(
        JSON.stringify({ requestId: 'r1', decision: 'APPROVED', humanReviewRequired: false, explanation: 'ok', createdAt: '2026-06-15T12:00:00Z' }),
        { status: 201 }
      )
    );
    await first;
  });
  expect(result.current.state.status).toBe('succeeded');
});
