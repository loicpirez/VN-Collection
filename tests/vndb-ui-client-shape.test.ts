import { describe, expect, it } from 'vitest';
import {
  decodeVndbStatusClientState,
  decodeWishlistClientState,
} from '@/lib/vndb-ui-client-shape';

const DETAIL = {
  id: 'V90001',
  added: 1,
  voted: null,
  lastmod: 2,
  vote: null,
  started: null,
  finished: null,
  notes: null,
  labels: [{ id: 5, label: 'Wishlist' }],
};

const WISHLIST_ROW = {
  ...DETAIL,
  vn: {
    id: 'v90001',
    title: 'Fixture',
    alttitle: null,
    released: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    languages: ['ja'],
    platforms: ['win'],
    image: null,
    developers: [],
  },
  in_collection: false,
  egs: { median: 75, playtime_median_minutes: null },
};

describe('VNDB UI client response adapters', () => {
  it('decodes VNDB status responses and normalizes ids', () => {
    expect(decodeVndbStatusClientState({
      entry: DETAIL,
      labels: [{ id: 5, label: 'Wishlist', private: false, count: 1 }],
    })).toEqual({
      entry: { ...DETAIL, id: 'v90001' },
      labels: [{ id: 5, label: 'Wishlist', private: false, count: 1 }],
      needsAuth: false,
      local: null,
      differences: [],
    });
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      needsAuth: true,
    })).toEqual({ entry: null, labels: [], needsAuth: true, local: null, differences: [] });
    expect(decodeVndbStatusClientState({
      entry: DETAIL,
      labels: [],
      local: { status: 'completed', vote: 90, started: null, finished: '2025-01-01', notes: 'local' },
      differences: [{
        field: 'status',
        local: 'completed',
        remote: 'playing',
        canPullRemote: true,
        canPushLocal: true,
      }],
    })).toMatchObject({
      local: { status: 'completed', vote: 90 },
      differences: [{ field: 'status', local: 'completed', remote: 'playing' }],
    });
    expect(decodeVndbStatusClientState({
      entry: DETAIL,
      labels: [],
      differences: [{ field: 'vote', local: 90, remote: 80, canPullRemote: true, canPushLocal: true }],
    })?.differences).toEqual([
      { field: 'vote', local: 90, remote: 80, canPullRemote: true, canPushLocal: true },
    ]);
  });

  it('decodes locally enriched wishlist rows', () => {
    expect(decodeWishlistClientState({ items: [WISHLIST_ROW] })).toMatchObject({
      needsAuth: false,
      items: [{
        id: 'v90001',
        in_collection: false,
        egs: { median: 75, playtime_median_minutes: null },
      }],
    });
    expect(decodeWishlistClientState({ items: [{ ...WISHLIST_ROW, egs: null }] })?.items[0]?.egs).toBeNull();
    expect(decodeWishlistClientState({
      items: [WISHLIST_ROW],
      page: { page: 1, page_size: 60, total: 1, total_pages: 1, start: 1, end: 1, grouped: false },
      facets: { languages: ['en'], platforms: ['win'] },
      summary: { total: 2, owned: 1, todo: 1 },
      download_items: [{ id: 'V90001', title: 'Fixture' }],
    })).toMatchObject({
      page: { page: 1, total: 1 },
      facets: { languages: ['en'], platforms: ['win'] },
      summary: { total: 2, owned: 1, todo: 1 },
      download_items: [{ id: 'v90001', title: 'Fixture' }],
    });
  });

  it('rejects malformed local payloads', () => {
    expect(decodeVndbStatusClientState({ entry: null, labels: null })).toBeNull();
    expect(decodeVndbStatusClientState({ entry: { id: 'bad' }, labels: [] })).toBeNull();
    expect(decodeVndbStatusClientState({ entry: null, labels: [], local: { status: 'invalid' } })).toBeNull();
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      local: { status: null, vote: null, started: 1, finished: null, notes: null },
    })).toBeNull();
    expect(decodeVndbStatusClientState({ entry: null, labels: [], differences: {} })).toBeNull();
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      differences: new Array(6).fill({ field: 'notes', local: null, remote: null, canPullRemote: true, canPushLocal: true }),
    })).toBeNull();
    expect(decodeVndbStatusClientState({ entry: null, labels: [], differences: [{ field: 'other' }] })).toBeNull();
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      differences: [{ field: 'status', local: 'invalid', remote: null, canPullRemote: true, canPushLocal: true }],
    })).toBeNull();
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      differences: [{ field: 'vote', local: 9, remote: null, canPullRemote: true, canPushLocal: true }],
    })).toBeNull();
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      differences: [{ field: 'notes', local: 1, remote: null, canPullRemote: true, canPushLocal: true }],
    })).toBeNull();
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      differences: [
        { field: 'notes', local: 'first', remote: null, canPullRemote: true, canPushLocal: true },
        { field: 'notes', local: 'second', remote: null, canPullRemote: true, canPushLocal: false },
      ],
    })).toBeNull();
    expect(decodeWishlistClientState({ items: [{ ...WISHLIST_ROW, in_collection: 'false' }] })).toBeNull();
    expect(decodeWishlistClientState({ items: [{ ...WISHLIST_ROW, egs: { median: '75' } }] })).toBeNull();
    expect(decodeWishlistClientState(null)).toBeNull();
    expect(decodeWishlistClientState({ needsAuth: 'yes', items: [] })).toBeNull();
    expect(decodeWishlistClientState({ items: null })).toBeNull();
    expect(decodeWishlistClientState({ items: new Array(1001).fill(WISHLIST_ROW) })).toBeNull();
    const paged = {
      items: [WISHLIST_ROW],
      page: { page: 1, page_size: 60, total: 1, total_pages: 1, start: 1, end: 1, grouped: false },
      facets: { languages: ['en'], platforms: ['win'] },
      summary: { total: 1, owned: 0, todo: 1 },
      download_items: [{ id: 'v90001', title: 'Fixture' }],
    };
    expect(decodeWishlistClientState({ ...paged, page: { ...paged.page, page_size: 0 } })).toBeNull();
    expect(decodeWishlistClientState({ ...paged, page: { ...paged.page, end: 2 } })).toBeNull();
    expect(decodeWishlistClientState({ ...paged, facets: { languages: 'en', platforms: [] } })).toBeNull();
    expect(decodeWishlistClientState({ ...paged, facets: { languages: ['en', 'en'], platforms: [] } })).toBeNull();
    expect(decodeWishlistClientState({ ...paged, summary: { total: 2, owned: 0, todo: 1 } })).toBeNull();
    expect(decodeWishlistClientState({ ...paged, download_items: [{ id: 'bad', title: 'Fixture' }] })).toBeNull();
    expect(decodeWishlistClientState({ ...paged, download_items: [{ id: 'v90001', title: 'A' }, { id: 'V90001', title: 'B' }] })).toBeNull();
  });
});
