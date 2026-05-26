/**
 * Coalescing logic for the StockChip lazy-fetch path. Uses a stubbed
 * global fetch to avoid hitting a server during tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetStockSummaryClient,
  subscribeStockSummary,
} from '@/lib/stock-summary-client';

function setupFetchMock(response: Record<string, { available: number; best_price: number | null }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ summary: response }),
  });
}

beforeEach(() => {
  _resetStockSummaryClient();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('subscribeStockSummary', () => {
  it('coalesces multiple subscriptions in the same tick into one fetch', async () => {
    const fetchMock = setupFetchMock({ v1: { available: 1, best_price: 100 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const seen: Array<{ vn: string; value: unknown }> = [];
    subscribeStockSummary('v1', (v) => seen.push({ vn: 'v1', value: v }));
    subscribeStockSummary('v2', (v) => seen.push({ vn: 'v2', value: v }));
    subscribeStockSummary('v3', (v) => seen.push({ vn: 'v3', value: v }));
    // Wait for coalesce window + microtasks
    await new Promise((r) => setTimeout(r, 120));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toMatch(/ids=v1[,%]/);
    expect(url).toContain('v2');
    expect(url).toContain('v3');
    expect(seen.find((s) => s.vn === 'v1')?.value).toEqual({ available: 1, best_price: 100 });
    expect(seen.find((s) => s.vn === 'v2')?.value).toBeNull();
    expect(seen.find((s) => s.vn === 'v3')?.value).toBeNull();
  });

  it('serves cached results synchronously to later subscribers', async () => {
    const fetchMock = setupFetchMock({ v1: { available: 2, best_price: 500 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    subscribeStockSummary('v1', () => {});
    await new Promise((r) => setTimeout(r, 120));
    // Second subscriber should NOT trigger another fetch.
    let lateCalled: { available: number; best_price: number | null } | null | undefined;
    subscribeStockSummary('v1', (v) => { lateCalled = v; });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lateCalled).toEqual({ available: 2, best_price: 500 });
  });

  it('notifies every subscriber even on fetch failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    let v1: unknown = undefined;
    let v2: unknown = undefined;
    subscribeStockSummary('v1', (v) => { v1 = v; });
    subscribeStockSummary('v2', (v) => { v2 = v; });
    await new Promise((r) => setTimeout(r, 120));
    expect(v1).toBeNull();
    expect(v2).toBeNull();
  });

  it('unsubscribe stops further notifications', async () => {
    const fetchMock = setupFetchMock({ v1: { available: 3, best_price: 800 } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const calls: unknown[] = [];
    const unsub = subscribeStockSummary('v1', (v) => calls.push(v));
    unsub();
    await new Promise((r) => setTimeout(r, 120));
    expect(calls).toHaveLength(0);
  });
});
