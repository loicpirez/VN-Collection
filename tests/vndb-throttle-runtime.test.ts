/**
 * Runtime coverage for `src/lib/vndb-throttle.ts` — the 1 req/s rate limiter,
 * 429 Retry-After handling, network-error exponential back-off, and the soft
 * circuit breaker.
 *
 * The module keeps process-global counters (`activeCount`, `recent429s`,
 * `lastStart`), so each test re-imports it fresh via `vi.resetModules()`.
 * Deterministic timers drive every sleep; the suite never waits on real
 * wall-clock time. The single network primitive (`providerFetch`) is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerFetchMock } = vi.hoisted(() => ({ providerFetchMock: vi.fn() }));

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

const VNDB = 'https://api.vndb.org/kana/vn';

/** Re-import the throttle with a clean module-global state. */
async function freshThrottle(): Promise<typeof import('@/lib/vndb-throttle')> {
  vi.resetModules();
  return import('@/lib/vndb-throttle');
}

beforeEach(() => {
  providerFetchMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  providerFetchMock.mockReset();
});

describe('happy path', () => {
  it('passes the request straight through and returns the response', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const res = await throttledFetch(VNDB, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    // The provider id defaults to 'vndb'.
    expect(providerFetchMock.mock.calls[0][2]).toBe('vndb');
  });

  it('forwards a non-default provider id', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await throttledFetch(VNDB, {}, 'vndbmirror');
    expect(providerFetchMock.mock.calls[0][2]).toBe('vndbmirror');
  });

  it('supplies an empty request init when the caller omits it', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await throttledFetch(VNDB);
    expect(providerFetchMock.mock.calls[0][1]).toEqual({});
  });
});

describe('SSRF gate', () => {
  it('rejects a non-allowlisted URL before any fetch', async () => {
    const { throttledFetch } = await freshThrottle();
    await expect(throttledFetch('http://169.254.169.254/', {})).rejects.toThrow(
      /refusing fetch to non-allowlisted URL/,
    );
    expect(providerFetchMock).not.toHaveBeenCalled();
  });
});

describe('1 req/s serialization', () => {
  it('delays the second concurrent request by the minimum gap', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const p1 = throttledFetch(VNDB, {});
    const p2 = throttledFetch(VNDB, {});

    // First acquires immediately; the second is gated behind MIN_GAP_MS.
    await vi.advanceTimersByTimeAsync(0);
    await p1;
    expect(providerFetchMock).toHaveBeenCalledTimes(1);

    // Before the gap elapses the second request is still waiting.
    await vi.advanceTimersByTimeAsync(500);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);

    // After the full 1 s gap it fires.
    await vi.advanceTimersByTimeAsync(600);
    await p2;
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('429 Retry-After handling', () => {
  it('sleeps the Retry-After window then retries and succeeds', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock
      .mockResolvedValueOnce(new Response('rate', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const p = throttledFetch(VNDB, {});
    // Flush the first attempt (429) — the retry sleep is now armed.
    await vi.advanceTimersByTimeAsync(0);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);

    // Retry-After=3s → 3000ms sleep, then a fresh acquire + fetch.
    await vi.advanceTimersByTimeAsync(3_000);
    const res = await p;
    expect(res.status).toBe(200);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns the final 429 once the retry budget is exhausted', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock.mockResolvedValue(new Response('rate', { status: 429 }));

    const p = throttledFetch(VNDB, {});
    // No Retry-After header → floor of 2000ms per wait. Three attempts total
    // (initial + MAX_RETRY=2), each separated by a 2 s sleep.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await p;
    expect(res.status).toBe(429);
    expect(providerFetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('network-error back-off', () => {
  it('retries a transient fetch rejection with exponential back-off', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const p = throttledFetch(VNDB, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    // First back-off = NET_ERR_RETRY_BASE_MS * 2^0 = 1000ms.
    await vi.advanceTimersByTimeAsync(1_000);
    const res = await p;
    expect(res.status).toBe(200);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows the error after the retry budget is spent', async () => {
    const { throttledFetch } = await freshThrottle();
    providerFetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const p = throttledFetch(VNDB, {});
    // Attach the rejection handler synchronously so the eventual reject is
    // never an unhandled rejection while the timers advance.
    const settled = expect(p).rejects.toThrow(/fetch failed/);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await settled;
    expect(providerFetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('soft circuit breaker + stats', () => {
  it('opens after 3 piled-up 429s and reports it via getVndbThrottleStats', async () => {
    const { throttledFetch, getVndbThrottleStats } = await freshThrottle();

    // Each call returns a 429 with no Retry-After and exhausts its retry
    // budget, contributing several 429 timestamps to the rolling window.
    providerFetchMock.mockResolvedValue(new Response('rate', { status: 429 }));
    const p = throttledFetch(VNDB, {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await p;

    const stats = getVndbThrottleStats();
    // Three 429 responses were recorded inside the 60 s window, tripping the
    // breaker. A retry-after deadline is also surfaced for the UI.
    expect(stats.recent429s).toBeGreaterThanOrEqual(3);
    expect(stats.circuitOpen).toBe(true);
    expect(stats.retryAfterMs).toBeGreaterThan(0);
    expect(stats.active).toBe(0);
  });

  it('parks a new acquirer while the circuit is open, then proceeds once it closes', async () => {
    const { throttledFetch } = await freshThrottle();

    // Trip the breaker with one 429-exhausting call (3 recorded 429s).
    providerFetchMock.mockResolvedValueOnce(new Response('rate', { status: 429 }));
    providerFetchMock.mockResolvedValueOnce(new Response('rate', { status: 429 }));
    providerFetchMock.mockResolvedValueOnce(new Response('rate', { status: 429 }));
    const tripper = throttledFetch(VNDB, {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await tripper;

    // A subsequent acquirer is held by the soft pause while the breaker is open.
    providerFetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const callsBefore = providerFetchMock.mock.calls.length;
    const p = throttledFetch(VNDB, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(providerFetchMock.mock.calls.length).toBe(callsBefore);
    // Still parked after one soft-pause cycle — the breaker has not yet closed.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(providerFetchMock.mock.calls.length).toBe(callsBefore);
    // Once the 60 s 429-window elapses the breaker closes and the request fires.
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await p;
    expect(res.status).toBe(200);
    expect(providerFetchMock.mock.calls.length).toBe(callsBefore + 1);
  });
});
