/**
 * Coverage for the stock-summary coalescing client branches the main suite
 * leaves open: vn-id validation + normalization in the decoder, the cache
 * TTL expiry, listener-error isolation, the malformed-response notify-null
 * path, and the reset of in-flight coalescing state.
 *
 * Fake timers drive the 60ms coalescing window and the 5-minute cache TTL
 * deterministically; real timers are restored on teardown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetStockSummaryClient,
  decodeStockSummaryResponse,
  subscribeStockSummary,
} from '@/lib/stock-summary-client';

const COALESCE_MS = 60;
const CACHE_TTL_MS = 5 * 60 * 1000;

function okFetch(summary: Record<string, { available: number; best_price: number | null }>) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary }) });
}

beforeEach(() => {
  vi.useFakeTimers();
  _resetStockSummaryClient();
});

afterEach(() => {
  _resetStockSummaryClient();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('decodeStockSummaryResponse', () => {
  it('returns null when the envelope has no summary object', () => {
    expect(decodeStockSummaryResponse(null)).toBeNull();
    expect(decodeStockSummaryResponse({})).toBeNull();
    expect(decodeStockSummaryResponse({ summary: 'x' })).toBeNull();
  });

  it('skips invalid vn ids and normalizes valid ones to lowercase', () => {
    const decoded = decodeStockSummaryResponse({
      summary: {
        V90017: { available: 1, best_price: 100 },
        'not a vn id': { available: 2, best_price: null },
        egs_500: { available: 3, best_price: 0 },
      },
    });
    expect(decoded).toEqual({
      v90017: { available: 1, best_price: 100 },
      egs_500: { available: 3, best_price: 0 },
    });
  });

  it('rejects entries with a negative or non-integer available count', () => {
    expect(decodeStockSummaryResponse({ summary: { v1: { available: 1.5, best_price: null } } })).toEqual({});
    expect(decodeStockSummaryResponse({ summary: { v1: { available: -2, best_price: null } } })).toEqual({});
  });

  it('rejects entries with a negative best_price but accepts null', () => {
    expect(decodeStockSummaryResponse({ summary: { v1: { available: 0, best_price: -1 } } })).toEqual({});
    expect(decodeStockSummaryResponse({ summary: { v1: { available: 0, best_price: null } } })).toEqual({
      v1: { available: 0, best_price: null },
    });
  });

  it('rejects an entry whose value is a primitive rather than an object', () => {
    expect(decodeStockSummaryResponse({ summary: { v1: 'not an object', v2: 42 } })).toEqual({});
  });
});

describe('subscribeStockSummary cache lifecycle', () => {
  it('re-fetches after the cache TTL expires rather than serving stale data', async () => {
    const fetchMock = okFetch({ v1: { available: 1, best_price: 100 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;

    subscribeStockSummary('v1', () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within the TTL: the second subscriber is served from cache, no fetch.
    let early: unknown;
    subscribeStockSummary('v1', (v) => { early = v; });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(early).toEqual({ available: 1, best_price: 100 });

    // After the TTL elapses: the cached record is dropped and a re-fetch fires.
    await vi.advanceTimersByTimeAsync(CACHE_TTL_MS + 1);
    subscribeStockSummary('v1', () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('notifies every subscriber with null when the response is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: 'broken' }) });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    let v1: unknown = undefined;
    subscribeStockSummary('v1', (v) => { v1 = v; });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(v1).toBeNull();
  });

  it('notifies every subscriber with null when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    let v1: unknown = undefined;
    subscribeStockSummary('v1', (v) => { v1 = v; });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(v1).toBeNull();
  });

  it('isolates a throwing listener so siblings still receive their value', async () => {
    const fetchMock = okFetch({ v1: { available: 4, best_price: 500 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const good = vi.fn();
    subscribeStockSummary('v1', () => { throw new Error('listener boom'); });
    subscribeStockSummary('v1', good);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(good).toHaveBeenCalledWith({ available: 4, best_price: 500 });
  });

  it('evicts the oldest cache entry once the cache exceeds its max size', async () => {
    // 501 distinct ids in one window overflow the 500-entry LRU cache.
    const ids = Array.from({ length: 501 }, (_, i) => `v${1000 + i}`);
    const summary = Object.fromEntries(ids.map((id) => [id, { available: 1, best_price: 100 }]));
    const fetchMock = okFetch(summary);
    (globalThis as { fetch: unknown }).fetch = fetchMock;

    for (const id of ids) subscribeStockSummary(id, () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The very first id was evicted, so a fresh subscribe re-queues + re-fetches it.
    subscribeStockSummary(ids[0], () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A still-cached late id (the last one inserted) is served without a fetch.
    let lateCount = fetchMock.mock.calls.length;
    subscribeStockSummary(ids[ids.length - 1], () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(lateCount);
  });

  it('does not fire a queued fetch after the coalescing state is reset', async () => {
    const fetchMock = okFetch({ v1: { available: 1, best_price: 100 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    subscribeStockSummary('v1', () => {});
    _resetStockSummaryClient();
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes the cache entry when overlapping requests resolve for the same VN', async () => {
    const resolvers: Array<(value: { ok: true; json: () => Promise<{ summary: { v1: { available: number; best_price: number } } }> }) => void> = [];
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    subscribeStockSummary('v1', () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    subscribeStockSummary('v1', () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    resolvers[0]({ ok: true, json: async () => ({ summary: { v1: { available: 1, best_price: 100 } } }) });
    await vi.advanceTimersByTimeAsync(0);
    resolvers[1]({ ok: true, json: async () => ({ summary: { v1: { available: 2, best_price: 200 } } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not deliver a cached value to a subscriber that unsubscribes before its microtask', async () => {
    const fetchMock = okFetch({ v1: { available: 9, best_price: 90 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    subscribeStockSummary('v1', () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    // Second subscriber reads from cache via queueMicrotask, but unsubscribes
    // synchronously first → the alive guard suppresses the late callback.
    const late = vi.fn();
    const unsub = subscribeStockSummary('v1', late);
    unsub();
    await vi.advanceTimersByTimeAsync(0);
    expect(late).not.toHaveBeenCalled();
  });

  it('unsubscribing the only listener still resolves the in-flight fetch without throwing', async () => {
    const fetchMock = okFetch({ v1: { available: 2, best_price: 200 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const unsub = subscribeStockSummary('v1', () => {});
    unsub();
    // A second unsubscribe is a no-op (listener set already cleared).
    unsub();
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
