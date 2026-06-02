/**
 * TESTA-018 — runtime SSRF gate on the VNDB read cache and throttled
 * write path.
 *
 * Earlier coverage pinned only the source string of the
 * `isAllowedHttpTarget` guard. This drives the guard at runtime: the
 * single network primitive (`providerFetch`) is replaced with a spy, and
 * loopback / link-local URLs are pushed through both `cachedFetch`
 * (whose private `doFetch` carries the cache-side gate) and
 * `throttledFetch` (the write / status-push path). Each must reject
 * BEFORE any fetch, so the spy stays at zero calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerFetchMock } = vi.hoisted(() => ({ providerFetchMock: vi.fn() }));

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

const PRIVATE_URLS = ['http://127.0.0.1', 'http://169.254.169.254'];

beforeEach(() => {
  providerFetchMock.mockReset();
  providerFetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => {
  providerFetchMock.mockReset();
});

describe('throttledFetch — runtime SSRF gate', () => {
  it.each(PRIVATE_URLS)('rejects %s before issuing any fetch', async (url) => {
    const { throttledFetch } = await import('@/lib/vndb-throttle');
    await expect(throttledFetch(url, {}, 'vndb')).rejects.toThrow(/refusing fetch to non-allowlisted URL/);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });
});

describe('cachedFetch doFetch — runtime SSRF gate', () => {
  it.each(PRIVATE_URLS)('rejects %s before issuing any fetch', async (url) => {
    const { cachedFetch, TTL } = await import('@/lib/vndb-cache');
    await expect(
      cachedFetch(url, { __pathTag: `GET ${url}` }, { ttlMs: TTL.vnDetail }),
    ).rejects.toThrow(/refusing fetch to non-allowlisted URL/);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });
});
