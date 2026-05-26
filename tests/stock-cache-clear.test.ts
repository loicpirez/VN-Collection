import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearVnStockCache,
  listVnStockOffers,
  listVnStockProviderStatuses,
  replaceVnStockProviderSnapshot,
  type VnStockOfferInput,
} from '@/lib/db';

const VN_ID = 'v95001';

function clearAll() {
  clearVnStockCache(VN_ID);
}

function makeOffer(provider: string, id: string, vnId = VN_ID): VnStockOfferInput {
  return {
    vn_id: vnId,
    provider,
    provider_offer_id: id,
    source: 'search',
    title: `t-${id}`,
    url: `https://example.test/${id}`,
    price: 1000,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: null,
    condition: null,
    edition_label: null,
    location_label: null,
    location_branch: null,
    source_release_id: null,
    jan: null,
    fetched_at: Date.now(),
    error: null,
    content_kind: null,
    platform: null,
    edition_kind: null,
    series_relation: null,
    match_confidence: null,
    match_score: null,
    match_warnings_json: null,
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: null,
    page_kind: null,
  };
}

beforeEach(clearAll);
afterEach(clearAll);

describe('clearVnStockCache', () => {
  it('returns counts of cleared offers and statuses for an empty VN', () => {
    expect(clearVnStockCache(VN_ID)).toEqual({ offers: 0, statuses: 0 });
  });

  it('removes offers and statuses for a single VN only', () => {
    replaceVnStockProviderSnapshot(VN_ID, 'amiami', [makeOffer('amiami', '1')], {
      status: 'ok',
      message: null,
      fetched_at: Date.now(),
      offer_count: 1,
    });
    replaceVnStockProviderSnapshot(VN_ID, 'sofmap', [makeOffer('sofmap', '2')], {
      status: 'ok',
      message: null,
      fetched_at: Date.now(),
      offer_count: 1,
    });
    expect(listVnStockOffers(VN_ID).length).toBe(2);
    expect(listVnStockProviderStatuses(VN_ID).length).toBe(2);
    const result = clearVnStockCache(VN_ID);
    expect(result.offers).toBe(2);
    expect(result.statuses).toBe(2);
    expect(listVnStockOffers(VN_ID).length).toBe(0);
    expect(listVnStockProviderStatuses(VN_ID).length).toBe(0);
  });

  it('does not affect other VNs', () => {
    replaceVnStockProviderSnapshot(VN_ID, 'amiami', [makeOffer('amiami', '1')], {
      status: 'ok',
      message: null,
      fetched_at: Date.now(),
      offer_count: 1,
    });
    const otherVn = 'v95002';
    replaceVnStockProviderSnapshot(otherVn, 'amiami', [makeOffer('amiami', '99', otherVn)], {
      status: 'ok',
      message: null,
      fetched_at: Date.now(),
      offer_count: 1,
    });
    clearVnStockCache(VN_ID);
    expect(listVnStockOffers(VN_ID).length).toBe(0);
    expect(listVnStockOffers(otherVn).length).toBe(1);
    clearVnStockCache(otherVn);
  });
});
