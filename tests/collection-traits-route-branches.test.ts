import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type CollectionTraitsRoute = typeof import('@/app/api/collection/traits/route');

async function loadRoute(): Promise<CollectionTraitsRoute> {
  vi.resetModules();
  vi.doMock('@/lib/db', () => ({
    db: {
      prepare: () => ({
        all: () => [{ id: 'v90001' }, { id: 'v90002' }, { id: 'v90003' }],
      }),
    },
  }));
  vi.doMock('@/lib/vndb', () => ({
    readCachedCharactersForVns: () =>
      new Map([
        [
          'v90001',
          [
            {
              traits: [
                { id: 'i90002', name: 'Trait B', group_name: 'Group B', sexual: false, spoiler: 0 },
                { id: 'i90002', name: 'Trait B', group_name: 'Group B', sexual: false, spoiler: 0 },
                { id: 'i90003', name: 'Spoiler Trait', group_name: null, sexual: false, spoiler: 1 },
              ],
            },
          ],
        ],
        [
          'v90002',
          [
            {
              traits: [
                { id: 'i90001', name: 'Trait A', group_name: null, sexual: true, spoiler: 0 },
                { id: 'i90002', name: 'Trait B', group_name: 'Group B', sexual: false, spoiler: 0 },
                { id: 'a90004', group_name: null, spoiler: 0 },
              ],
            },
          ],
        ],
      ]),
  }));
  return import('@/app/api/collection/traits/route');
}

async function loadRouteWithDbFailure(): Promise<CollectionTraitsRoute> {
  vi.resetModules();
  vi.doMock('@/lib/db', () => ({
    db: {
      prepare: () => {
        throw new Error('collection trait query failed');
      },
    },
  }));
  vi.doMock('@/lib/vndb', () => ({
    readCachedCharactersForVns: () => new Map(),
  }));
  return import('@/app/api/collection/traits/route');
}

describe('GET /api/collection/traits aggregation branches', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.doUnmock('@/lib/vndb');
    vi.resetModules();
  });

  it('aggregates cached character traits and skips VNs without cached characters', async () => {
    const route = await loadRoute();

    const res = await route.GET(new NextRequest('http://127.0.0.1/api/collection/traits'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      traits: [
        {
          id: 'i90002',
          name: 'Trait B',
          aliases: [],
          description: null,
          searchable: true,
          applicable: true,
          sexual: false,
          group_id: null,
          group_name: 'Group B',
          char_count: 2,
        },
        {
          id: 'a90004',
          name: 'a90004',
          aliases: [],
          description: null,
          searchable: true,
          applicable: true,
          sexual: false,
          group_id: null,
          group_name: null,
          char_count: 1,
        },
        {
          id: 'i90001',
          name: 'Trait A',
          aliases: [],
          description: null,
          searchable: true,
          applicable: true,
          sexual: true,
          group_id: null,
          group_name: null,
          char_count: 1,
        },
      ],
      cache_coverage: { total_vns: 3, with_cached_characters: 2 },
    });
  });

  it('returns a sanitized database error when the collection query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const route = await loadRouteWithDbFailure();

    const res = await route.GET(new NextRequest('http://127.0.0.1/api/collection/traits'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'database error' });
    expect(consoleSpy).toHaveBeenCalledWith('[collection/traits] db.prepare failed:', 'collection trait query failed');
  });
});
