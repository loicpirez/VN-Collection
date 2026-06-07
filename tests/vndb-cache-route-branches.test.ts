import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type CacheRoute = typeof import('@/app/api/vndb/cache/route');

async function loadRouteWithActivityFailure(): Promise<CacheRoute> {
  vi.resetModules();
  vi.doMock('@/lib/db', () => ({
    cacheStats: () => ({ total: 0, rows: [] }),
    clearCache: () => 4,
    deleteCacheByPathPrefix: () => 0,
    pruneExpiredCache: () => 0,
  }));
  vi.doMock('@/lib/activity', () => ({
    recordActivity: () => {
      throw new Error('activity unavailable');
    },
  }));
  return import('@/app/api/vndb/cache/route');
}

describe('DELETE /api/vndb/cache branches', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.doUnmock('@/lib/activity');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('still clears cache when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const route = await loadRouteWithActivityFailure();

    const res = await route.DELETE(new NextRequest('http://127.0.0.1/api/vndb/cache', { method: 'DELETE' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: 4, mode: 'all' });
    expect(consoleSpy).toHaveBeenCalledWith('[vndb-cache] activity log failed:', 'activity unavailable');
  });
});
