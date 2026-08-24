/**
 * Pin the VNDB tag-filter argument order so the previous regression
 * (the operator hit `400 Invalid 'tag' filter: Invalid value.` on
 * `/tag/g201?tab=vndb`) cannot return silently.
 *
 * Per KANA.md, the tag filter accepts either a bare tag id OR a
 * three-element tuple `[id, maxSpoiler, minTagLevel]` where
 *
 *   maxSpoiler  -- integer 0/1/2 (the upper bound on the spoiler
 *                  level we tolerate)
 *   minTagLevel -- float in [0, 3] (the lower bound on the tag's
 *                  community-voted strength)
 *
 * The previous code swapped the second and third slots, putting the
 * float `1.2` into the integer spoiler slot, so the upstream
 * validator rejected the request. This test reaches into the request
 * builder via a stubbed POST so it cannot accidentally hit VNDB.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';

// `vndbPost` reaches the cache layer, then `throttledFetch`. We stub
// the entire `cachedFetch` module so the tag-filter call resolves
// against an in-process spy without ever touching the network.
const requestBodies: unknown[] = [];
const cacheEntryMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vndb-cache', () => ({
  cachedFetch: async (_url: string, init: RequestInit) => {
    requestBodies.push(JSON.parse((init.body as string) ?? '{}'));
    return { results: [] };
  },
  TTL: new Proxy({}, { get: () => 0 }),
  invalidateByPath: () => undefined,
  invalidateVnCache: () => undefined,
  readCachedJsonEntry: cacheEntryMock,
  readCachedJson: vi.fn(),
  readCachedJsonMany: vi.fn(),
}));

// `lib/vndb-throttle` is reached by the live `cachedFetch` path; the
// stub above means the throttler never runs, but tsc still imports
// it. Stub anyway so the helper is fully decoupled from real time.
vi.mock('@/lib/vndb-throttle', () => ({
  throttledFetch: async () => ({ json: async () => ({ results: [] }) }),
  getVndbThrottleStats: () => ({ inFlight: 0, queued: 0 }),
}));

import { fetchTopVnsByTag, readCachedTag, readCachedTopVnsByTag } from '@/lib/vndb';

afterEach(() => {
  requestBodies.length = 0;
  cacheEntryMock.mockReset();
});

describe('fetchTopVnsByTag — KANA tag-filter contract', () => {
  it('emits [id, maxSpoiler(int), minTagLevel(float)] in that order', async () => {
    await fetchTopVnsByTag('g9999');
    const body = requestBodies.at(-1) as { filters: unknown } | undefined;
    expect(body).toBeTruthy();
    expect(body!.filters).toEqual([
      'tag',
      '=',
      ['g9999', 1, 1.2], // [id, maxSpoiler=1 default, minTagLevel=1.2 default]
    ]);
  });

  it('honours an explicit maxSpoiler / minTagLevel override', async () => {
    await fetchTopVnsByTag('G9999', { spoiler: 2, lieThreshold: 0.6 });
    const body = requestBodies.at(-1) as { filters: unknown } | undefined;
    // tag id is lower-cased; numeric slots are passed through unchanged
    expect(body!.filters).toEqual(['tag', '=', ['g9999', 2, 0.6]]);
  });

  it('keeps the spoiler slot an integer — no float regression', async () => {
    await fetchTopVnsByTag('g9999');
    const body = requestBodies.at(-1) as { filters: [string, string, [string, number, number]] };
    const [, , tuple] = body.filters;
    expect(Number.isInteger(tuple[1])).toBe(true);
    expect(typeof tuple[2]).toBe('number');
  });

  it('uses the live tag body for cache-only tag reads', async () => {
    cacheEntryMock.mockResolvedValueOnce({
      data: { results: [{ id: 'g9999', name: 'Fixture' }], more: false },
      fetchedAt: 10,
      expiresAt: Date.now() + 60_000,
    });
    await expect(readCachedTag('G9999')).resolves.toEqual({
      tag: { id: 'g9999', name: 'Fixture' },
      fetchedAt: 10,
      expiresAt: expect.any(Number),
      stale: false,
    });
    expect(cacheEntryMock).toHaveBeenCalledWith(
      'POST',
      'POST /tag',
      expect.objectContaining({ filters: ['id', '=', 'g9999'], results: 1 }),
      expect.any(Function),
    );
  });

  it('returns null for cache misses and preserves expired ranked pages', async () => {
    cacheEntryMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(readCachedTag('g9998')).resolves.toBeNull();
    await expect(readCachedTopVnsByTag('g9998')).resolves.toBeNull();

    cacheEntryMock.mockResolvedValueOnce({
      data: { results: [{ id: 'v9998' }], more: true },
      fetchedAt: 20,
      expiresAt: Date.now() - 1,
    });
    await expect(readCachedTopVnsByTag('G9998', {
      results: 250,
      page: 0,
      spoiler: 2,
      lieThreshold: 0.5,
    })).resolves.toEqual({
      results: [{ id: 'v9998' }],
      more: true,
      fetchedAt: 20,
      expiresAt: expect.any(Number),
      stale: true,
    });
    expect(cacheEntryMock).toHaveBeenLastCalledWith(
      'POST',
      'POST /vn',
      expect.objectContaining({
        filters: ['tag', '=', ['g9998', 2, 0.5]],
        results: 100,
        page: 1,
      }),
      expect.any(Function),
    );
  });
});
