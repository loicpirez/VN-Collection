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
  });

  it('rejects malformed local payloads', () => {
    expect(decodeVndbStatusClientState({ entry: null, labels: null })).toBeNull();
    expect(decodeVndbStatusClientState({ entry: { id: 'bad' }, labels: [] })).toBeNull();
    expect(decodeWishlistClientState({ items: [{ ...WISHLIST_ROW, in_collection: 'false' }] })).toBeNull();
    expect(decodeWishlistClientState({ items: [{ ...WISHLIST_ROW, egs: { median: '75' } }] })).toBeNull();
  });
});
