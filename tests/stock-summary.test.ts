import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVnStockCache, replaceVnStockProviderSnapshot, type VnStockAvailability } from '@/lib/db';
import { getStockForVn } from '@/lib/stock';

const VN_ID = 'v99997';
const NOW = Date.now();

function baseOffer(overrides: { provider_offer_id: string; price: number; availability: VnStockAvailability }) {
  return {
    vn_id: VN_ID,
    provider: 'sofmap',
    source: 'direct',
    title: '架空ゲーム 通常版',
    url: `https://a.sofmap.com/product_detail.aspx?sku=${overrides.provider_offer_id}`,
    currency: 'JPY',
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
});
