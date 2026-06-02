import { describe, expect, it } from 'vitest';
import {
  decodeAliceNetClientSnapshot,
  decodeAliceNetLoopResult,
  decodeAliceNetStockPage,
  decodeAliceNetStockSyncResult,
  type AliceNetClientItem,
} from '@/lib/alicenet-client-shape';

const baseItem: AliceNetClientItem = {
  code: '111-222222-333',
  title: 'Synthetic Fixture',
  jan: null,
  release_date: null,
  list_price: null,
  sale_price: null,
  vn_id: null,
  vn_match_source: null,
  vn_candidates: null,
  search_title: null,
  egs_id: null,
  egs_match_source: null,
  egs_title: null,
  egs_brand: null,
  egs_release_date: null,
  egs_image_url: null,
  egs_vndb_raw: null,
  in_collection: 0,
  in_wishlist: 0,
  last_matched_at: null,
  fetched_at: 1,
  updated_at: 1,
  vn_image_url: null,
  vn_local_image: null,
  vn_image_sexual: null,
  vn_developers: null,
};

const stats = {
  total: 1,
  matched: 0,
  vndb_matched: 0,
  egs_only: 0,
  unmatched: 1,
  unprocessed: 1,
  none_found: 0,
  in_collection: 0,
  in_wishlist: 0,
};

const pending = { vndb_pending: 0, egs_pending: 0 };
const page = { offset: 0, limit: 200, total: 1, has_more: false };

describe('decodeAliceNetStockPage', () => {
  it('decodes a follow-up page of items plus the paging window', () => {
    const result = decodeAliceNetStockPage({ items: [baseItem], page });
    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(1);
    expect(result?.page).toEqual(page);
  });

  it('returns null when the paging window is missing', () => {
    expect(decodeAliceNetStockPage({ items: [baseItem] })).toBeNull();
  });

  it('returns null when an item row is malformed', () => {
    expect(decodeAliceNetStockPage({ items: [{ ...baseItem, code: 'not-a-code' }], page })).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(decodeAliceNetStockPage('nope')).toBeNull();
  });
});

describe('decodeAliceNetClientSnapshot paging window', () => {
  it('omits the page key when the source payload has none', () => {
    const result = decodeAliceNetClientSnapshot({ items: [baseItem], stats, pending, last_fetch: null });
    expect(result).not.toBeNull();
    expect(result?.page).toBeUndefined();
  });

  it('includes a valid page window when present', () => {
    const result = decodeAliceNetClientSnapshot({ items: [baseItem], stats, pending, last_fetch: 42, page });
    expect(result?.page).toEqual(page);
    expect(result?.last_fetch).toBe(42);
  });

  it('returns null when the supplied page window is malformed', () => {
    const result = decodeAliceNetClientSnapshot({
      items: [baseItem],
      stats,
      pending,
      last_fetch: null,
      page: { offset: 0, limit: 0, total: 1, has_more: false },
    });
    expect(result).toBeNull();
  });

  it('returns null when has_more is not a boolean', () => {
    const result = decodeAliceNetClientSnapshot({
      items: [baseItem],
      stats,
      pending,
      last_fetch: null,
      page: { offset: 0, limit: 1, total: 1, has_more: 'yes' },
    });
    expect(result).toBeNull();
  });

  it('returns null when stats are incomplete', () => {
    const { unprocessed: _unprocessed, ...partialStats } = stats;
    expect(decodeAliceNetClientSnapshot({ items: [baseItem], stats: partialStats, pending, last_fetch: null })).toBeNull();
  });

  it('returns null when pending counters are negative', () => {
    expect(
      decodeAliceNetClientSnapshot({ items: [baseItem], stats, pending: { vndb_pending: -1, egs_pending: 0 }, last_fetch: null }),
    ).toBeNull();
  });

  it('returns null when last_fetch is non-finite', () => {
    expect(decodeAliceNetClientSnapshot({ items: [baseItem], stats, pending, last_fetch: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('decodeAliceNetItem field-level rejections', () => {
  it('rejects a non-VNDB vn_id string', () => {
    expect(decodeAliceNetStockPage({ items: [{ ...baseItem, vn_id: 'p123' }], page })).toBeNull();
  });

  it('rejects an out-of-range egs_id', () => {
    expect(decodeAliceNetStockPage({ items: [{ ...baseItem, egs_id: 0 }], page })).toBeNull();
  });

  it('rejects an unexpected vn_match_source value', () => {
    expect(decodeAliceNetStockPage({ items: [{ ...baseItem, vn_match_source: 'guessed' }], page })).toBeNull();
  });

  it('accepts a populated row and lowercases the VN id', () => {
    const result = decodeAliceNetStockPage({
      items: [{ ...baseItem, vn_id: 'V42', egs_id: 7, vn_match_source: 'manual', egs_match_source: 'auto' }],
      page,
    });
    expect(result?.items[0]?.vn_id).toBe('v42');
    expect(result?.items[0]?.egs_id).toBe(7);
  });
});

describe('decodeAliceNetStockSyncResult / decodeAliceNetLoopResult edges', () => {
  it('rejects a sync result with a missing counter', () => {
    expect(decodeAliceNetStockSyncResult({ count: 1, added: 1, updated: 1, removed: 1 })).toBeNull();
  });

  it('accepts a loop result without the optional matched counter', () => {
    expect(decodeAliceNetLoopResult({ processed: 3, remaining: 0 })).toEqual({
      processed: 3,
      matched: undefined,
      remaining: 0,
    });
  });

  it('rejects a loop result with a fractional matched counter', () => {
    expect(decodeAliceNetLoopResult({ processed: 1, matched: 1.5, remaining: 0 })).toBeNull();
  });
});
