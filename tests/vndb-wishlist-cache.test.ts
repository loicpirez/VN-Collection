import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VndbUlistEntry } from '@/lib/vndb';

type WishlistResult = VndbUlistEntry[] | { needsAuth: true };

const fetchWishlistMock = vi.hoisted(() => vi.fn<() => Promise<WishlistResult>>());

vi.mock('@/lib/vndb', () => ({
  fetchAuthenticatedWishlist: fetchWishlistMock,
}));

import {
  getCachedVndbWishlistIds,
  invalidateVndbWishlistCache,
} from '@/lib/vndb-wishlist-cache';

function entry(id: string): VndbUlistEntry {
  return {
    id,
    added: 0,
    voted: null,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: [{ id: 5, label: 'Wishlist' }],
    vn: {
      id,
      title: id,
      alttitle: null,
      released: null,
      rating: null,
      votecount: null,
      length_minutes: null,
      languages: [],
      platforms: [],
      image: null,
      developers: [],
    },
  };
}

beforeEach(() => {
  invalidateVndbWishlistCache();
  fetchWishlistMock.mockReset();
  vi.useRealTimers();
});

describe('VNDB wishlist cache', () => {
  it('reuses a successful wishlist snapshot until its TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    fetchWishlistMock
      .mockResolvedValueOnce([entry('v90001')])
      .mockResolvedValueOnce([entry('v90002')]);

    expect([...(await getCachedVndbWishlistIds()) ?? []]).toEqual(['v90001']);
    expect([...(await getCachedVndbWishlistIds()) ?? []]).toEqual(['v90001']);
    expect(fetchWishlistMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_001);
    expect([...(await getCachedVndbWishlistIds()) ?? []]).toEqual(['v90002']);
    expect(fetchWishlistMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent wishlist reads into one upstream request', async () => {
    let resolveFetch: (value: WishlistResult) => void = () => undefined;
    fetchWishlistMock.mockImplementation(() => new Promise<WishlistResult>((resolve) => {
      resolveFetch = resolve;
    }));

    const first = getCachedVndbWishlistIds();
    const second = getCachedVndbWishlistIds();
    expect(fetchWishlistMock).toHaveBeenCalledTimes(1);
    resolveFetch([entry('v90003')]);

    await expect(first).resolves.toEqual(new Set(['v90003']));
    await expect(second).resolves.toEqual(new Set(['v90003']));
  });

  it('briefly caches unavailable authentication and upstream failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    fetchWishlistMock
      .mockResolvedValueOnce({ needsAuth: true })
      .mockRejectedValueOnce(new Error('upstream unavailable'));

    await expect(getCachedVndbWishlistIds()).resolves.toBeNull();
    await expect(getCachedVndbWishlistIds()).resolves.toBeNull();
    expect(fetchWishlistMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_001);
    await expect(getCachedVndbWishlistIds()).resolves.toBeNull();
    expect(fetchWishlistMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a request invalidated in flight repopulate the cache', async () => {
    let resolveFirst: (value: WishlistResult) => void = () => undefined;
    fetchWishlistMock
      .mockImplementationOnce(() => new Promise<WishlistResult>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce([entry('v90005')]);

    const stale = getCachedVndbWishlistIds();
    invalidateVndbWishlistCache();
    resolveFirst([entry('v90004')]);
    await expect(stale).resolves.toEqual(new Set(['v90004']));

    await expect(getCachedVndbWishlistIds()).resolves.toEqual(new Set(['v90005']));
    expect(fetchWishlistMock).toHaveBeenCalledTimes(2);
  });
});
