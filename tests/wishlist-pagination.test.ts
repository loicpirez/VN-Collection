import { describe, expect, it } from 'vitest';
import type { WishlistClientItem } from '@/lib/vndb-ui-client-shape';
import {
  paginateWishlist,
  parseWishlistServerQuery,
  type WishlistServerGroup,
  type WishlistServerSort,
} from '@/lib/wishlist-pagination';

function item(id: string, title: string, overrides: Partial<WishlistClientItem> = {}): WishlistClientItem {
  return {
    id,
    added: 100,
    voted: null,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: [{ id: 5, label: 'Wishlist' }],
    in_collection: false,
    egs: { median: 70, playtime_median_minutes: 600 },
    vn: {
      id,
      title,
      alttitle: `${title} alternative`,
      released: '2020-01-02',
      rating: 70,
      votecount: 10,
      length_minutes: 600,
      languages: ['en'],
      platforms: ['win'],
      image: null,
      developers: [{ id: 'p90001', name: 'Studio Alpha' }],
    },
    ...overrides,
  };
}

function query(value = '') {
  return parseWishlistServerQuery(new URLSearchParams(value));
}

describe('wishlist server pagination', () => {
  it('parses defaults, valid values, and bounded malformed values', () => {
    expect(query()).toMatchObject({
      q: '', language: '', platform: '', rating_min: null, rating_max: null,
      year_min: '', year_max: '', sort: 'added_desc', group: 'none',
      hide_owned: true, page: 1, page_size: 60, locale: 'en',
    });
    expect(query('q=%20needle%20&lang=ja&platform=win&ratingMin=10&ratingMax=90&yearMin=2010&yearMax=2020&sort=title&group=year&hideOwned=0&page=3&pageSize=999&locale=fr')).toMatchObject({
      q: 'needle', language: 'ja', platform: 'win', rating_min: 10, rating_max: 90,
      year_min: '2010', year_max: '2020', sort: 'title', group: 'year',
      hide_owned: false, page: 3, page_size: 120, locale: 'fr',
    });
    expect(query('ratingMin=no&ratingMax=&sort=bad&group=bad&page=-2&pageSize=0&locale=bad')).toMatchObject({
      rating_min: null, rating_max: null, sort: 'added_desc', group: 'none',
      page: 1, page_size: 60, locale: 'en',
    });
    expect(query(`q=${'x'.repeat(220)}&lang=${'l'.repeat(40)}&platform=${'p'.repeat(40)}&locale=ja`)).toMatchObject({
      q: 'x'.repeat(200), language: 'l'.repeat(32), platform: 'p'.repeat(32), locale: 'ja',
    });
  });

  it('filters owned, facets, ranges, dates, and all textual fields', () => {
    const base = item('v90001', 'Main Match');
    const owned = item('v90002', 'Owned', { in_collection: true });
    const missing = item('v90003', 'Missing metadata', {
      egs: null,
      vn: { ...item('v90003', 'Missing metadata').vn, alttitle: null, released: null, rating: null, languages: [], platforms: [], developers: [] },
    });
    const source = [base, owned, missing];
    expect(paginateWishlist(source, query()).items.map((row) => row.id)).toEqual(['v90001', 'v90003']);
    expect(paginateWishlist(source, query('hideOwned=0&lang=fr')).page.total).toBe(0);
    expect(paginateWishlist(source, query('hideOwned=0&platform=ps4')).page.total).toBe(0);
    expect(paginateWishlist(source, query('hideOwned=0&ratingMin=71')).page.total).toBe(0);
    expect(paginateWishlist(source, query('hideOwned=0&ratingMax=69')).page.total).toBe(0);
    expect(paginateWishlist(source, query('hideOwned=0&yearMin=2021')).page.total).toBe(0);
    expect(paginateWishlist(source, query('hideOwned=0&yearMax=2019')).page.total).toBe(0);
    expect(paginateWishlist(source, query('hideOwned=0&q=main')).page.total).toBe(1);
    expect(paginateWishlist(source, query('hideOwned=0&q=alternative')).page.total).toBe(2);
    expect(paginateWishlist(source, query('hideOwned=0&q=studio')).page.total).toBe(2);
    expect(paginateWishlist(source, query('hideOwned=0&q=absent')).page.total).toBe(0);
    const result = paginateWishlist(source, query('hideOwned=0'));
    expect(result.facets).toEqual({ languages: ['en'], platforms: ['win'] });
    expect(result.summary).toEqual({ total: 3, owned: 1, todo: 2 });
    expect(result.download_items).toHaveLength(3);
  });

  it.each<[WishlistServerSort, string]>([
    ['added_desc', 'v90002'],
    ['added_asc', 'v90001'],
    ['title', 'v90002'],
    ['rating_desc', 'v90002'],
    ['released_desc', 'v90002'],
    ['released_asc', 'v90001'],
    ['length_desc', 'v90002'],
    ['egs_rating_desc', 'v90002'],
  ])('applies %s ordering before pagination', (sort, firstId) => {
    const source = [
      item('v90001', 'Zulu', { added: 10, egs: null, vn: { ...item('v90001', 'Zulu').vn, rating: null, released: null, length_minutes: null } }),
      item('v90002', 'Alpha', { added: 20, egs: { median: 90, playtime_median_minutes: null }, vn: { ...item('v90002', 'Alpha').vn, rating: 90, released: '2022-01-01', length_minutes: 900 } }),
    ];
    expect(paginateWishlist(source, query(`hideOwned=0&sort=${sort}`)).items[0]?.id).toBe(firstId);
  });

  it.each<WishlistServerGroup>(['year', 'developer', 'language', 'platform', 'status'])('keeps complete %s groups on one page', (group) => {
    const source = [
      item('v90001', 'One', { in_collection: false }),
      item('v90002', 'Two', { in_collection: false }),
      item('v90003', 'Three', { in_collection: true, vn: { ...item('v90003', 'Three').vn, released: '2021-01-01', languages: ['ja'], platforms: ['ps4'], developers: [{ id: 'p90002', name: 'Studio Beta' }] } }),
    ];
    const first = paginateWishlist(source, query(`hideOwned=0&group=${group}&pageSize=2&page=1`));
    expect(first.page.grouped).toBe(true);
    expect(first.page.total_pages).toBe(2);
    const second = paginateWishlist(source, query(`hideOwned=0&group=${group}&pageSize=2&page=2`));
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(3);
  });

  it.each<Exclude<WishlistServerGroup, 'none' | 'status'>>(['year', 'developer', 'language', 'platform'])(
    'keeps unknown %s values in one complete group',
    (group) => {
      const unknown = item('v90004', 'Unknown', {
        vn: {
          ...item('v90004', 'Unknown').vn,
          released: null,
          developers: [],
          languages: [],
          platforms: [],
        },
      });
      expect(paginateWishlist([unknown], query(`hideOwned=0&group=${group}&pageSize=1`)).items).toEqual([unknown]);
    },
  );

  it('returns an empty grouped page when every row is filtered out', () => {
    const result = paginateWishlist([item('v90001', 'Owned', { in_collection: true })], query('group=year'));
    expect(result.items).toEqual([]);
    expect(result.page).toMatchObject({ page: 1, total: 0, total_pages: 1, start: 0, end: 0, grouped: true });
  });

  it('keeps a known release year inside an active range', () => {
    expect(paginateWishlist(
      [item('v90001', 'Inside')],
      query('hideOwned=0&yearMin=2019&yearMax=2021'),
    ).page.total).toBe(1);
  });

  it.each<WishlistServerSort>(['rating_desc', 'released_desc', 'released_asc', 'length_desc', 'egs_rating_desc'])(
    'sorts nullable values in both operand positions under %s',
    (sort) => {
      const missing = item('v90004', 'Missing', {
        egs: null,
        vn: { ...item('v90004', 'Missing').vn, rating: null, released: null, length_minutes: null },
      });
      const present = item('v90005', 'Present');
      expect(paginateWishlist([missing, present], query(`hideOwned=0&sort=${sort}`)).items).toHaveLength(2);
      expect(paginateWishlist([present, missing], query(`hideOwned=0&sort=${sort}`)).items).toHaveLength(2);
    },
  );

  it('clamps later pages, reports fixed-page ranges, and handles an empty source', () => {
    const source = [item('v90001', 'One'), item('v90002', 'Two'), item('v90003', 'Three')];
    const second = paginateWishlist(source, query('hideOwned=0&pageSize=2&page=99'));
    expect(second.page).toEqual({ page: 2, page_size: 2, total: 3, total_pages: 2, start: 3, end: 3, grouped: false });
    expect(second.items).toHaveLength(1);
    expect(paginateWishlist([], query()).page).toEqual({ page: 1, page_size: 60, total: 0, total_pages: 1, start: 0, end: 0, grouped: false });
  });
});
