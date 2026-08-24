import { beforeEach, describe, expect, it, vi } from 'vitest';

const listIdsMock = vi.hoisted(() => vi.fn<() => Promise<string[]>>());

vi.mock('@/lib/db/repositories/collection-core', () => ({
  getCollectionCoreRepository: () => ({ listIds: listIdsMock }),
}));

import {
  getCachedCollectionVnIds,
  invalidateCollectionVnIdsCache,
} from '@/lib/collection-vn-ids-cache';

beforeEach(() => {
  invalidateCollectionVnIdsCache();
  listIdsMock.mockReset();
  vi.useRealTimers();
});

describe('collection VN id cache', () => {
  it('returns defensive copies of one cached repository snapshot', async () => {
    listIdsMock.mockResolvedValue(['v90001']);

    const first = await getCachedCollectionVnIds();
    first.push('v-mutated');
    const second = await getCachedCollectionVnIds();

    expect(second).toEqual(['v90001']);
    expect(listIdsMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent repository scans', async () => {
    let resolveList: (ids: string[]) => void = () => undefined;
    listIdsMock.mockImplementation(() => new Promise<string[]>((resolve) => {
      resolveList = resolve;
    }));

    const first = getCachedCollectionVnIds();
    const second = getCachedCollectionVnIds();
    expect(listIdsMock).toHaveBeenCalledTimes(1);
    resolveList(['v90002']);

    await expect(first).resolves.toEqual(['v90002']);
    await expect(second).resolves.toEqual(['v90002']);
  });

  it('refreshes the repository snapshot after the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    listIdsMock
      .mockResolvedValueOnce(['v90003'])
      .mockResolvedValueOnce(['v90004']);

    await expect(getCachedCollectionVnIds()).resolves.toEqual(['v90003']);
    vi.advanceTimersByTime(30_001);
    await expect(getCachedCollectionVnIds()).resolves.toEqual(['v90004']);
  });

  it('does not let an invalidated in-flight scan repopulate the cache', async () => {
    let resolveFirst: (ids: string[]) => void = () => undefined;
    listIdsMock
      .mockImplementationOnce(() => new Promise<string[]>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(['v90006']);

    const stale = getCachedCollectionVnIds();
    invalidateCollectionVnIdsCache();
    resolveFirst(['v90005']);
    await expect(stale).resolves.toEqual(['v90005']);

    await expect(getCachedCollectionVnIds()).resolves.toEqual(['v90006']);
    expect(listIdsMock).toHaveBeenCalledTimes(2);
  });
});
