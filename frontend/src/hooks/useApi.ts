import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';

/**
 * Data-fetching hooks.
 *
 * Every screen loads its content through one of these, so loading / empty / error states
 * are handled consistently and a refresh after a mutation is a single call.
 */

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | Error | null;
  reload: () => void;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

/**
 * Runs `fetcher` whenever `deps` change. The fetcher must be stable (wrap it in
 * `useCallback`) or the request will loop.
 */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if ((caught as Error)?.name === 'AbortError') return;
        setError(caught as ApiError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, reload, setData };
}

export interface ActionState<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | null>;
  running: boolean;
  error: ApiError | Error | null;
  reset: () => void;
}

/**
 * Wraps a mutating call (POST/PATCH/DELETE). Returns `null` instead of throwing so the
 * caller can simply check for a falsy result and let the toast explain the failure.
 */
export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: { onError?: (error: unknown) => void } = {},
): ActionState<TArgs, TResult> {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const run = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    setRunning(true);
    setError(null);
    try {
      return await actionRef.current(...args);
    } catch (caught) {
      setError(caught as ApiError);
      onErrorRef.current?.(caught);
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, running, error, reset };
}

/** Debounces a rapidly changing value (search boxes). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
