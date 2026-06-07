import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type DuplicatesRoute = typeof import('@/app/api/maintenance/duplicates/route');

async function loadRouteWithDuplicateFailure(): Promise<DuplicatesRoute> {
  vi.resetModules();
  vi.doMock('@/lib/db', () => ({
    findDuplicates: () => {
      throw new Error('duplicate scan failed');
    },
  }));
  return import('@/app/api/maintenance/duplicates/route');
}

describe('GET /api/maintenance/duplicates branches', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns a sanitized internal error when duplicate scanning fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const route = await loadRouteWithDuplicateFailure();
    const res = await route.GET(new NextRequest('http://127.0.0.1/api/maintenance/duplicates'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:maintenance.duplicates.GET] duplicate scan failed');
  });
});
