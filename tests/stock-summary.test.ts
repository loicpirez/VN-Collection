import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVnStockCache, replaceVnStockProviderSnapshot, type VnStockAvailability } from '@/lib/db';
import { getStockForVn } from '@/lib/stock';

const VN_ID = 'v99997';
const NOW = Date.now();

function baseOffer(overrides: {
  provider_offer_id: string;
  price?: number;
  availability?: VnStockAvailability;
  source?: string;
  provider?: string;
  title?: string;
  content_kind?: string | null;
  series_relation?: string | null;
  match_confidence?: string | null;
  product_id?: string | null;
  jan?: string | null;
}) {
  return {
    vn_id: VN_ID,
    provider: 'sofmap',
    source: 'direct',
    title: '架空ゲーム 通常版',
    url: `https://a.sofmap.com/product_detail.aspx?sku=${overrides.provider_offer_id}`,
    currency: 'JPY',
    price: 5000,
    availability: 'in_stock' as VnStockAvailability,
    availability_label: null,
    condition: null,
    edition_label: null,
    location_label: 'Sofmap',
    location_branch: null,
    source_release_id: null,
    jan: null,
    fetched_at: NOW,
    error: null,
    content_kind: 'game_package',
    platform: 'PC',
    edition_kind: 'standard',
    series_relation: 'exact_game',
    match_confidence: 'high',
    match_score: 90,
    match_warnings_json: '[]',
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: null,
    page_kind: null,
    ...overrides,
  } as const;
}

beforeEach(() => { clearVnStockCache(VN_ID); });
afterEach(() => { clearVnStockCache(VN_ID); });

describe('getStockForVn summary', () => {
  it('best_price uses only in_stock or limited offers', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'sofmap',
      [
        baseOffer({ provider_offer_id: 'oos-001', price: 100, availability: 'out_of_stock' }),
        baseOffer({ provider_offer_id: 'instock-001', price: 5000, availability: 'in_stock' }),
      ],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 2 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.best_price).toBe(5000);
    expect(snapshot.summary.best_price).not.toBe(100);
  });

  it('best_price is null when only out_of_stock offers exist', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'sofmap',
      [baseOffer({ provider_offer_id: 'oos-001', price: 500, availability: 'out_of_stock' })],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 1 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.best_price).toBeNull();
  });

  it('best_price uses limited offers', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'sofmap',
      [
        baseOffer({ provider_offer_id: 'lim-001', price: 3800, availability: 'limited' }),
        baseOffer({ provider_offer_id: 'oos-001', price: 200, availability: 'out_of_stock' }),
      ],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 2 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.best_price).toBe(3800);
  });

  it('available count only includes in_stock and limited', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'sofmap',
      [
        baseOffer({ provider_offer_id: 'in-001', price: 5000, availability: 'in_stock' }),
        baseOffer({ provider_offer_id: 'lim-001', price: 5500, availability: 'limited' }),
        baseOffer({ provider_offer_id: 'oos-001', price: 100, availability: 'out_of_stock' }),
        baseOffer({ provider_offer_id: 'unk-001', price: 4800, availability: 'unknown' }),
      ],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 4 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.available).toBe(2);
    expect(snapshot.summary.total).toBe(4);
  });

  it('ignores weak, related, and no-match in-stock offers for game availability and best price', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'sofmap',
      [
        baseOffer({ provider_offer_id: 'exact-001', price: 7200, availability: 'in_stock' }),
        baseOffer({ provider_offer_id: 'weak-001', price: 1000, availability: 'in_stock', match_confidence: 'low' }),
        baseOffer({
          provider_offer_id: 'music-001',
          price: 1500,
          availability: 'in_stock',
          content_kind: 'soundtrack',
          series_relation: 'related_goods',
          match_confidence: 'high',
        }),
        baseOffer({
          provider_offer_id: 'nomatch-001',
          price: 900,
          availability: 'in_stock',
          title: 'Unrelated Generic Title',
          series_relation: 'unrelated',
          match_confidence: 'reject',
        }),
      ],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 4 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.available).toBe(1);
    expect(snapshot.summary.best_price).toBe(7200);
    expect(snapshot.summary.related_available).toBe(1);
    expect(snapshot.summary.rejected).toBe(2);
  });

  it('prefers direct retailer links over cheaper title-search results for best game price', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'amazon_jp',
      [
        baseOffer({
          provider: 'amazon_jp',
          provider_offer_id: 'B0DIRECT01',
          source: 'direct',
          product_id: 'B0DIRECT01',
          price: 6200,
          availability: 'in_stock',
        }),
        baseOffer({
          provider: 'amazon_jp',
          provider_offer_id: 'B0SEARCH01',
          source: 'search',
          product_id: 'B0SEARCH01',
          price: 1200,
          availability: 'in_stock',
        }),
      ],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 2 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.available).toBe(2);
    expect(snapshot.summary.best_price).toBe(6200);
    expect(snapshot.offers[0].provider_offer_id).toBe('B0DIRECT01');
  });

  it('keeps unrelated Eroge Price results collapsed as rejected and out of counts', () => {
    replaceVnStockProviderSnapshot(
      VN_ID,
      'eroge_price',
      [
        baseOffer({
          provider: 'eroge_price',
          provider_offer_id: 'unrelated-001',
          source: 'search',
          title: 'Unrelated Residence',
          price: 1800,
          availability: 'in_stock',
          series_relation: 'unrelated',
          match_confidence: 'reject',
        }),
      ],
      { status: 'ok', message: null, fetched_at: NOW, offer_count: 1 },
    );
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.available).toBe(0);
    expect(snapshot.summary.best_price).toBeNull();
    expect(snapshot.summary.rejected).toBe(1);
  });
});
