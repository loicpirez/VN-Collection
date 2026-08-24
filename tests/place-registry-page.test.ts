import { describe, expect, it } from 'vitest';
import type { PlaceWithLinks } from '@/lib/db';
import {
  parsePlaceRegistryQuery,
  queryPlaceRegistry,
  queryUnassignedBranches,
} from '@/lib/place-registry-page';

const day = 86_400_000;
const now = 20 * day;

function place(id: number, overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id,
    name: `Place ${id}`,
    name_ja: null,
    kind: 'shop',
    address: null,
    lat: null,
    lng: null,
    url: null,
    notes: null,
    created_at: 1,
    updated_at: id,
    provider_labels: [],
    stock_count: 0,
    stock_updated_at: null,
    ...overrides,
  };
}

describe('place registry server pagination', () => {
  it('parses defaults, invalid values, and hard bounds', () => {
    expect(parsePlaceRegistryQuery(new URLSearchParams())).toEqual({
      limit: 60,
      offset: 0,
      tab: 'all',
      sort: 'name',
      search: '',
      kind: '',
      gps: 'all',
      hideStale: false,
    });
    expect(parsePlaceRegistryQuery(new URLSearchParams(
      'limit=0&offset=-1&tab=bad&sort=bad&kind=bad&gps=bad&hide_stale=true',
    ))).toEqual({
      limit: 1,
      offset: 0,
      tab: 'all',
      sort: 'name',
      search: '',
      kind: '',
      gps: 'all',
      hideStale: false,
    });
    expect(parsePlaceRegistryQuery(new URLSearchParams(
      'limit=999&offset=99999999&tab=linked&sort=stock&kind=chain&gps=gps&hide_stale=1&q=%EF%BC%A1%EF%BC%AC%EF%BC%A9%EF%BC%A3%EF%BC%A5',
    ))).toMatchObject({
      limit: 120,
      offset: 10_000_000,
      tab: 'linked',
      sort: 'stock',
      search: 'alice',
      kind: 'chain',
      gps: 'gps',
      hideStale: true,
    });
  });

  it('returns global stats beside a filtered NFKC search window', () => {
    const places = [
      place(1, {
        name: 'ＡＬＩＣＥ Fresh',
        kind: 'chain',
        lat: 35,
        lng: 139,
        provider_labels: ['Kobe Branch'],
        stock_count: 8,
        stock_updated_at: now,
      }),
      place(2, {
        name: 'Stale linked',
        provider_labels: ['Old Branch'],
        stock_count: 3,
        stock_updated_at: now - 10 * day,
      }),
      place(3, { name: 'Unlinked', kind: 'storage', lat: 34, lng: 135 }),
    ];
    const query = parsePlaceRegistryQuery(new URLSearchParams(
      'tab=linked&kind=chain&gps=gps&hide_stale=1&q=alice&limit=1',
    ));
    expect(queryPlaceRegistry(places, query, now)).toEqual({
      places: [places[0]],
      page: { total: 1, limit: 1, offset: 0 },
      stats: {
        total: 3,
        linked: 2,
        unlinked: 1,
        with_gps: 2,
        no_gps: 1,
        stock_count: 11,
        stale: 1,
      },
    });
  });

  it('supports unlinked and GPS exclusions plus deterministic sort modes', () => {
    const places = [
      place(3, { name: 'beta', stock_count: 5, updated_at: 10 }),
      place(1, { name: 'Alpha', stock_count: 5, updated_at: 30 }),
      place(2, {
        name: 'Gamma',
        provider_labels: ['Branch'],
        stock_count: 9,
        stock_updated_at: 20,
        lat: 35,
        lng: 139,
      }),
    ];
    const byName = queryPlaceRegistry(places, parsePlaceRegistryQuery(new URLSearchParams()), now);
    expect(byName.places.map((row) => row.id)).toEqual([1, 3, 2]);
    const byStock = queryPlaceRegistry(
      places,
      parsePlaceRegistryQuery(new URLSearchParams('sort=stock')),
      now,
    );
    expect(byStock.places.map((row) => row.id)).toEqual([2, 1, 3]);
    const byFresh = queryPlaceRegistry(
      places,
      parsePlaceRegistryQuery(new URLSearchParams('sort=fresh')),
      now,
    );
    expect(byFresh.places.map((row) => row.id)).toEqual([1, 2, 3]);
    const excluded = queryPlaceRegistry(
      places,
      parsePlaceRegistryQuery(new URLSearchParams('tab=unlinked&gps=no_gps&offset=1&limit=1')),
      now,
    );
    expect(excluded.page.total).toBe(2);
    expect(excluded.places.map((row) => row.id)).toEqual([3]);
    expect(queryPlaceRegistry(
      places,
      parsePlaceRegistryQuery(new URLSearchParams('tab=unlinked&gps=gps')),
      now,
    ).places).toEqual([]);
    expect(queryPlaceRegistry(
      places,
      parsePlaceRegistryQuery(new URLSearchParams('gps=no_gps')),
      now,
    ).places.map((row) => row.id)).toEqual([1, 3]);
    expect(queryPlaceRegistry(
      [place(1, { provider_labels: ['Old'], stock_updated_at: now - 10 * day })],
      parsePlaceRegistryQuery(new URLSearchParams('hide_stale=1')),
      now,
    ).places).toEqual([]);

    const ties = [
      place(2, { name: 'Same', updated_at: 5, stock_updated_at: 0 }),
      place(1, { name: 'Same', updated_at: 5, stock_updated_at: null }),
    ];
    expect(queryPlaceRegistry(
      ties,
      parsePlaceRegistryQuery(new URLSearchParams('sort=fresh')),
      now,
    ).places.map((row) => row.id)).toEqual([1, 2]);
    expect(queryPlaceRegistry(
      ties,
      parsePlaceRegistryQuery(new URLSearchParams()),
      now,
    ).places.map((row) => row.id)).toEqual([1, 2]);
  });

  it('filters and bounds unassigned branch pages', () => {
    expect(queryUnassignedBranches(
      ['Alice Kobe', 'Sofmap', 'Alice Tokyo'],
      new URLSearchParams('q=%EF%BC%A1%EF%BC%AC%EF%BC%A9%EF%BC%A3%EF%BC%A5&offset=1&limit=1'),
    )).toEqual({ branches: ['Alice Tokyo'], page: { total: 2, limit: 1, offset: 1 } });
    expect(queryUnassignedBranches(['A'], new URLSearchParams('limit=bad&offset=bad'))).toEqual({
      branches: ['A'],
      page: { total: 1, limit: 60, offset: 0 },
    });
  });
});
