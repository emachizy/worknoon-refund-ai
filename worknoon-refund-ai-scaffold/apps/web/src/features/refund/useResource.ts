import { useCallback, useEffect, useState } from 'react';
import { isAbort } from '../../api/client';

export type Resource<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: unknown };

/**
 * Loads data for `key` (null = nothing to load). When the key changes, the previous request is
 * aborted and its late response ignored, so switching customers quickly can never show the
 * previous customer's orders.
 */
export function useResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; resource: Resource<T> }>({
    key,
    resource: key ? { status: 'loading' } : { status: 'idle' }
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) {
      setState({ key, resource: { status: 'idle' } });
      return;
    }
    const controller = new AbortController();
    setState({ key, resource: { status: 'loading' } });
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, resource: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted && !isAbort(error)) setState({ key, resource: { status: 'error', error } });
      }
    );
    return () => controller.abort();
    // `load` is intentionally not a dependency: callers pass inline closures keyed by `key`.
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Until the effect for a new key runs, report loading rather than the previous key's data.
  const resource: Resource<T> = state.key === key ? state.resource : key ? { status: 'loading' } : { status: 'idle' };
  return { resource, retry };
}
