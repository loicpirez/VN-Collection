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
    });
    expect(decodeVndbStatusClientState({
      entry: null,
      labels: [],
      needsAuth: true,
    })).toEqual({ entry: null, labels: [], needsAuth: true });
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
