import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearVnStockCache,
  listVnStockOffers,
  listVnStockProviderStatuses,
  replaceVnStockProviderSnapshot,
} from '@/lib/db';

const VN_ID = 'v99998';
const PROVIDER = 'sofmap';

const NOW = Date.now();

function seedOffer() {
  replaceVnStockProviderSnapshot(
    VN_ID,
    PROVIDER,
    [
      {
        vn_id: VN_ID,
        provider: PROVIDER,
        provider_offer_id: 'sku-test-001',
        source: 'direct',
        title: 'Test VN',
        url: 'https://example.test/sku-test-001',
        price: 3000,
        currency: 'JPY',
        availability: 'in_stock',
        availability_label: null,
        condition: null,
        edition_label: null,
        location_label: 'Test Shop',
        location_branch: 'Test Shop',
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
      },
    ],
    { status: 'ok', message: null, fetched_at: NOW, offer_count: 1 },
  );
}

beforeEach(() => {
  clearVnStockCache(VN_ID);
});

afterEach(() => {
  clearVnStockCache(VN_ID);
});

describe('clearVnStockCache', () => {
  it('returns zero changes when nothing exists', () => {
    const result = clearVnStockCache(VN_ID);
    expect(result.offers).toBe(0);
    expect(result.statuses).toBe(0);
  });

  it('removes offers and returns correct change count', () => {
    seedOffer();
    expect(listVnStockOffers(VN_ID)).toHaveLength(1);

    const result = clearVnStockCache(VN_ID);
    expect(result.offers).toBe(1);
    expect(listVnStockOffers(VN_ID)).toHaveLength(0);
  });

  it('removes provider statuses and returns correct change count', () => {
    seedOffer();
    expect(listVnStockProviderStatuses(VN_ID)).toHaveLength(1);

    const result = clearVnStockCache(VN_ID);
    expect(result.statuses).toBe(1);
    expect(listVnStockProviderStatuses(VN_ID)).toHaveLength(0);
  });

  it('is a no-op for unrelated VN IDs', () => {
    seedOffer();
    clearVnStockCache('v99997');
    expect(listVnStockOffers(VN_ID)).toHaveLength(1);
    expect(listVnStockProviderStatuses(VN_ID)).toHaveLength(1);
  });

  it('is idempotent — calling twice does not error', () => {
    seedOffer();
    clearVnStockCache(VN_ID);
    const second = clearVnStockCache(VN_ID);
    expect(second.offers).toBe(0);
    expect(second.statuses).toBe(0);
  });
});
