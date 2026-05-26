'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * `useDebouncedCallback(fn, delayMs)` — returns a stable callback that delays
 * the invocation of `fn` until `delayMs` ms have passed since the last call.
 * Subsequent calls within the window reset the timer. The latest `fn`
 * reference is always used (avoids stale closure).
 *
 * On unmount the pending timer is cleared automatically so we never call
 * `fn` against a dead component.
 *
 * Replaces the inline `setTimeout(...)` + `debounceRef` boilerplate that
 * previously lived in 7 picker components.
 *
 * @example
 *   const debounced = useDebouncedCallback((q: string) => fetchHits(q), 250);
 *   <input onChange={(e) => debounced(e.target.value)} />
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest fn reference without recreating the callback identity.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  // Clean up the pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback((...args: TArgs) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fnRef.current(...args);
    }, delayMs);
  }, [delayMs]);
}
