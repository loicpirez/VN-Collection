/**
 * End-to-end coverage of the deterministic provider-wave runner in
 * `refreshStockForVn`: the four-shop concurrency chunking + progress
 * callback, the per-provider deadline (`STOCK_PROVIDER_TIMEOUT_MS`),
 * pre-run and mid-run cancellation, the disabled-provider filter, and the
 * ok / no_results / skipped / protected / error status branches written
 * by `writeProviderResult`.
 *
 * The HTTP layer (`@/lib/proxy-fetch`) and VNDB releases (`@/lib/vndb`)
 * are mocked so the test stays hermetic; the per-worker SQLite DB is real
 * and seeded through the production `upsertVn` + stock-source helpers.
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

const { proxiedMock } = vi.hoisted(() => ({ proxiedMock: vi.fn(() => false) }));

vi.mock('@/lib/proxy-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-config')>();
  return { ...actual, isStockProviderProxied: proxiedMock };
});

import { refreshStockForVn } from '@/lib/stock';
import {
  db,
  listVnStockProviderStatuses,
  setAppSetting,
  upsertStockSource,
  upsertVn,
  type RawVnPayload,
} from '@/lib/db';
import type { VndbRelease } from '@/lib/vndb';

const VN_ID = 'v95000';

/**
 * A `Response` body is a single-use ReadableStream; `fetchShopText` locks it
 * on read. Returning one cached object across the multiple fetches a provider
 * makes would throw "ReadableStream is locked", so every mock hands back a
 * freshly-constructed `Response`.
 */
function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

/** Reply to every fetch with a fresh `Response` carrying the same HTML. */
function respondWith(body: string, init: ResponseInit = {}): void {
  fetchMock.mockImplementation(() => Promise.resolve(htmlResponse(body, init)));
}

/** A melonbooks product-detail page that the direct parser accepts. */
function melonbooksDetailHtml(title: string, price: number): string {
  return `<h1 class="page-header">${title}</h1>
    <p class="price"><span class="price--currency">¥</span><span class="price--value">${price.toLocaleString('en-US')}</span>円</p>
    <span class="product-info__inventory-status__text">在庫あり</span>`;
}

function wondergooDetailHtml(title: string, price: number): string {
  return `<h1>${title}</h1><p class="price">${price.toLocaleString('en-US')}円(税込)</p>`;
}

function seedVn(overrides: Partial<RawVnPayload> = {}): void {
  upsertVn({
    id: VN_ID,
    title: 'てすとげーむ',
    alttitle: 'Test Game',
    ...overrides,
  });
}

/** Release carrying a direct melonbooks product extlink (single-fetch parse). */
function melonbooksRelease(): VndbRelease {
  return {
    id: 'r95001',
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
    gtin: null,
    catalog: null,
    producers: [],
    extlinks: [
      { url: 'https://www.melonbooks.co.jp/detail/detail.php?product_id=950001', label: 'Melonbooks', name: 'Melonbooks' },
    ],
    vns: [],
    images: [],
  };
}

beforeEach(() => {
  db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn_stock_provider_status WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn_stock_source WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn_stock_alias WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM collection WHERE vn_id = ?`).run(VN_ID);
  db.prepare(`DELETE FROM vn WHERE id = ?`).run(VN_ID);
  setAppSetting('stock_disabled_providers', null);
  setAppSetting('stock_retry_without_proxy', null);
  fetchMock.mockReset();
  releasesMock.mockReset();
  releasesMock.mockResolvedValue([]);
  runDirectMock.mockClear();
  runDirectMock.mockImplementation(<T,>(fn: () => Promise<T>) => fn());
  proxiedMock.mockReset();
  proxiedMock.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

function statusFor(provider: string) {
  return listVnStockProviderStatuses(VN_ID).find((s) => s.provider === provider);
}

describe('refreshStockForVn — VN resolution', () => {
  it('throws when the VN cannot be loaded', async () => {
    await expect(refreshStockForVn('v99990000', ['wondergoo'])).rejects.toThrow('VN not found');
  });
});

describe('refreshStockForVn — provider status branches', () => {
  it('writes an ok status with offers for a direct melonbooks hit', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    respondWith(melonbooksDetailHtml('Test Game 通常版', 3980));

    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks']);
    expect(statusFor('melonbooks')?.status).toBe('ok');
    expect(snapshot.offers.length).toBeGreaterThan(0);
    expect(snapshot.offers[0].provider).toBe('melonbooks');
  });

  it('writes no_results when the provider has inputs but parses zero offers', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    respondWith('<html><body>no products here</body></html>');

    await refreshStockForVn(VN_ID, ['melonbooks']);
    expect(statusFor('melonbooks')?.status).toBe('no_results');
  });

  it('writes skipped when the provider has no usable inputs', async () => {
    // No title-search-able VN data and no release links → no targets.
    seedVn({ title: '', alttitle: null });
    releasesMock.mockResolvedValue([]);

    await refreshStockForVn(VN_ID, ['melonbooks']);
    expect(statusFor('melonbooks')?.status).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes a protected status when the provider page is a Cloudflare challenge', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    respondWith('<title>Just a moment...</title><script>window._cf_chl_opt={}</script>');

    await refreshStockForVn(VN_ID, ['melonbooks']);
    const status = statusFor('melonbooks');
    expect(status?.status).toBe('protected');
    expect(status?.message).toMatch(/Cloudflare/i);
  });

  it('writes an error status when the provider fetch returns a non-ok HTTP status', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    respondWith('blocked', { status: 403 });

    await refreshStockForVn(VN_ID, ['melonbooks']);
    const status = statusFor('melonbooks');
    expect(status?.status).toBe('error');
    expect(status?.message).toMatch(/HTTP 403/);
  });

  it('marks Suruga-ya as partial when search cards parse', async () => {
    seedVn();
    releasesMock.mockResolvedValue([]);
    const surugayaHtml = `<p class="search_count">1-1件 / 1件</p>
      <div class="item_box">
        <p class="item_name"><a href="/product/detail/950099">てすとげーむ 通常版</a></p>
        <p class="item_kind_type">ニンテンドースイッチソフト</p>
        <div class="price_block"><p>中古：￥3,000</p></div>
      </div>`;
    respondWith(surugayaHtml);

    await refreshStockForVn(VN_ID, ['surugaya']);
    const status = statusFor('surugaya');
    expect(status?.status).toBe('partial');
    expect(status?.blocked_kind).toBe('detail_page');
  });
});

describe('refreshStockForVn — wave chunking + progress', () => {
  it('reports progress once per active provider in completion order', async () => {
    seedVn();
    releasesMock.mockResolvedValue([]);
    respondWith('<html></html>');
    const providers = ['melonbooks', 'wondergoo', 'mandarake', 'animate', 'getchu', 'gamers'] as const;

    const progress: Array<{ provider: string; done: number; total: number }> = [];
    await refreshStockForVn(VN_ID, [...providers], undefined, (provider, done, total) => {
      progress.push({ provider, done, total });
    });

    expect(progress).toHaveLength(providers.length);
    expect(progress.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress.every((p) => p.total === providers.length)).toBe(true);
    expect(new Set(progress.map((p) => p.provider))).toEqual(new Set(providers));
  });

  it('builds a title-search URL and runs the generic refresh for every search-capable provider', async () => {
    seedVn({ title: 'てすとげーむ', alttitle: 'Test Game' });
    releasesMock.mockResolvedValue([]);
    respondWith('<html><body>no products</body></html>');

    // Every provider with a TITLE_SEARCH_URLS builder + a generic parser.
    const providers = [
      'ebten', 'gamecity', 'asakusa_mach', 'amazon_jp', 'amiami', 'otakarasouko',
      'geo', 'joshin', 'neowing', 'yodobashi', 'bikkuri_takarajima',
    ] as const;

    await refreshStockForVn(VN_ID, [...providers]);

    // Each provider issued at least one search fetch and got a no_results row
    // (empty page parses to zero offers).
    for (const provider of providers) {
      expect(statusFor(provider)?.status).toBe('no_results');
    }
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(providers.length);
  });
});

describe('refreshStockForVn — disabled providers', () => {
  it('skips disabled providers entirely and reports progress against the whole input list', async () => {
    seedVn();
    releasesMock.mockResolvedValue([]);
    respondWith('<html></html>');
    setAppSetting('stock_disabled_providers', JSON.stringify(['wondergoo']));

    const progress: string[] = [];
    await refreshStockForVn(VN_ID, ['melonbooks', 'wondergoo'], undefined, (provider) => {
      progress.push(provider);
    });

    // wondergoo is disabled → no status row written for it.
    expect(statusFor('wondergoo')).toBeUndefined();
    expect(statusFor('melonbooks')).toBeDefined();
    expect(progress).toContain('melonbooks');
  });

  it('returns the cached snapshot immediately when every provider is disabled', async () => {
    seedVn();
    releasesMock.mockResolvedValue([]);
    setAppSetting('stock_disabled_providers', JSON.stringify(['melonbooks']));

    const progress: Array<{ done: number; total: number }> = [];
    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks'], undefined, (_p, done, total) => {
      progress.push({ done, total });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(progress).toEqual([{ done: 1, total: 1 }]);
    expect(snapshot.offers).toEqual([]);
  });
});

describe('refreshStockForVn — cancellation', () => {
  it('returns early and reports progress for all providers when pre-aborted', async () => {
    seedVn();
    releasesMock.mockResolvedValue([]);
    const controller = new AbortController();
    controller.abort();

    const progress: Array<{ done: number; total: number }> = [];
    await refreshStockForVn(VN_ID, ['melonbooks', 'wondergoo'], controller.signal, (_p, done, total) => {
      progress.push({ done, total });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(progress).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
    expect(statusFor('melonbooks')).toBeUndefined();
  });
});

describe('refreshStockForVn — manual source', () => {
  it('fetches a user-pinned manual stock source URL even with no release links', async () => {
    seedVn({ title: '', alttitle: null });
    releasesMock.mockResolvedValue([]);
    const manualUrl = 'https://www.wonder.co.jp/benefit/game/detail/?id=950123';
    upsertStockSource({ vn_id: VN_ID, provider: 'wondergoo', url: manualUrl });
    respondWith(wondergooDetailHtml('てすとげーむ 限定版', 5480));

    const snapshot = await refreshStockForVn(VN_ID, ['wondergoo']);
    expect(statusFor('wondergoo')?.status).toBe('ok');
    const offer = snapshot.offers.find((o) => o.provider === 'wondergoo');
    expect(offer?.url).toBe(manualUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(manualUrl);
  });
});

describe('refreshStockForVn — fetch deadline', () => {
  it('aborts a hung provider fetch at the per-request timeout and records an error', async () => {
    vi.useFakeTimers();
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    // The mock rejects only when its (inner-timeout) AbortSignal fires, so the
    // request hangs until fetchShopText's 15s timeout aborts it.
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        if (!signal) return;
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    );

    const promise = refreshStockForVn(VN_ID, ['melonbooks']);
    // Advance past the 15s per-request timeout (plus retry backoff windows).
    await vi.advanceTimersByTimeAsync(120_000);
    await promise;

    const status = statusFor('melonbooks');
    expect(status?.status).toBe('error');
    expect(status?.message).toMatch(/timeout/i);
  });
});

describe('refreshStockForVn — fetch boundaries', () => {
  it('rejects a blocked manual source before issuing a network request', async () => {
    seedVn({ title: '', alttitle: null });
    upsertStockSource({ vn_id: VN_ID, provider: 'melonbooks', url: 'https://example.test/item' });

    await refreshStockForVn(VN_ID, ['melonbooks']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(statusFor('melonbooks')?.message).toMatch(/Blocked stock URL/);
  });

  it('retries transient network failures and records the final error', async () => {
    vi.useFakeTimers();
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockRejectedValue(new Error('offline'));

    const promise = refreshStockForVn(VN_ID, ['melonbooks']);
    await vi.advanceTimersByTimeAsync(4_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(statusFor('melonbooks')?.message).toBe('offline');
  });

  it('continues after a transient network failure', async () => {
    vi.useFakeTimers();
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse(melonbooksDetailHtml('Test Game 通常版', 4100))));

    const promise = refreshStockForVn(VN_ID, ['melonbooks']);
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(statusFor('melonbooks')?.status).toBe('ok');
  });

  it('waits and retries a rate-limited response', async () => {
    vi.useFakeTimers();
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockResolvedValueOnce(htmlResponse('slow down', { status: 429, headers: { 'retry-after': '1' } }));
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse(melonbooksDetailHtml('Test Game 通常版', 4200))));

    const promise = refreshStockForVn(VN_ID, ['melonbooks']);
    await vi.advanceTimersByTimeAsync(6_000);
    await promise;

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(statusFor('melonbooks')?.status).toBe('ok');
  });

  it('records an exhausted rate limit', async () => {
    vi.useFakeTimers();
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse('slow down', { status: 429 })));

    const promise = refreshStockForVn(VN_ID, ['melonbooks']);
    await vi.advanceTimersByTimeAsync(11_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(statusFor('melonbooks')?.message).toMatch(/HTTP 429/);
  });

  it('rejects a declared oversized response', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockResolvedValue(
      htmlResponse('too large', { headers: { 'content-length': String(16 * 1024 * 1024 + 1) } }),
    );

    await refreshStockForVn(VN_ID, ['melonbooks']);

    expect(statusFor('melonbooks')?.message).toMatch(/response too large/);
  });

  it('rejects a streamed oversized response', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
          controller.close();
        },
      })),
    );

    await refreshStockForVn(VN_ID, ['melonbooks']);

    expect(statusFor('melonbooks')?.message).toMatch(/response exceeded/);
  });

  it('rejects a response without a body', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await refreshStockForVn(VN_ID, ['melonbooks']);

    expect(statusFor('melonbooks')?.message).toMatch(/empty body/);
  });

  it('falls back after decoding an empty response', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    fetchMock.mockImplementation(() => Promise.resolve(htmlResponse('')));

    await refreshStockForVn(VN_ID, ['melonbooks']);

    expect(statusFor('melonbooks')).toMatchObject({ status: 'no_results' });
  });

  it('propagates cancellation into an in-flight request', async () => {
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);
    const controller = new AbortController();
    let started!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        started();
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    );

    const promise = refreshStockForVn(VN_ID, ['melonbooks'], controller.signal);
    await fetchStarted;
    controller.abort();
    await promise;

    expect(statusFor('melonbooks')).toBeUndefined();
  });
});

describe('refreshStockForVn — direct retry fallback', () => {
  it('retries over a direct connection when the proxied attempt yields zero offers', async () => {
    proxiedMock.mockReturnValue(true);
    setAppSetting('stock_retry_without_proxy', '1');
    seedVn();
    releasesMock.mockResolvedValue([melonbooksRelease()]);

    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      // First (proxied) attempt: empty page → zero offers. Direct retry: a hit.
      return Promise.resolve(
        htmlResponse(call === 1 ? '<html><body>empty</body></html>' : melonbooksDetailHtml('Test Game 通常版', 4200)),
      );
    });

    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks']);
    expect(runDirectMock).toHaveBeenCalled();
    expect(snapshot.offers.some((o) => o.provider === 'melonbooks')).toBe(true);
  });

  it('retries over a direct connection when the proxied attempt throws', async () => {
    proxiedMock.mockReturnValue(true);
    setAppSetting('stock_retry_without_proxy', '1');
    seedVn({ title: '', alttitle: null });
    releasesMock.mockResolvedValue([melonbooksRelease()]);

    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      // First (proxied) attempt: a non-retryable 403 → throws. Direct retry: a hit.
      if (call === 1) return Promise.resolve(htmlResponse('blocked', { status: 403 }));
      return Promise.resolve(htmlResponse(melonbooksDetailHtml('Test Game 通常版', 4200)));
    });

    const snapshot = await refreshStockForVn(VN_ID, ['melonbooks']);
    expect(runDirectMock).toHaveBeenCalled();
    expect(statusFor('melonbooks')?.status).toBe('ok');
    expect(snapshot.offers.some((o) => o.provider === 'melonbooks')).toBe(true);
  });
});
