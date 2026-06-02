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
  replaceVnStockProviderSnapshot,
  setAppSetting,
  upsertVn,
  type VnStockOfferInput,
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

function cachedSurugayaOffer(): VnStockOfferInput {
  return {
    vn_id: VN_ID,
    provider: 'surugaya',
    provider_offer_id: 'cached',
    source: 'search',
    title: 'てすとげーむ',
    url: 'https://www.suruga-ya.jp/product/detail/950399',
    price: 3000,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: null,
    condition: 'used',
    edition_label: null,
    location_label: 'Suruga-ya',
    location_branch: null,
    source_release_id: null,
    jan: null,
    fetched_at: 1,
    error: null,
    content_kind: 'game_package',
    platform: null,
    edition_kind: null,
    series_relation: 'exact_game',
    match_confidence: 'high',
    match_score: 90,
    match_warnings_json: null,
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: '950399',
    page_kind: 'detail',
  };
}

const EP_ID = 90011;

interface EpRetailerFixture {
  retailerId: number;
  retailerName: string;
  productUrl: string;
  isAvailable: boolean;
  isOnSale: boolean;
  currentPrice: number | null;
  regularPrice: number | null;
  originalPrice: number | null;
  condition: string | null;
}

interface EpDetailFixture {
  id: number;
  title: string;
  downloadRetailers: EpRetailerFixture[];
  packageRetailers: EpRetailerFixture[];
}

/** Eroge Price /api/games detail with one download + one package retailer. */
function epDetail(): EpDetailFixture {
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

  it('uses the Eroge Price title and preserves a missing retailer price', async () => {
    seedVn('', 'Test Game');
    const detail = epDetail();
    detail.packageRetailers.push({
      retailerId: 3,
      retailerName: 'Missing Price Shop',
      productUrl: 'https://www.amazon.co.jp/dp/B000JF6UD3',
      isAvailable: true,
      isOnSale: true,
      currentPrice: null,
      regularPrice: null,
      originalPrice: null,
      condition: null,
    });
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === apiGameUrl(EP_ID) ? jsonResponse(detail) : routeErogePrice(url)),
    );

    const snapshot = await refreshStockForVn(VN_ID, ['eroge_price']);

    const offer = snapshot.offers.find((candidate) => candidate.location_label === 'Missing Price Shop');
    expect(offer).toMatchObject({ title: 'Eroge Price Title', price: null, availability: 'in_stock' });
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

  it('retries an eroge_price API error and then succeeds', async () => {
    vi.useFakeTimers();
    seedVn();
    let searchCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === buildErogePriceApiSearchUrl('Test Game')) {
        searchCalls += 1;
        if (searchCalls === 1) return Promise.resolve(jsonResponse({ error: 'busy' }));
      }
      return Promise.resolve(routeErogePrice(url));
    });

    const promise = refreshStockForVn(VN_ID, ['eroge_price']);
    await vi.advanceTimersByTimeAsync(11_000);
    const snapshot = await promise;

    expect(searchCalls).toBeGreaterThanOrEqual(2);
    expect(snapshot.offers.some((offer) => offer.provider === 'eroge_price')).toBe(true);
  });

  it('records invalid JSON after exhausting eroge_price retries', async () => {
    vi.useFakeTimers();
    seedVn('', 'AA');
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse('<html>blocked</html>')));

    const promise = refreshStockForVn(VN_ID, ['eroge_price']);
    await vi.advanceTimersByTimeAsync(25_000);
    await promise;

    expect(statusFor('eroge_price')?.message).toMatch(/invalid JSON/);
  });

  it('records API errors after exhausting eroge_price retries', async () => {
    vi.useFakeTimers();
    seedVn('', 'AA');
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ error: null })));

    const promise = refreshStockForVn(VN_ID, ['eroge_price']);
    await vi.advanceTimersByTimeAsync(25_000);
    await promise;

    expect(statusFor('eroge_price')?.message).toMatch(/unknown/);
  });

  it('reuses a persisted eroge_price manual pin on the next refresh', async () => {
    seedVn();
    fetchMock.mockImplementation((url: string) => Promise.resolve(routeErogePrice(url)));

    await refreshStockForVn(VN_ID, ['eroge_price']);
    await refreshStockForVn(VN_ID, ['eroge_price']);

    expect(getErogePriceStockExtras(VN_ID)?.selectedEpId).toBe(EP_ID);
  });

  it('stops eroge_price query iteration when cancelled between searches', async () => {
    seedVn();
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(jsonResponse({ games: [], pagination: { page: 1, limit: 0, total: 0 } }));
    });

    await refreshStockForVn(VN_ID, ['eroge_price'], controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('keeps Suruga-ya availability unknown when a card has no stock marker', async () => {
    seedVn();
    fetchMock.mockImplementation(() =>
      Promise.resolve(htmlResponse('<a href="/product/detail/950301">てすとげーむ 通常版</a>')),
    );

    const snapshot = await refreshStockForVn(VN_ID, ['surugaya']);

    expect(snapshot.offers.find((offer) => offer.provider_offer_id === '950301')).toMatchObject({
      availability: 'unknown',
      price: null,
    });
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

  it('preserves cached Suruga-ya offers when a later refresh is protected', async () => {
    seedVn();
    replaceVnStockProviderSnapshot(VN_ID, 'surugaya', [cachedSurugayaOffer()], {
      status: 'ok',
      message: null,
      fetched_at: 1,
      offer_count: 1,
    });
    fetchMock.mockImplementation(() =>
      Promise.resolve(htmlResponse('<title>Attention Required</title><script>__cf_chl_abc=1</script>')),
    );

    const snapshot = await refreshStockForVn(VN_ID, ['surugaya']);

    expect(snapshot.offers.some((offer) => offer.provider_offer_id === 'cached')).toBe(true);
    expect(statusFor('surugaya')).toMatchObject({ status: 'protected', offer_count: 1, cached_offers_available: 1 });
  });

  it('ignores a protected Suruga-ya follow-up page while keeping page-one cards', async () => {
    seedVn();
    const firstPage = `<p class="search_count">1-24件 / 50件</p>
      <a href="/product/detail/950398">てすとげーむ 通常版</a><p>中古：￥3,000</p>`;
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(htmlResponse(url.includes('page=2') ? '<script>__cf_chl_next=1</script>' : firstPage)),
    );

    const snapshot = await refreshStockForVn(VN_ID, ['surugaya']);

    expect(snapshot.offers.some((offer) => offer.provider_offer_id === '950398')).toBe(true);
  });

  it('stops later Suruga-ya title queries after cancellation', async () => {
    seedVn('てすとげーむ', 'Test Game');
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(htmlResponse('<html></html>'));
    });

    await refreshStockForVn(VN_ID, ['surugaya'], controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
