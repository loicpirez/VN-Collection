/**
 * Drives `refreshStockForVn` for the two providers with bespoke result
 * shapers that the structured-parser unit tests cannot reach on their own:
 *  - eroge_price → searchAndFetchAll → bundleToOfferInputs → retailerToOffer
 *    (download + package retailers, sale-price + list-price selection,
 *    availability flags, extras persistence).
 *  - surugaya → surugayaCardToOffer (marketplace-only availability label,
 *    store-code branch label).
 *
 * Hermetic: the HTTP layer and VNDB releases are mocked; the per-worker
 * SQLite DB is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock, runDirectMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  runDirectMock: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
}));

vi.mock('@/lib/proxy-fetch', () => ({
  stockProviderFetch: fetchMock,
  runStockFetchDirect: runDirectMock,
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getReleasesForVn: async () => [], getVn: async () => null };
});

import { refreshStockForVn } from '@/lib/stock';
import {
  apiGameUrl,
  apiPriceStatsUrl,
  apiPricesUrl,
  apiRelatedUrl,
  buildErogePriceApiSearchUrl,
} from '@/lib/erogeprice-meta';
import {
  db,
  getErogePriceStockExtras,
  listVnStockProviderStatuses,
  setAppSetting,
  upsertVn,
} from '@/lib/db';

const VN_ID = 'v95200';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function seedVn(title = 'てすとげーむ', alttitle: string | null = 'Test Game'): void {
  upsertVn({ id: VN_ID, title, alttitle });
}

beforeEach(() => {
  db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn_stock_provider_status WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn WHERE id = ?`).run(VN_ID);
  setAppSetting('stock_disabled_providers', null);
  fetchMock.mockReset();
  runDirectMock.mockClear();
  runDirectMock.mockImplementation(<T,>(fn: () => Promise<T>) => fn());
});

afterEach(() => {
  vi.useRealTimers();
});

function statusFor(provider: string) {
  return listVnStockProviderStatuses(VN_ID).find((s) => s.provider === provider);
}

const EP_ID = 90011;

/** Eroge Price /api/games detail with one download + one package retailer. */
function epDetail() {
  return {
    id: EP_ID,
    title: 'Eroge Price Title',
    downloadRetailers: [
      {
        retailerId: 1,
        retailerName: 'DLsite',
        productUrl: 'https://www.dlsite.com/p1',
        isAvailable: true,
        isOnSale: true,
        currentPrice: 1800,
        regularPrice: 2400,
        originalPrice: 2400,
        condition: null,
      },
    ],
    packageRetailers: [
      {
        retailerId: 2,
        retailerName: 'Amazon',
        productUrl: 'https://www.amazon.co.jp/dp/B000JF6UD2',
        isAvailable: false,
        isOnSale: false,
        currentPrice: 5200,
        regularPrice: 5200,
        originalPrice: null,
        condition: '新品',
      },
    ],
  };
}

function routeErogePrice(url: string): Response {
  if (url === buildErogePriceApiSearchUrl('Test Game')) {
    return jsonResponse({ games: [{ id: EP_ID, title: 'Eroge Price Title' }], pagination: { page: 1, limit: 1, total: 1 } });
  }
  if (url === apiGameUrl(EP_ID)) return jsonResponse(epDetail());
  if (url === apiPriceStatsUrl(EP_ID)) return jsonResponse({ allTimeMin: 1500, allTimeMax: 3000 });
  if (url === apiPricesUrl(EP_ID)) return jsonResponse([]);
  if (url === apiRelatedUrl(EP_ID)) return jsonResponse({ connections: [], sameBrand: [] });
  // Any other eroge-price query (tilde/full-width variants) → empty search.
  return jsonResponse({ games: [], pagination: { page: 1, limit: 0, total: 0 } });
}

describe('refreshStockForVn — eroge_price bundle conversion', () => {
  it('converts download + package retailers into offers with sale/list pricing', async () => {
    seedVn();
    fetchMock.mockImplementation((url: string) => Promise.resolve(routeErogePrice(url)));

    const snapshot = await refreshStockForVn(VN_ID, ['eroge_price']);
    expect(statusFor('eroge_price')?.status).toBe('ok');

    const offers = snapshot.offers.filter((o) => o.provider === 'eroge_price');
    expect(offers.length).toBe(2);

    const dl = offers.find((o) => o.edition_label === 'ダウンロード版');
    expect(dl).toMatchObject({ price: 1800, availability: 'in_stock', location_label: 'DLsite' });
    expect(dl?.list_price).toBe(2400);

    const pkg = offers.find((o) => o.edition_label === 'パッケージ版');
    expect(pkg).toMatchObject({ price: 5200, availability: 'out_of_stock', location_label: 'Amazon', condition: '新品' });
  });

  it('persists the eroge_price extras envelope for the price-history panel', async () => {
    seedVn();
    fetchMock.mockImplementation((url: string) => Promise.resolve(routeErogePrice(url)));

    await refreshStockForVn(VN_ID, ['eroge_price']);
    const extras = getErogePriceStockExtras(VN_ID);
    expect(extras?.candidates[0].epId).toBe(EP_ID);
    expect(extras?.candidates[0].priceStats.allTimeMin).toBe(1500);
    expect(extras?.selectedEpId).toBe(EP_ID);
  });

  it('retries the eroge_price JSON fetch once when the first response is not JSON', async () => {
    vi.useFakeTimers();
    seedVn();
    let searchCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === buildErogePriceApiSearchUrl('Test Game')) {
        searchCalls += 1;
        // First search response is HTML (rate-limit page); the retry returns JSON.
        if (searchCalls === 1) return Promise.resolve(htmlResponse('<html>rate limited</html>'));
      }
      return Promise.resolve(routeErogePrice(url));
    });

    const promise = refreshStockForVn(VN_ID, ['eroge_price']);
    // Advance past the eroge-price 10s invalid-JSON backoff.
    await vi.advanceTimersByTimeAsync(11_000);
    const snapshot = await promise;
    expect(searchCalls).toBeGreaterThanOrEqual(2);
    expect(snapshot.offers.some((o) => o.provider === 'eroge_price')).toBe(true);
  });

  it('records no_results when the eroge_price search finds no candidates', async () => {
    seedVn();
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ games: [], pagination: { page: 1, limit: 0, total: 0 } })),
    );

    await refreshStockForVn(VN_ID, ['eroge_price']);
    expect(statusFor('eroge_price')?.status).toBe('no_results');
  });

  it('skips eroge_price entirely when the VN has neither title nor alttitle', async () => {
    seedVn('', null);
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ games: [] })));

    await refreshStockForVn(VN_ID, ['eroge_price']);
    expect(statusFor('eroge_price')?.status).toBe('skipped');
  });
});

describe('refreshStockForVn — surugaya card shaping', () => {
  it('labels a sold-out card that has a marketplace price and surfaces the store branch', async () => {
    seedVn();
    const html = `<p class="search_count">1-1件 / 1件</p>
      <div class="item_box">
        <a href="/product/detail/950300?tenpo_cd=AKIBA01"><img src="https://shinaban.suruga-ya.jp/x.jpg"></a>
        <p class="item_name"><a href="/product/detail/950300?tenpo_cd=AKIBA01">てすとげーむ 通常版</a></p>
        <p class="item_kind_type">ニンテンドースイッチソフト</p>
        <div class="price_block">
          <p>品切れ</p>
          <p>マケプレ ￥4,270 (2点の中古品)</p>
        </div>
      </div>`;
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse(html)));

    const snapshot = await refreshStockForVn(VN_ID, ['surugaya']);
    const offer = snapshot.offers.find((o) => o.provider === 'surugaya');
    expect(offer).toMatchObject({
      availability: 'out_of_stock',
      availability_label: 'marketplace:4270',
      marketplace_price: 4270,
      marketplace_count: 2,
      store_code: 'AKIBA01',
      location_label: 'Store AKIBA01',
      location_branch: 'Store AKIBA01',
    });
    expect(statusFor('surugaya')?.status).toBe('partial');
  });

  it('records protected when the surugaya search page is a Cloudflare challenge', async () => {
    seedVn();
    fetchMock.mockImplementation(() =>
      Promise.resolve(htmlResponse('<title>Just a moment...</title><script>window._cf_chl_opt={}</script>')),
    );

    await refreshStockForVn(VN_ID, ['surugaya']);
    const status = statusFor('surugaya');
    expect(status?.status).toBe('protected');
    expect(status?.blocked_kind).toBe('search_page');
  });
});
