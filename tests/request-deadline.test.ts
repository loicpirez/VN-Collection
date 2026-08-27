import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestDeadline, INTERACTIVE_UPSTREAM_TIMEOUT_MS } from '@/lib/request-deadline';

afterEach(() => {
  vi.useRealTimers();
});

describe('createRequestDeadline', () => {
  it('allows a cold VN detail fanout to drain through the serialized upstream queue', () => {
    expect(INTERACTIVE_UPSTREAM_TIMEOUT_MS).toBe(30_000);
  });

  it('aborts when the parent request is canceled', () => {
    const parent = new AbortController();
    const deadline = createRequestDeadline(parent.signal);
    parent.abort();
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.signal.reason).toMatchObject({ name: 'AbortError' });
    deadline.dispose();
  });

  it('aborts with a timeout error after the configured deadline', async () => {
    vi.useFakeTimers();
    const deadline = createRequestDeadline(new AbortController().signal, 25);
    await vi.advanceTimersByTimeAsync(25);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.signal.reason).toMatchObject({ name: 'TimeoutError' });
    deadline.dispose();
  });

  it('cancels the timer when work completes', async () => {
    vi.useFakeTimers();
    const deadline = createRequestDeadline(new AbortController().signal, 25);
    deadline.dispose();
    await vi.advanceTimersByTimeAsync(25);
    expect(deadline.signal.aborted).toBe(false);
  });
});
