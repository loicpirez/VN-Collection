/**
 * Exercises the multi-fetch follow-up logic inside the bespoke provider
 * refreshers, reached only through `refreshStockForVn`:
 *  - Sofmap: search list -> JAN-based USED follow-up fetch.
 *  - Hgame1: msearch.cgi -> per-item detail fetch + parse.
 *  - Mandarake: keyword list -> detailPage/item follow-up.
 *  - discoverRetailerTargetsFromOfficialPages: an entergram official-site
 *    extlink is crawled for outbound shop links.
 *
 * The HTTP layer and VNDB releases are mocked; the per-worker SQLite DB is
 * real. Sofmap content is ASCII-only because fetchShopText decodes its bytes
 * as Shift_JIS and the mock's Response encodes strings as UTF-8.
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

const { releasesMock } = vi.hoisted(() => ({ releasesMock: vi.fn() }));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getReleasesForVn: releasesMock, getVn: async () => null };
});

import { refreshStockForVn } from '@/lib/stock';
import { db, listVnStockProviderStatuses, setAppSetting, upsertVn, type RawVnPayload } from '@/lib/db';
import type { VndbRelease } from '@/lib/vndb';

const VN_ID = 'v95300';

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function emptyRelease(id: string, extlinks: VndbRelease['extlinks'], gtin: string | null = null): VndbRelease {
  return {
    id,
    title: 'Test Game',
    alttitle: null,
    languages: [],
    platforms: ['win'],
    media: [],
    released: '2020-01-01',
    minage: 18,
    patch: false,
    freeware: false,
    uncensored: null,
    official: true,
    has_ero: true,
    resolution: null,
    engine: null,
    voiced: null,
    notes: null,
    gtin,
    catalog: null,
    producers: [],
    extlinks,
    vns: [],
    images: [],
  };
}

function seedVn(overrides: Partial<RawVnPayload> = {}): void {
  upsertVn({ id: VN_ID, title: 'Test Game', alttitle: 'Test Game', ...overrides });
}

beforeEach(() => {
  db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn_stock_provider_status WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn WHERE id = ?`).run(VN_ID);
  setAppSetting('stock_disabled_providers', null);
  fetchMock.mockReset();
  releasesMock.mockReset();
  releasesMock.mockResolvedValue([]);
  runDirectMock.mockClear();
  runDirectMock.mockImplementation(<T,>(fn: () => Promise<T>) => fn());
});

afterEach(() => {
  vi.useRealTimers();
});

function statusFor(provider: string) {
  return listVnStockProviderStatuses(VN_ID).find((s) => s.provider === provider);
}

describe('refreshStockForVn — Sofmap search list + JAN USED follow-up', () => {
  it('parses a keyword-search hit and follows its JAN to the USED listing', async () => {
    seedVn();
    releasesMock.mockResolvedValue([]);

    const listHtml = `<ul id="change_style_list" class="product_list">
      <li><div class="mainbox">
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000001" class="itemimg"><img src="https://image.sofmap.com/images/product/large/4900000099999.jpg" alt="x"></a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000001" class="product_name">Test Game [PC]</a>
        <span class="price"><strong>&yen;5,280</strong></span>
        <!-- stock_disp_id : IN_STOCK --><span class="ic stock">in stock</span>
      </div></li>
    </ul>`;
    const usedHtml = `<ul id="change_style_list" class="product_list">
      <li><div class="mainbox">
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000002" class="itemimg"><img alt="x"></a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000002" class="product_name">Test Game [PC]</a>
        <span class="price"><strong>&yen;2,980</strong></span>
        <!-- stock_disp_id : TENPO_IN_STOCK --><span class="ic stock inshop">in shop</span>
        <dl class="used_link shop"><dd><a href="https://www.sofmap.com/tenpo/contents/?id=shops&sid=akiba">Akiba Store</a></dd></dl>
      </div></li>
    </ul>`;

    fetchMock.mockImplementation((url: string) => {
      // The keyword search page (no new_jan) vs the USED follow-up (new_jan=...).
      if (/new_jan=4900000099999/.test(url)) return Promise.resolve(htmlResponse(usedHtml));
      return Promise.resolve(htmlResponse(listHtml));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['sofmap']);
    expect(statusFor('sofmap')?.status).toBe('ok');
    const offers = snapshot.offers.filter((o) => o.provider === 'sofmap');
    // The list hit plus the USED follow-up offer (with the physical branch).
    expect(offers.some((o) => o.location_branch === 'Akiba Store')).toBe(true);
    expect(fetchMock.mock.calls.some(([u]) => /new_jan=4900000099999/.test(u as string))).toBe(true);
  });
});

describe('refreshStockForVn — Hgame1 search page + detail', () => {
  it('extracts item links from the search page and parses each detail page', async () => {
    seedVn({ title: 'てすとげーむ', alttitle: 'てすとげーむ' });
    releasesMock.mockResolvedValue([]);

    const searchHtml = `<html><body>
      <a href="/item/4900000011111.html">てすとげーむ 初回版</a>
      <a href="/item/4900000022222.html">unrelated bundle</a>
      <a href="/item/4900000033333.html">missing detail</a>
    </body></html>`;
    const detailHtml = (title: string) => `<html><body>
      <h1>${title}</h1>
      <input type="hidden" name="price" value="3480">
      <th>数量</th><td>在庫の状況<script>switch(parseInt("3")){}</script></td>
    </body></html>`;

    fetchMock.mockImplementation((url: string) => {
      if (/msearch\.cgi/.test(url)) return Promise.resolve(htmlResponse(searchHtml));
      if (/4900000011111\.html/.test(url)) return Promise.resolve(htmlResponse(detailHtml('てすとげーむ 初回版')));
      if (/4900000022222\.html/.test(url)) return Promise.resolve(htmlResponse(detailHtml('unrelated bundle')));
      if (/4900000033333\.html/.test(url)) return Promise.resolve(htmlResponse('<p>missing title</p>'));
      return Promise.resolve(htmlResponse('<html></html>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['hgame1']);
    const offers = snapshot.offers.filter((o) => o.provider === 'hgame1');
    // Only the title-matching detail page survives targetMatchesTitle.
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ price: 3480, availability: 'in_stock', location_label: 'PC Shop Unoya' });
  });

  it('stops before Hgame1 detail fetches when cancellation lands after the search page', async () => {
    seedVn({ title: 'TestGame', alttitle: 'TestGame' });
    releasesMock.mockResolvedValue([]);
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(htmlResponse('<a href="/item/4900000011111.html">TestGame</a>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['hgame1'], controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.offers.filter((offer) => offer.provider === 'hgame1')).toEqual([]);
  });
});

describe('refreshStockForVn — Mandarake keyword list to detail', () => {
  it('follows detailPage/item links from a keyword list and parses each product', async () => {
    seedVn({ title: 'てすとげーむ', alttitle: 'てすとげーむ' });
    releasesMock.mockResolvedValue([]);

    const listHtml = `<html><body>
      <a href="https://order.mandarake.co.jp/order/detailPage/item?itemCode=1099012345&ref=list">てすとげーむ</a>
    </body></html>`;
    const detailHtml = `<html><head><title>てすとげーむ - Mandarake</title></head><body>
      <h1>てすとげーむ 限定版</h1>
      <p class="price">価格: <strong>4,800</strong>円（税込）</p>
      <p>状態：中古 開封済み</p>
      <p>在庫あり</p>
    </body></html>`;

    fetchMock.mockImplementation((url: string) => {
      if (/detailPage\/item/.test(url)) return Promise.resolve(htmlResponse(detailHtml));
      return Promise.resolve(htmlResponse(listHtml));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['mandarake']);
    const offers = snapshot.offers.filter((o) => o.provider === 'mandarake');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      provider_offer_id: '1099012345',
      price: 4800,
      condition: 'used',
      location_label: 'Mandarake',
    });
  });
});

describe('refreshStockForVn — Melonbooks search page to detail', () => {
  it('follows product_id links from a search page and parses each detail page', async () => {
    seedVn({ title: 'てすとげーむ', alttitle: 'てすとげーむ' });
    releasesMock.mockResolvedValue([]);

    const searchHtml = `<html><body>
      <a href="/detail/detail.php?product_id=950555">てすとげーむ 通常版</a>
      <a href="/detail/detail.php?product_id=950556">missing detail</a>
      <a href="/detail/detail.php?product_id=950557">unrelated detail</a>
      <a href="/category/list.php?genre=vn">facet (ignored)</a>
    </body></html>`;
    const detailHtml = `<h1 class="page-header">てすとげーむ 通常版</h1>
      <p class="price"><span class="price--currency">¥</span><span class="price--value">6,600</span>円</p>
      <span class="product-info__inventory-status__text">在庫あり</span>`;

    fetchMock.mockImplementation((url: string) => {
      if (/\/search\/search\.php/.test(url)) return Promise.resolve(htmlResponse(searchHtml));
      if (/product_id=950555/.test(url)) return Promise.resolve(htmlResponse(detailHtml));
      if (/product_id=950556/.test(url)) return Promise.resolve(htmlResponse('<p>missing title</p>'));
      if (/product_id=950557/.test(url)) return Promise.resolve(htmlResponse('<h1 class="page-header">unrelated</h1>'));
      return Promise.resolve(htmlResponse('<html></html>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks']);
    const offer = snapshot.offers.find(
      (o) => o.provider === 'melonbooks' && o.url.includes('product_id=950555'),
    );
    expect(offer).toMatchObject({ price: 6600, availability: 'in_stock', source: 'search' });
  });

  it('stops before Melonbooks detail fetches when cancellation lands after the search page', async () => {
    seedVn({ title: 'TestGame', alttitle: 'TestGame' });
    releasesMock.mockResolvedValue([]);
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(htmlResponse('<a href="/detail/detail.php?product_id=950558">TestGame</a>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks'], controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.offers.filter((offer) => offer.provider === 'melonbooks')).toEqual([]);
  });
});

describe('refreshStockForVn — Trader search list + detail', () => {
  it('parses chuko-tsuhan list cards then upgrades them via the detail page', async () => {
    // ASCII title + digit prices: fetchShopText decodes Trader bytes as EUC-JP,
    // and the mock Response encodes the string as UTF-8, so only ASCII is safe.
    seedVn({ title: 'TestGame', alttitle: 'TestGame' });
    releasesMock.mockResolvedValue([]);

    const listHtml = `<html><body><ul>
      <li>
        <a href="detail.html?id=700001&amp;page=1"><img src="x.jpg" alt="TestGame First Press"><p>TestGame First Press</p>
        <p class="price"><em>3,800</em></p></a>
      </li>
    </ul></body></html>`;
    const detailHtml = `<html><head>
      <meta property="og:title" content="TestGame First Press">
      <meta property="product:price:amount" content="3800">
    </head><body><h1>TestGame First Press</h1><p class="price"><em>3,800</em></p></body></html>`;

    fetchMock.mockImplementation((url: string) => {
      if (/detail\.html\?id=700001/.test(url)) return Promise.resolve(htmlResponse(detailHtml));
      return Promise.resolve(htmlResponse(listHtml));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['trader']);
    const offers = snapshot.offers.filter((o) => o.provider === 'trader');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      product_id: '700001',
      price: 3800,
      availability: 'in_stock',
      location_label: 'Trader Online / 秋葉原トレーダー通販',
    });
    // The detail fetch upgraded the list offer's source to direct.
    expect(offers[0].source).toBe('direct');
  });

  it('sorts in-stock Trader rows first and caps detail-page follow-ups', async () => {
    seedVn({ title: 'TestGame', alttitle: 'TestGame' });
    releasesMock.mockResolvedValue([]);
    const rows = Array.from({ length: 12 }, (_, index) => {
      const id = String(710000 + index);
      const soldOut = index % 3 === 0;
      return `<li><a href="detail.html?id=${id}&amp;page=1"><img alt="TestGame ${index}">
        ${soldOut ? '<p class="soldout">sold out</p>' : '<p class="price"><em>3,800</em></p>'}</a></li>`;
    }).join('');
    const listHtml = `<ul>${rows}</ul>`;
    let detailCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (/detail\.html/.test(url)) {
        detailCalls += 1;
        return Promise.resolve(htmlResponse('<h1>TestGame detail</h1><p class="price"><em>3,800</em></p>'));
      }
      return Promise.resolve(htmlResponse(listHtml));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['trader']);

    expect(snapshot.offers.filter((offer) => offer.provider === 'trader')).toHaveLength(12);
    expect(detailCalls).toBe(10);
  });

  it('stops Trader iteration when cancelled after a search response', async () => {
    seedVn({ title: 'TestGame', alttitle: 'OtherGame' });
    releasesMock.mockResolvedValue([]);
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(htmlResponse('<li><a href="detail.html?id=720000"><img alt="TestGame"></a></li>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['trader'], controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.offers.filter((offer) => offer.provider === 'trader')).toHaveLength(0);
  });
});

describe('refreshStockForVn — duplicate-offer dedupe', () => {
  it('collapses two list rows that share a product URL, keeping one offer', async () => {
    seedVn({ title: 'Test Game', alttitle: 'Test Game' });
    releasesMock.mockResolvedValue([]);

    // Two <li> blocks with the same sku → identical product URL → same dedupe
    // key. dedupeProviderOffers keeps a single row via the source/confidence
    // ranking.
    const listHtml = `<ul id="change_style_list" class="product_list">
      <li><div class="mainbox">
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000077" class="itemimg"><img alt="x"></a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000077" class="product_name">Test Game [PC]</a>
        <span class="price"><strong>&yen;5,280</strong></span>
        <!-- stock_disp_id : IN_STOCK --><span class="ic stock">in stock</span>
      </div></li>
      <li><div class="mainbox">
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000077" class="itemimg"><img alt="x"></a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=400000077" class="product_name">Test Game [PC]</a>
        <span class="price"><strong>&yen;5,280</strong></span>
        <!-- stock_disp_id : IN_STOCK --><span class="ic stock">in stock</span>
      </div></li>
    </ul>`;

    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse(listHtml)));

    const snapshot = await refreshStockForVn(VN_ID, ['sofmap']);
    const offers = snapshot.offers.filter(
      (o) => o.provider === 'sofmap' && o.provider_offer_id === '400000077',
    );
    expect(offers).toHaveLength(1);
  });
});

describe('refreshStockForVn — Sofmap direct detail page', () => {
  it('parses a direct product_detail extlink into a single offer', async () => {
    seedVn({ title: 'Test Game', alttitle: 'Test Game' });
    releasesMock.mockResolvedValue([
      emptyRelease('r95302', [
        { url: 'https://a.sofmap.com/product_detail.aspx?sku=400000050', label: 'Sofmap', name: 'sofmap' },
      ]),
    ]);

    const detailHtml = `<html><body>
      <h1>Test Game [PC]</h1>
      <table>
        <tr><th>ソフマップ特価</th><td><span class="price"><strong>&yen;5,280</strong></span></td></tr>
        <tr><th>在庫</th><td><span>in stock</span></td></tr>
      </table>
    </body></html>`;

    fetchMock.mockImplementation((url: string) => {
      // The direct detail page; the title-search list page returns nothing useful.
      if (/product_detail/.test(url)) return Promise.resolve(htmlResponse(detailHtml));
      return Promise.resolve(htmlResponse('<html></html>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['sofmap']);
    const offer = snapshot.offers.find((o) => o.provider === 'sofmap' && o.provider_offer_id === '400000050');
    expect(offer).toBeDefined();
    expect(offer).toMatchObject({ price: 5280, title: 'Test Game [PC]' });
  });
});

describe('refreshStockForVn — Suruga-ya pagination', () => {
  it('fetches additional search pages when the result total spans more than one page', async () => {
    seedVn({ title: 'てすとげーむ', alttitle: 'てすとげーむ' });
    releasesMock.mockResolvedValue([]);

    const card = (id: string) => `<div class="item_box">
      <p class="item_name"><a href="/product/detail/${id}">てすとげーむ 通常版</a></p>
      <p class="item_kind_type">ニンテンドースイッチソフト</p>
      <div class="price_block"><p>中古：￥3,000</p></div>
    </div>`;
    // Page 1 reports a 50-item total → triggers page 2/3 fetches.
    const page1 = `<p class="search_count">1-24件 / 50件</p>${card('800001')}`;
    const page2 = `<p class="search_count">25-48件 / 50件</p>${card('800002')}`;

    fetchMock.mockImplementation((url: string) => {
      if (/[?&]page=2\b/.test(url)) return Promise.resolve(htmlResponse(page2));
      return Promise.resolve(htmlResponse(page1));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['surugaya']);
    const ids = snapshot.offers.filter((o) => o.provider === 'surugaya').map((o) => o.provider_offer_id);
    expect(ids).toContain('800001');
    expect(ids).toContain('800002');
    expect(fetchMock.mock.calls.some(([u]) => /[?&]page=2\b/.test(u as string))).toBe(true);
  });
});

describe('refreshStockForVn — official-page retailer discovery', () => {
  it('crawls an entergram official-site extlink for outbound shop links', async () => {
    // VN extlink to the official publisher page (entergram), which links out
    // to a melonbooks product the discovery step turns into a direct target.
    seedVn({
      title: 'てすとげーむ',
      alttitle: 'てすとげーむ',
      extlinks: [{ url: 'https://www.entergram.co.jp/products/test/', label: 'Official', name: 'official' }],
    });
    releasesMock.mockResolvedValue([
      emptyRelease('r95301', [{ url: 'https://www.entergram.co.jp/products/test/', label: 'Official', name: 'official' }]),
    ]);

    const officialHtml = `<html><body>
      <a href="https://example.test/unhandled">Unsupported</a>
      <a href="https://www.melonbooks.co.jp/detail/detail.php?product_id=950777">Buy at Melonbooks</a>
    </body></html>`;
    const melonDetail = `<h1 class="page-header">てすとげーむ 限定版</h1>
      <p class="price"><span class="price--currency">¥</span><span class="price--value">5,480</span>円</p>
      <span class="product-info__inventory-status__text">在庫あり</span>`;

    fetchMock.mockImplementation((url: string) => {
      if (/entergram\.co\.jp/.test(url)) return Promise.resolve(htmlResponse(officialHtml));
      if (/melonbooks\.co\.jp\/detail/.test(url)) return Promise.resolve(htmlResponse(melonDetail));
      return Promise.resolve(htmlResponse('<html></html>'));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks']);
    const melon = snapshot.offers.find(
      (o) => o.provider === 'melonbooks' && o.url.includes('product_id=950777'),
    );
    expect(melon).toBeDefined();
    expect(fetchMock.mock.calls.some(([u]) => /entergram\.co\.jp/.test(u as string))).toBe(true);
  });
});
