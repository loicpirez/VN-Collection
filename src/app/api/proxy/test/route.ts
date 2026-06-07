import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { providerFetch, stockProviderFetch } from '@/lib/proxy-fetch';
import {
  resolveProxyConfig,
  resolveStockProviderProxy,
  type ProviderId,
} from '@/lib/proxy-config';
import { ALICENET_PROVIDER_ID, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock-provider-constants';
import { sanitizeUnknownError } from '@/lib/error-sanitize';
import { tooManyRequests } from '@/lib/rate-limit-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROVIDER_TEST_URLS: Record<ProviderId, string> = {
  vndb: 'https://api.vndb.org/kana/schema',
  vndbmirror: 'https://api.yorhel.org/kana/schema',
  egs: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_form.php',
  alicenet: 'https://www.alice-kobe.com/html/page4.html',
  // Suruga-ya search page — a typical shop fetch that should succeed when
  // the stock proxy is healthy.
  stock: 'https://www.suruga-ya.jp/search?category=&search_word=test',
};

/**
 * Per-shop probe URL. When the user tests a per-shop proxy override we
 * hit the canonical search / homepage of THAT shop, not Suruga-ya — the
 * point is to verify the per-shop route actually reaches the host that
 * normally blocks the operator's IP. Each URL is GET-safe and returns
 * HTML quickly.
 */
const STOCK_SHOP_TEST_URLS: Record<StockProviderId, string> = {
  eroge_price: 'https://eroge-price.com/',
  sofmap: 'https://www.sofmap.com/',
  surugaya: 'https://www.suruga-ya.jp/search?category=&search_word=test',
  hgame1: 'https://www.hgame1.com/',
  melonbooks: 'https://www.melonbooks.co.jp/',
  mandarake: 'https://order.mandarake.co.jp/order/',
  wondergoo: 'https://www.wonder.co.jp/',
  trader: 'https://www.trader.co.jp/',
  animate: 'https://www.animate-onlineshop.jp/',
  ebten: 'https://store.kadokawa.co.jp/',
  getchu: 'https://www.getchu.com/',
  gamers: 'https://www.gamers.co.jp/',
  gamecity: 'https://shop.gamecity.ne.jp/',
  asakusa_mach: 'https://shopping.yahoo.co.jp/',
  amazon_jp: 'https://www.amazon.co.jp/',
  amiami: 'https://slist.amiami.jp/',
  otakarasouko: 'https://www.ec.otakarasouko.com/',
  geo: 'https://ec.geo-online.co.jp/',
  joshin: 'https://joshinweb.jp/',
  neowing: 'https://www.neowing.co.jp/',
  yodobashi: 'https://www.yodobashi.com/',
  bikkuri_takarajima: 'https://beak-takarajima.celosia.co.jp/',
};

const FIXED_PROVIDERS = new Set<string>(['vndb', 'vndbmirror', 'egs', 'stock']);
const STOCK_PROVIDERS = new Set<string>(STOCK_PROVIDER_IDS);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const limited = tooManyRequests(req, 'proxy/test', { limit: 30, windowMs: 10_000 });
  if (limited) return limited;

  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const { provider } = body;

  if (typeof provider !== 'string') {
    return NextResponse.json({ error: 'provider required' }, { status: 400 });
  }

  // Fixed-provider path (vndb, egs, …).
  if (FIXED_PROVIDERS.has(provider)) {
    const providerId = provider as ProviderId;
    const config = resolveProxyConfig(providerId);
    if (!config) {
      return NextResponse.json(
        { error: 'proxy is not configured or disabled for this provider' },
        { status: 400 },
      );
    }
    return runProbe(PROVIDER_TEST_URLS[providerId], (url, init) =>
      providerFetch(url, init, providerId),
    );
  }

  // Per-shop path. The two-tier resolver in resolveStockProviderProxy
  // means the test reports "no proxy configured" even when the generic
  // stock proxy IS set, IF the per-shop override is what the user just
  // enabled. That's the intended semantic — the user wants to verify
  // their per-shop config end-to-end.
  if (STOCK_PROVIDERS.has(provider) || provider === ALICENET_PROVIDER_ID) {
    const shopId = provider as StockProviderId | typeof ALICENET_PROVIDER_ID;
    const config = resolveStockProviderProxy(shopId);
    if (!config) {
      return NextResponse.json(
        { error: 'proxy is not configured or disabled for this provider' },
        { status: 400 },
      );
    }
    if (shopId === ALICENET_PROVIDER_ID) {
      return runProbe(PROVIDER_TEST_URLS.alicenet, (url, init) =>
        stockProviderFetch(url, init, shopId),
      );
    }
    return runProbe(STOCK_SHOP_TEST_URLS[shopId], (url, init) =>
      stockProviderFetch(url, init, shopId),
    );
  }

  return NextResponse.json(
    { error: 'unknown provider' },
    { status: 400 },
  );
}

async function runProbe(
  testUrl: string,
  doFetch: (url: string, init: RequestInit) => Promise<Response>,
): Promise<NextResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  const start = Date.now();

  try {
    const res = await doFetch(testUrl, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'vndb-collection/1.0 (proxy test)' },
    });
    const latencyMs = Date.now() - start;
    if (res.status >= 500) {
      return NextResponse.json(
        { ok: false, error: `remote returned HTTP ${res.status}`, latencyMs },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, latencyMs, status: res.status });
  } catch (e) {
    const latencyMs = Date.now() - start;
    // SocksProxyAgent / HttpsProxyAgent occasionally surface the proxy URL
    // (including userinfo) in their error messages. Sanitize so credentials
    // never land in the JSON response.
    const msg = sanitizeUnknownError(e);
    return NextResponse.json({ ok: false, error: msg, latencyMs }, { status: 200 });
  } finally {
    clearTimeout(timer);
  }
}
