/**
 * Coverage for `getStockForVn`: AliceNet cached-offer synthesis, the summary
 * counters (available / best_price / related / needs_review / rejected /
 * last_refresh), availability-then-priority sorting, the disabled-provider
 * flag on the providers list, and the offer source-priority ranking.
 *
 * The per-worker SQLite DB is real; rows are written through the production
 * `replaceVnStockProviderSnapshot` helper and a direct AliceNet insert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getStockForVn } from '@/lib/stock';
import {
  db,
  replaceVnStockProviderSnapshot,
  setAppSetting,
  upsertVn,
  type VnStockOfferInput,
} from '@/lib/db';

const VN_ID = 'v95100';
const NOW = 1_700_000_000_000;

function offer(overrides: Partial<VnStockOfferInput> = {}): VnStockOfferInput {
  return {
    vn_id: VN_ID,
    provider: 'melonbooks',
    provider_offer_id: `p-${Math.random().toString(36).slice(2)}`,
    source: 'search',
    title: 'てすとげーむ',
    url: `https://www.melonbooks.co.jp/detail/detail.php?product_id=${Math.floor(Math.random() * 1e6)}`,
    price: 3000,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: null,
    condition: null,
    edition_label: null,
    location_label: null,
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
  };
}

function seedAlicenet(code: string, salePrice: string | null): void {
  // AliceNet stores prices as display strings; getStockForVn runs them through
  // parsePriceYen, which needs a yen marker (¥ / 円), not a bare integer.
  db.prepare(`
    INSERT INTO alicenet_stock (code, title, jan, list_price, sale_price, vn_id, vn_match_source, fetched_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)
    ON CONFLICT(code) DO UPDATE SET vn_id = excluded.vn_id, sale_price = excluded.sale_price
  `).run(code, 'てすとげーむ used', '4900000000001', '5,000円', salePrice, VN_ID, NOW, NOW);
}

beforeEach(() => {
  db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn_stock_provider_status WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM alicenet_stock WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn WHERE id = ?`).run(VN_ID);
  setAppSetting('stock_disabled_providers', null);
  upsertVn({ id: VN_ID, title: 'てすとげーむ', alttitle: 'Test Game' });
});

describe('getStockForVn — empty snapshot', () => {
  it('returns an all-empty summary with a null last_refresh', () => {
    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.offers).toEqual([]);
    expect(snapshot.summary).toEqual({
      total: 0,
      available: 0,
      best_price: null,
      related_available: 0,
      needs_review: 0,
      rejected: 0,
      last_refresh: null,
    });
    expect(snapshot.providers.length).toBeGreaterThan(0);
  });
});

describe('getStockForVn — summary counters', () => {
  it('computes best_price from the top-priority eligible pool only', () => {
    replaceVnStockProviderSnapshot(VN_ID, 'melonbooks', [
      // direct source (rank 0), high confidence, cheapest in its pool
      offer({ source: 'direct', price: 2500, provider_offer_id: 'd1' }),
      offer({ source: 'direct', price: 4000, provider_offer_id: 'd2' }),
      // search source (rank 5) — must NOT pull best_price down
      offer({ source: 'search', price: 900, jan: null, product_id: null, provider_offer_id: 's1' }),
    ], { status: 'ok', message: null, fetched_at: NOW, offer_count: 3 });

    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.best_price).toBe(2500);
    expect(snapshot.summary.available).toBe(3);
  });

  it('counts related, needs_review, and rejected groups', () => {
    replaceVnStockProviderSnapshot(VN_ID, 'melonbooks', [
      offer({ provider_offer_id: 'g1', content_kind: 'game_package', series_relation: 'exact_game', match_confidence: 'high' }),
      offer({ provider_offer_id: 'rel1', content_kind: 'figure', series_relation: 'related_goods', match_confidence: 'high', availability: 'in_stock' }),
      offer({ provider_offer_id: 'nr1', content_kind: 'game_package', series_relation: 'exact_game', match_confidence: 'medium' }),
      offer({ provider_offer_id: 'rj1', content_kind: 'game_package', series_relation: 'exact_game', match_confidence: 'reject' }),
    ], { status: 'ok', message: null, fetched_at: NOW, offer_count: 4 });

    const snapshot = getStockForVn(VN_ID);
    expect(snapshot.summary.related_available).toBe(1);
    expect(snapshot.summary.needs_review).toBe(1);
    expect(snapshot.summary.rejected).toBe(1);
    expect(snapshot.summary.last_refresh).toBe(NOW);
  });

  it('leaves best_price null when no eligible offer carries a positive price', () => {
    replaceVnStockProviderSnapshot(VN_ID, 'melonbooks', [
      offer({ provider_offer_id: 'np', price: null, source: 'direct' }),
    ], { status: 'ok', message: null, fetched_at: NOW, offer_count: 1 });

    expect(getStockForVn(VN_ID).summary.best_price).toBeNull();
  });
});

describe('getStockForVn — AliceNet synthesis', () => {
  it('synthesises a used in-stock AliceNet offer from a matched row', () => {
    seedAlicenet('123-456789-001', '3,200円');
    const snapshot = getStockForVn(VN_ID);
    const alice = snapshot.offers.find((o) => o.provider === 'alicenet');
    expect(alice).toBeDefined();
    expect(alice).toMatchObject({
      availability: 'in_stock',
      condition: 'used',
      location_label: 'AliceNet',
      price: 3200,
      jan: '4900000000001',
      content_kind: 'game_package',
      match_confidence: 'high',
    });
    expect(snapshot.summary.total).toBe(1);
  });

  it('falls back to the list price when the AliceNet sale price is absent', () => {
    seedAlicenet('123-456789-002', null);
    const alice = getStockForVn(VN_ID).offers.find((o) => o.provider === 'alicenet');
    expect(alice?.price).toBe(5000);
  });
});

describe('getStockForVn — sorting', () => {
  it('orders in_stock before out_of_stock and direct before search within availability', () => {
    replaceVnStockProviderSnapshot(VN_ID, 'wondergoo', [
      offer({ provider: 'wondergoo', provider_offer_id: 'oos', availability: 'out_of_stock', source: 'direct', price: 100 }),
    ], { status: 'ok', message: null, fetched_at: NOW, offer_count: 1 });
    replaceVnStockProviderSnapshot(VN_ID, 'melonbooks', [
      offer({ provider: 'melonbooks', provider_offer_id: 'search-hit', availability: 'in_stock', source: 'search', price: 5000, jan: null, product_id: null }),
      offer({ provider: 'melonbooks', provider_offer_id: 'direct-hit', availability: 'in_stock', source: 'direct', price: 5000 }),
    ], { status: 'ok', message: null, fetched_at: NOW, offer_count: 2 });

    const snapshot = getStockForVn(VN_ID);
    const ids = snapshot.offers.map((o) => o.provider_offer_id);
    // both in_stock come first; among them, the direct-source one ranks first.
    expect(ids.indexOf('direct-hit')).toBeLessThan(ids.indexOf('search-hit'));
    expect(ids.indexOf('search-hit')).toBeLessThan(ids.indexOf('oos'));
  });
});

describe('getStockForVn — disabled providers flag', () => {
  it('flags disabled providers in the providers list without dropping them', () => {
    setAppSetting('stock_disabled_providers', JSON.stringify(['wondergoo']));
    const snapshot = getStockForVn(VN_ID);
    const wondergoo = snapshot.providers.find((p) => p.id === 'wondergoo');
    const melonbooks = snapshot.providers.find((p) => p.id === 'melonbooks');
    expect((wondergoo as { disabled?: boolean }).disabled).toBe(true);
    expect((melonbooks as { disabled?: boolean }).disabled).toBe(false);
  });
});
