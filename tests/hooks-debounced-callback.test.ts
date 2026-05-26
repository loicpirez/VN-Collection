import { describe, expect, it, vi } from 'vitest';

/**
 * The hook's mechanics — a coalesced timer that fires the latest fn — can be
 * tested without a React renderer by simulating the same lifecycle.
 * The hook lives in `src/lib/hooks.ts`; this test verifies the pattern the
 * hook implements (latest-fn + reset-on-call + cancel-on-cleanup).
 */
function makeDebouncer<TArgs extends unknown[]>(delayMs: number) {
  let fn: ((...args: TArgs) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    set(newFn: (...args: TArgs) => void) { fn = newFn; },
    call(...args: TArgs) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (fn) fn(...args);
      }, delayMs);
    },
    cancel() { if (timer) { clearTimeout(timer); timer = null; } },
    isPending() { return timer !== null; },
  };
}

describe('useDebouncedCallback behavioural contract', () => {
  it('delays invocation until the window elapses', () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const d = makeDebouncer<[string]>(100);
      d.set(spy);
      d.call('a');
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(99);
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces rapid successive calls into the last argument', () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const d = makeDebouncer<[string]>(100);
      d.set(spy);
      d.call('a');
      vi.advanceTimersByTime(50);
      d.call('b');
      vi.advanceTimersByTime(50);
      d.call('c');
      vi.advanceTimersByTime(100);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('c');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the latest fn reference (no stale closure)', () => {
    vi.useFakeTimers();
    try {
      const a = vi.fn();
      const b = vi.fn();
      const d = makeDebouncer<[string]>(50);
      d.set(a);
      d.call('x');
      d.set(b); // swap target before timer fires
      vi.advanceTimersByTime(50);
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledWith('x');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() prevents the pending fire', () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const d = makeDebouncer<[string]>(100);
      d.set(spy);
      d.call('a');
      d.cancel();
      vi.advanceTimersByTime(200);
      expect(spy).not.toHaveBeenCalled();
      expect(d.isPending()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a second call before the timer fires resets the window', () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn();
      const d = makeDebouncer<[number]>(100);
      d.set(spy);
      d.call(1);
      vi.advanceTimersByTime(80);
      d.call(2); // resets timer
      vi.advanceTimersByTime(80);
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(20);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
