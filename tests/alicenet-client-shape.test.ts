import { describe, expect, it } from 'vitest';
import {
  decodeAliceNetClientSnapshot,
  decodeAliceNetLoopResult,
  decodeAliceNetStockSyncResult,
} from '@/lib/alicenet-client-shape';

const item = {
  code: '123-456789-012',
  title: 'Fixture',
  jan: null,
  release_date: null,
  list_price: null,
  sale_price: null,
  vn_id: 'V90001',
  vn_match_source: 'auto',
  vn_candidates: null,
  search_title: null,
  egs_id: null,
  egs_match_source: null,
  egs_title: null,
  egs_brand: null,
  egs_release_date: null,
  egs_image_url: null,
  egs_vndb_raw: null,
  in_collection: 1,
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
  matched: 1,
  vndb_matched: 1,
  egs_only: 0,
  unmatched: 0,
  unprocessed: 0,
  none_found: 0,
  in_collection: 1,
  in_wishlist: 0,
};

describe('AliceNet client response adapters', () => {
  it('decodes the browser snapshot and canonicalizes VN ids', () => {
    const result = decodeAliceNetClientSnapshot({
      items: [item],
      stats,
      pending: { vndb_pending: 0, egs_pending: 1 },
      last_fetch: 1,
    });
    expect(result?.items[0]?.vn_id).toBe('v90001');
    expect(result?.pending.egs_pending).toBe(1);
  });

  it('decodes stock-sync and loop results', () => {
    expect(decodeAliceNetStockSyncResult({
      count: 4,
      added: 1,
      updated: 2,
      removed: 1,
      fetched_at: 1,
    })?.removed).toBe(1);
    expect(decodeAliceNetLoopResult({ processed: 2, matched: 1, remaining: 3 })).toEqual({
      processed: 2,
      matched: 1,
      remaining: 3,
    });
  });

  it('rejects malformed nested rows and counters', () => {
    expect(decodeAliceNetClientSnapshot({
      items: [{ ...item, in_collection: 2 }],
      stats,
      pending: { vndb_pending: 0, egs_pending: 0 },
      last_fetch: null,
    })).toBeNull();
    expect(decodeAliceNetStockSyncResult({ count: -1, added: 0, updated: 0, removed: 0, fetched_at: 1 })).toBeNull();
    expect(decodeAliceNetLoopResult({ processed: 1, remaining: Number.NaN })).toBeNull();
  });
});
