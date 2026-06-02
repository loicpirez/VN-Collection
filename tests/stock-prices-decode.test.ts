import { describe, expect, it, vi } from 'vitest';
import { extrasFromStockSnapshot, fetchStockPriceExtras } from '@/lib/stock-prices';

/**
 * Covers the decode-and-fetch branches the existing stock-prices-section
 * suite leaves open: a missing eroge_price status row, malformed snapshot
 * envelopes, the non-ok HTTP path, the invalid-payload path, and the
 * post-resolve abort short-circuit.
 */

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const VALID_SNAPSHOT = {
  statuses: [{ provider: 'eroge_price', extras_json: null }],
};

describe('extrasFromStockSnapshot', () => {
  it('returns null when there is no eroge_price row', () => {
    expect(extrasFromStockSnapshot({ statuses: [{ provider: 'sofmap' }] })).toBeNull();
  });

  it('returns null for a null/undefined snapshot', () => {
    expect(extrasFromStockSnapshot(null)).toBeNull();
    expect(extrasFromStockSnapshot(undefined)).toBeNull();
  });

  it('returns null when the eroge_price row has no extras blob', () => {
    expect(extrasFromStockSnapshot(VALID_SNAPSHOT)).toBeNull();
  });
});

describe('fetchStockPriceExtras', () => {
  it('throws on a non-ok HTTP response', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));
    await expect(
      fetchStockPriceExtras('v90001', new AbortController().signal, request as unknown as typeof fetch),
    ).rejects.toThrow('HTTP 500');
  });

  it('throws when the payload is not a valid stock snapshot', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ statuses: [{ provider: 5 }] }));
    await expect(
      fetchStockPriceExtras('v90001', new AbortController().signal, request as unknown as typeof fetch),
    ).rejects.toThrow('invalid stock payload');
  });

  it('rejects a malformed statuses entry where extras_json is the wrong type', async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({ statuses: [{ provider: 'eroge_price', extras_json: 12 }] }),
    );
    await expect(
      fetchStockPriceExtras('v90001', new AbortController().signal, request as unknown as typeof fetch),
    ).rejects.toThrow('invalid stock payload');
  });

  it('returns null without decoding when the signal aborted after the response resolved', async () => {
    const controller = new AbortController();
    const request = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(jsonResponse({ statuses: [] }));
    });
    const result = await fetchStockPriceExtras('v90001', controller.signal, request as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null when the snapshot has no eroge_price extras', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(VALID_SNAPSHOT));
    const result = await fetchStockPriceExtras('v90001', new AbortController().signal, request as unknown as typeof fetch);
    expect(result).toBeNull();
    const url = request.mock.calls[0]?.[0] as string;
    expect(url).toBe('/api/vn/v90001/stock');
  });
});
