import 'server-only';
import iconv from 'iconv-lite';
import { getCollectionItem, getEgsForVn, listKobeStockForVn, listStockAliases, listVnStockOffers, listVnStockProviderStatuses, replaceVnStockProviderSnapshot, upsertVn, type VnStockAvailability, type VnStockOfferInput, type VnStockOfferRow, type VnStockProviderStatusRow } from './db';
import { getReleasesForVn, getVn, type VndbRelease } from './vndb';
import { isAllowedHttpTarget } from './url-allowlist';
import { isVndbVnId } from './vn-id-shape';
import type { CollectionItem } from './types';
import { classifyOffer, classificationToFields, type ClassifyTarget } from './stock-classify';

export const STOCK_PROVIDER_IDS = [
  'eroge_price',
  'sofmap',
  'surugaya',
  'hgame1',
  'melonbooks',
  'mandarake',
  'wondergoo',
  'trader',
  'animate',
  'ebten',
  'getchu',
  'gamers',
  'gamecity',
  'asakusa_mach',
  'amazon_jp',
  'amiami',
  'otakarasouko',
  'geo',
  'joshin',
  'neowing',
  'yodobashi',
  'bikkuri_takarajima',
] as const;
export type StockProviderId = (typeof STOCK_PROVIDER_IDS)[number];

export type PhysicalStockMode =
  | 'none'
  | 'online_only'
  | 'single_shop'
  | 'store_locator_only'
  | 'phone_only'
  | 'store_name_online'
  | 'exact_online'
  | 'exact_online_possible_not_implemented'
  | 'exact_online_browser_required'
  | 'exact_cached';

export interface StockProviderMeta {
  id: StockProviderId | 'alicesoft_kobe';
  label: string;
  kind: 'direct' | 'aggregate' | 'cached';
  /** True when this provider can help with physical buying. Not necessarily confirmed exact stock. */
  physical: boolean;
  /** Describes what kind of physical stock evidence the provider can produce. */
  physicalStockMode: PhysicalStockMode;
  /** True when normal server-side fetch is likely blocked or unreliable. */
  cloudflare: boolean;
  /** Whether the current parser actually extracts branch/store-level stock. */
  branchParserImplemented: boolean;
  /** Whether this provider should appear in confirmed-physical-location results right now. */
  confirmedPhysicalUsable: boolean;
}

export interface StockOffer extends VnStockOfferRow {
  provider_label: string;
}

export interface StockSnapshot {
  offers: StockOffer[];
  statuses: VnStockProviderStatusRow[];
  providers: StockProviderMeta[];
  summary: {
    total: number;
    available: number;
    best_price: number | null;
    last_refresh: number | null;
  };
}

interface StockTarget {
  url: string;
  releaseId: string | null;
  jan: string | null;
  query?: string | null;
}

interface ParsedOffer {
  provider_offer_id: string;
  title: string;
  url: string;
  price: number | null;
  availability: VnStockAvailability;
  availability_label: string | null;
  condition: string | null;
  edition_label: string | null;
  location_label: string | null;
  location_branch?: string | null;
  source_release_id: string | null;
  jan: string | null;
  error?: string | null;
  category?: string | null;
  content_kind?: string | null;
  platform?: string | null;
  edition_kind?: string | null;
  series_relation?: string | null;
  match_confidence?: string | null;
  match_score?: number | null;
  match_warnings_json?: string | null;
  marketplace_price?: number | null;
  marketplace_count?: number | null;
  list_price?: number | null;
  store_code?: string | null;
  product_id?: string | null;
  page_kind?: string | null;
}

/** All providers with physical presence (capable). Not all produce confirmed stock data yet. */
export const PHYSICAL_CAPABLE_PROVIDER_IDS: ReadonlyArray<StockProviderId> = [
  'sofmap', 'surugaya', 'hgame1', 'mandarake', 'wondergoo', 'trader',
  'animate', 'otakarasouko', 'geo', 'joshin', 'yodobashi', 'bikkuri_takarajima',
] as const;

/** Providers whose parsers currently return confirmed per-branch stock. */
export const CONFIRMED_PHYSICAL_PROVIDER_IDS: ReadonlyArray<StockProviderId> = [
  'sofmap', 'hgame1',
] as const;

/** Providers that cannot produce confirmed physical stock information right now. */
export const USELESS_FOR_CONFIRMED_PHYSICAL_STOCK: ReadonlyArray<StockProviderId> = [
  'wondergoo', 'trader', 'otakarasouko', 'bikkuri_takarajima', 'joshin',
  'melonbooks', 'ebten', 'getchu', 'gamers', 'gamecity',
  'asakusa_mach', 'amazon_jp', 'amiami', 'neowing',
] as const;

const PROVIDERS: StockProviderMeta[] = [
  { id: 'eroge_price',        label: 'Eroge Price',        kind: 'aggregate', physical: false, physicalStockMode: 'none',                                   cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'sofmap',             label: 'Sofmap / Recole',    kind: 'direct',    physical: true,  physicalStockMode: 'exact_online',                           cloudflare: false, branchParserImplemented: true,  confirmedPhysicalUsable: true  },
  { id: 'surugaya',           label: 'Suruga-ya',          kind: 'direct',    physical: true,  physicalStockMode: 'exact_online_browser_required',          cloudflare: true,  branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'hgame1',             label: 'PC Shop Unoya',      kind: 'direct',    physical: true,  physicalStockMode: 'single_shop',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: true  },
  { id: 'melonbooks',         label: 'Melonbooks',         kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'mandarake',          label: 'Mandarake',          kind: 'direct',    physical: true,  physicalStockMode: 'store_name_online',                      cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'wondergoo',          label: 'WonderGOO',          kind: 'direct',    physical: true,  physicalStockMode: 'store_locator_only',                     cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'trader',             label: 'Trader / 秋葉原トレーダー通販', kind: 'direct', physical: true, physicalStockMode: 'phone_only', cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'animate',            label: 'Animate',            kind: 'direct',    physical: true,  physicalStockMode: 'exact_online_possible_not_implemented',  cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'ebten',              label: 'ebten',              kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'getchu',             label: 'Getchu',             kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'gamers',             label: 'Gamers',             kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'gamecity',           label: 'GAMECITY',           kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'asakusa_mach',       label: 'Yahoo Shopping',     kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'amazon_jp',          label: 'Amazon JP',          kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'amiami',             label: 'AmiAmi',             kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'otakarasouko',       label: 'Otakarasouko',       kind: 'direct',    physical: true,  physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'geo',                label: 'GEO',                kind: 'direct',    physical: true,  physicalStockMode: 'exact_online_possible_not_implemented',  cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'joshin',             label: 'Joshin',             kind: 'direct',    physical: true,  physicalStockMode: 'phone_only',                             cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'neowing',            label: 'Neowing',            kind: 'direct',    physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'yodobashi',          label: 'Yodobashi',          kind: 'direct',    physical: true,  physicalStockMode: 'exact_online_possible_not_implemented',  cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'bikkuri_takarajima', label: 'Bikkuri Takarajima', kind: 'direct',    physical: true,  physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'alicesoft_kobe',     label: 'AliceSoft Kobe',     kind: 'cached',    physical: true,  physicalStockMode: 'exact_cached',                           cloudflare: false, branchParserImplemented: true,  confirmedPhysicalUsable: true  },
];

const PROVIDER_LABELS = new Map(PROVIDERS.map((p) => [p.id, p.label]));

export function getProviderMeta(id: StockProviderId | 'alicesoft_kobe'): StockProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function canProduceConfirmedPhysicalStock(id: StockProviderId | 'alicesoft_kobe'): boolean {
  return !!getProviderMeta(id)?.confirmedPhysicalUsable;
}

export function canProducePotentialPhysicalLead(id: StockProviderId | 'alicesoft_kobe'): boolean {
  const meta = getProviderMeta(id);
  if (!meta?.physical) return false;
  const potentialModes: ReadonlyArray<PhysicalStockMode> = [
    'single_shop', 'store_locator_only', 'phone_only', 'store_name_online',
    'exact_online', 'exact_online_possible_not_implemented',
    'exact_online_browser_required', 'exact_cached',
  ];
  return potentialModes.includes(meta.physicalStockMode);
}

export function shouldShowInConfirmedPhysicalResults(
  offer: Pick<VnStockOfferRow, 'provider' | 'availability' | 'location_label'>,
): boolean {
  if (!canProduceConfirmedPhysicalStock(offer.provider as StockProviderId | 'alicesoft_kobe')) return false;
  if (offer.availability !== 'in_stock' && offer.availability !== 'limited') return false;
  return !!offer.location_label && offer.location_label !== 'Online stock';
}

export function shouldShowAsPhysicalLead(
  offer: Pick<VnStockOfferRow, 'provider' | 'availability'>,
): boolean {
  const meta = getProviderMeta(offer.provider as StockProviderId | 'alicesoft_kobe');
  if (!meta?.physical) return false;
  return offer.availability !== 'out_of_stock';
}

const SHOP_HEADERS = {
  'user-agent': 'Mozilla/5.0 VN-Collection local stock checker',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const TRADER_MOBILE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'accept-language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  referer: 'https://www.chuko-tsuhan.com/smartphone/',
};

/**
 * Encodes a string as EUC-JP percent-encoded bytes for use in chuko-tsuhan query strings.
 * The site expects EUC-JP encoded queries, not UTF-8 (encodeURIComponent).
 */
export function encodeEucJpQuery(value: string): string {
  const bytes = iconv.encode(value, 'EUC-JP');
  return Array.from(bytes as Uint8Array)
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

const PROVIDER_HOSTS: Record<StockProviderId, RegExp> = {
  eroge_price: /^eroge-price\.com$/,
  sofmap: /(^|\.)sofmap\.com$/,
  surugaya: /(^|\.)suruga-ya\.(jp|com)$/,
  hgame1: /^www\.hgame1\.com$/,
  melonbooks: /^www\.melonbooks\.co\.jp$/,
  mandarake: /(^|\.)mandarake\.co\.jp$/,
  wondergoo: /^www\.wonder\.co\.jp$/,
  trader: /(^|\.)(?:trader\.co\.jp|chuko-tsuhan\.com)$/,
  animate: /^www\.animate-onlineshop\.jp$/,
  ebten: /^store\.kadokawa\.co\.jp$/,
  getchu: /^www\.getchu\.com$/,
  gamers: /^www\.gamers\.co\.jp$/,
  gamecity: /^shop\.gamecity\.ne\.jp$/,
  asakusa_mach: /^shopping\.yahoo\.co\.jp$/,
  amazon_jp: /^www\.amazon\.co\.jp$/,
  amiami: /^www\.amiami\.jp$/,
  otakarasouko: /^www\.ec\.otakarasouko\.com$/,
  geo: /^ec\.geo-online\.co\.jp$/,
  joshin: /^joshinweb\.jp$/,
  neowing: /^www\.neowing\.co\.jp$/,
  yodobashi: /^www\.yodobashi\.com$/,
  bikkuri_takarajima: /^beak-takarajima\.celosia\.co\.jp$/,
};

const TITLE_SEARCH_URLS: Partial<Record<StockProviderId, (query: string) => string>> = {
  mandarake: (query) => `https://order.mandarake.co.jp/order/listPage/list?keyword=${encodeURIComponent(query)}`,
  animate: (query) => `https://www.animate-onlineshop.jp/products/list.php?sci=0&smt=${encodeURIComponent(query)}&ss=5&sl=40&nf=1`,
  ebten: (query) => `https://store.kadokawa.co.jp/shop/goods/search.aspx?search=x&keyword=${encodeURIComponent(query)}`,
  getchu: (query) => `https://www.getchu.com/php/nsearch.phtml?search_keyword=${encodeURIComponent(query)}&list_count=30&sort=sales&sort2=down`,
  gamers: (query) => `https://www.gamers.co.jp/products/list.php?mode=search&smt=${encodeURIComponent(query)}`,
  gamecity: (query) => `https://shop.gamecity.ne.jp/goods-search/?k=${encodeURIComponent(query)}`,
  asakusa_mach: (query) => `https://shopping.yahoo.co.jp/search/${encodeURIComponent(query)}/0/?first=1&tab_ex=commerce`,
  amazon_jp: (query) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`,
  amiami: (query) => `https://www.amiami.jp/top/search/list?s_keywords=${encodeURIComponent(query)}`,
  otakarasouko: (query) => `https://www.ec.otakarasouko.com/shop/shopbrand.html?search=&sort=order&prize1=${encodeURIComponent(query)}`,
  geo: (query) => `https://ec.geo-online.co.jp/shop/goods/search.aspx?search=x&keyword=${encodeURIComponent(query)}`,
  joshin: (query) => `https://joshinweb.jp/srhzs.html?KEYWORD=&KEY=ZS_ALL&KEY_M=ALL&QK=${encodeURIComponent(query)}&REQUEST_CODE=1`,
  neowing: (query) => `https://www.neowing.co.jp/searchuni?q=${encodeURIComponent(query)}`,
  yodobashi: (query) => `https://www.yodobashi.com/?word=${encodeURIComponent(query)}`,
  bikkuri_takarajima: (query) => `https://beak-takarajima.celosia.co.jp/shop/shopbrand.html?search=&sort=order&prize1=${encodeURIComponent(query)}`,
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS.get(provider as StockProviderId) ?? provider;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&yen;/g, 'JPY ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<br\s*\/?>/gi, ' ');
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

function absUrl(base: string, href: string): string {
  try {
    return new URL(decodeEntities(href), base).toString();
  } catch {
    return base;
  }
}

function parsePriceYen(value: string): number | null {
  const normalized = decodeEntities(value).replace(/<[^>]+>/g, ' ');
  const direct = /(?:JPY|¥|￥)\s*([\d,]+)/i.exec(normalized) ?? /([\d,]+)\s*円/.exec(normalized);
  if (!direct?.[1]) return null;
  const n = Number(direct[1].replace(/,/g, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function availabilityFromText(raw: string): VnStockAvailability {
  const text = normalizeText(raw);
  if (/売切|品切|在庫なし|完売|販売終了|out\s*of\s*stock/i.test(text)) return 'out_of_stock';
  if (/数量限定|残りわずか|残少|僅少|あと|1点|limited/i.test(text)) return 'limited';
  if (/在庫あり|在庫有|通常|十分|販売中|予約受付中|予約可能|カートに入れる|InStock/i.test(text)) return 'in_stock';
  return 'unknown';
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function fetchShopText(url: string, init: RequestInit & { encoding?: string } = {}): Promise<string> {
  if (!isAllowedHttpTarget(url)) throw new Error(`Blocked stock URL: ${sourceHost(url) || 'invalid host'}`);
  const res = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    headers: { ...SHOP_HEADERS, ...(init.headers ?? {}) },
    signal: init.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${sourceHost(url)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const charset = /charset=([^;]+)/i.exec(res.headers.get('content-type') ?? '')?.[1]?.trim();
  const encodings = [init.encoding, charset, 'utf-8', 'shift_jis', 'euc-jp'].filter(Boolean) as string[];
  let decoded = '';
  for (const enc of encodings) {
    try {
      decoded = new TextDecoder(enc).decode(buf);
      break;
    } catch {}
  }
  if (!decoded) decoded = buf.toString('utf8');
  if (/<title[^>]*>\s*Just a moment\b/i.test(decoded) || /window\._cf_chl_opt\b/.test(decoded)) {
    throw new Error('cloudflare_challenge');
  }
  return decoded;
}

function janFromRelease(release: VndbRelease): string | null {
  const raw = release.gtin?.replace(/[^\d]/g, '') ?? '';
  return raw.length === 13 || raw.length === 12 || raw.length === 8 ? raw : null;
}

function uniqTargets(targets: StockTarget[]): StockTarget[] {
  const seen = new Set<string>();
  const out: StockTarget[] = [];
  for (const target of targets) {
    const key = target.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

function titleQueries(vn: CollectionItem, extraTerms: string[] = []): string[] {
  const values = [
    vn.title,
    vn.alttitle,
    ...extraTerms,
    ...((vn.titles ?? []).flatMap((title) => [title.title, title.latin]) ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const q = value?.trim();
    if (!q || q.length < 2) continue;
    const key = q.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 5) break;
  }
  return out;
}

function releaseTargetsForProvider(releases: VndbRelease[], provider: StockProviderId, vn?: CollectionItem | null, extraTerms: string[] = []): StockTarget[] {
  const targets: StockTarget[] = [];
  for (const release of releases) {
    const jan = janFromRelease(release);
    for (const link of release.extlinks ?? []) {
      const host = sourceHost(link.url);
      if (PROVIDER_HOSTS[provider]?.test(host)) targets.push({ url: link.url, releaseId: release.id, jan });
    }
    if (jan && provider === 'sofmap') {
      targets.push({
        url: `https://a.sofmap.com/product_list_parts.aspx?product_type=USED&gid=002210010010&new_jan=${encodeURIComponent(jan)}`,
        releaseId: release.id,
        jan,
      });
    }
    if (jan && provider === 'hgame1') {
      targets.push({
        url: `https://www.hgame1.com/item/${encodeURIComponent(jan)}.html`,
        releaseId: release.id,
        jan,
      });
    }
  }
  if (vn) {
    for (const query of titleQueries(vn, extraTerms)) {
      const buildSearchUrl = TITLE_SEARCH_URLS[provider];
      if (buildSearchUrl) targets.push({ url: buildSearchUrl(query), releaseId: null, jan: null, query });
    }
  }
  return uniqTargets(targets);
}

function allTargetsForProvider(
  releases: VndbRelease[],
  provider: StockProviderId,
  vn: CollectionItem | null,
  discovered: Map<StockProviderId, StockTarget[]> = new Map(),
  extraTerms: string[] = [],
): StockTarget[] {
  return uniqTargets([
    ...releaseTargetsForProvider(releases, provider, vn, extraTerms),
    ...(discovered.get(provider) ?? []),
  ]);
}

function providerForHost(host: string): StockProviderId | null {
  for (const provider of STOCK_PROVIDER_IDS) {
    if (PROVIDER_HOSTS[provider].test(host)) return provider;
  }
  return null;
}

function officialRetailerSourceUrls(vn: CollectionItem, releases: VndbRelease[]): string[] {
  const urls = [
    ...(vn.extlinks ?? []).map((link) => link.url),
    ...releases.flatMap((release) => (release.extlinks ?? []).map((link) => link.url)),
  ];
  return [...new Set(urls)].filter((url) => {
    const host = sourceHost(url);
    return (host === 'www.entergram.co.jp' || host === 'entergram.co.jp') && isAllowedHttpTarget(url);
  });
}

async function discoverRetailerTargetsFromOfficialPages(
  vn: CollectionItem,
  releases: VndbRelease[],
  signal?: AbortSignal,
): Promise<Map<StockProviderId, StockTarget[]>> {
  const out = new Map<StockProviderId, StockTarget[]>();
  for (const sourceUrl of officialRetailerSourceUrls(vn, releases).slice(0, 3)) {
    try {
      const html = await fetchShopText(sourceUrl, { signal });
      for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
        const href = m[1];
        if (!href) continue;
        const url = absUrl(sourceUrl, href);
        const provider = providerForHost(sourceHost(url));
        if (!provider) continue;
        const list = out.get(provider) ?? [];
        list.push({ url, releaseId: null, jan: null });
        out.set(provider, list);
      }
    } catch {}
  }
  for (const [provider, targets] of out) out.set(provider, uniqTargets(targets));
  return out;
}

function offerInput(vnId: string, provider: StockProviderId, source: string, now: number, offer: ParsedOffer): VnStockOfferInput {
  return {
    vn_id: vnId,
    provider,
    provider_offer_id: offer.provider_offer_id,
    source,
    title: offer.title,
    url: offer.url,
    price: offer.price,
    currency: 'JPY',
    availability: offer.availability,
    availability_label: offer.availability_label,
    condition: offer.condition,
    edition_label: offer.edition_label,
    location_label: offer.location_label,
    location_branch: offer.location_branch ?? null,
    source_release_id: offer.source_release_id,
    jan: offer.jan,
    fetched_at: now,
    error: offer.error ?? null,
    content_kind: offer.content_kind ?? null,
    platform: offer.platform ?? null,
    edition_kind: offer.edition_kind ?? null,
    series_relation: offer.series_relation ?? null,
    match_confidence: offer.match_confidence ?? null,
    match_score: offer.match_score ?? null,
    match_warnings_json: offer.match_warnings_json ?? null,
    marketplace_price: offer.marketplace_price ?? null,
    marketplace_count: offer.marketplace_count ?? null,
    list_price: offer.list_price ?? null,
    category: offer.category ?? null,
    store_code: offer.store_code ?? null,
    product_id: offer.product_id ?? null,
    page_kind: offer.page_kind ?? null,
  };
}

function firstMatchText(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m?.[1] ? stripTags(m[1]) : null;
}

export function parseSofmapList(html: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  const listStart = html.indexOf('id="change_style_list"');
  const searchFrom = listStart === -1 ? 0 : listStart;
  const listEnd = html.indexOf('</ul>', searchFrom);
  const listHtml = listEnd === -1 ? html.slice(searchFrom) : html.slice(searchFrom, listEnd + 5);
  for (const m of listHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = m[1] ?? '';
    if (!block.includes('product_detail')) continue;
    const detailHref = /<a\s+href=["'](https?:\/\/[^"']*product_detail[^"']*sku=(\d+)[^"']*)["'][^>]*class=["']itemimg["']/i.exec(block);
    if (!detailHref?.[1] || !detailHref[2]) continue;
    const detailUrl = detailHref[1];
    const sku = detailHref[2];
    const titleHtml = /<a\s[^>]*class=["']product_name["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ?? '';
    const title = stripTags(titleHtml);
    if (!title || !targetMatchesTitle(target, title)) continue;
    const priceBlock = /<span\s+class=["']price["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? '';
    const stockCommentId = /<!--\s*stock_disp_id\s*:\s*(\w+)\s*-->/.exec(block)?.[1] ?? '';
    const stockSpan = /<span[^>]*\bstock\b[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? '';
    const stockText = stripTags(stockSpan);
    const availability: VnStockAvailability =
      /(OUT|SOLD)/i.test(stockCommentId) ? 'out_of_stock' :
      /IN_STOCK/i.test(stockCommentId) ? 'in_stock' :
      availabilityFromText(stockText);
    const storeBlock = /<dl\b[^>]*used_link[^>]*>([\s\S]*?)<\/dl>/i.exec(block)?.[1] ?? '';
    const storeAnchor = /<a\s+href=["'][^"']*tenpo[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(storeBlock)?.[1];
    const location = storeAnchor ? stripTags(storeAnchor).trim() : null;
    offers.push({
      provider_offer_id: sku,
      title,
      url: detailUrl,
      price: parsePriceYen(priceBlock),
      availability,
      availability_label: stockText || null,
      condition: /中古/.test(block) ? 'Used' : null,
      edition_label: null,
      location_label: location ?? 'Sofmap',
      location_branch: location ?? null,
      source_release_id: target.releaseId,
      jan: target.jan,
    });
  }
  return offers;
}

export function parseSofmapDetail(html: string, url: string, target: StockTarget): ParsedOffer | null {
  const title = firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || /18歳以上ですか/.test(title)) return null;
  const stockBlock = /<th>\s*在庫\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ?? '';
  const priceBlock = /<th>\s*ソフマップ特価\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ?? html;
  const sku = new URL(url).searchParams.get('sku') ?? target.jan ?? url;
  const stockText = stripTags(stockBlock);
  return {
    provider_offer_id: sku,
    title,
    url,
    price: parsePriceYen(priceBlock),
    availability: availabilityFromText(stockBlock),
    availability_label: stockText || null,
    condition: /中古/.test(html) ? 'Used' : null,
    edition_label: null,
    location_label: stockText || null,
    source_release_id: target.releaseId,
    jan: target.jan,
  };
}

function withSofmapAdultBypass(url: string): string {
  const u = new URL(url);
  u.searchParams.set('aac', 'on');
  return u.toString();
}

async function refreshSofmap(vnId: string, releases: VndbRelease[], vn: CollectionItem, discovered: Map<StockProviderId, StockTarget[]>, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  const offers: VnStockOfferInput[] = [];
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  const targets = allTargetsForProvider(releases, 'sofmap', vn, discovered, aliases);
  for (const target of targets.slice(0, 12)) {
    const url = withSofmapAdultBypass(target.url);
    const html = await fetchShopText(url, { encoding: 'shift_jis', headers: { cookie: 'UCAA=on' }, signal });
    const pathname = new URL(url).pathname.toLowerCase();
    if (/product_list_parts/i.test(pathname)) {
      for (const offer of parseSofmapList(html, target)) {
        const cl = classifyOffer(offer.title, offer.category ?? null, classifyTarget);
        offers.push(offerInput(vnId, 'sofmap', target.releaseId ? 'direct' : 'search', now, { ...offer, ...classificationToFields(cl) }));
      }
      continue;
    }
    if (/product_detail/i.test(pathname)) {
      const parsed = parseSofmapDetail(html, url, target);
      if (parsed) {
        const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
        offers.push(offerInput(vnId, 'sofmap', 'direct', now, { ...parsed, ...classificationToFields(cl) }));
      }
      continue;
    }
    const partsHref = /href=["']([^"']*product_list_parts\.aspx[^"']*)["']/i.exec(html)?.[1];
    if (partsHref) {
      try {
        const partsUrl = withSofmapAdultBypass(absUrl(url, partsHref));
        const partsHtml = await fetchShopText(partsUrl, { encoding: 'shift_jis', headers: { cookie: 'UCAA=on' }, signal });
        for (const offer of parseSofmapList(partsHtml, target)) {
          const cl = classifyOffer(offer.title, offer.category ?? null, classifyTarget);
          offers.push(offerInput(vnId, 'sofmap', target.releaseId ? 'direct' : 'search', now, { ...offer, ...classificationToFields(cl) }));
        }
      } catch {}
      continue;
    }
    const detailLinks = [...html.matchAll(/href=["']([^"']*product_detail[^"']*sku=[^"']+)["']/gi)]
      .map((m) => absUrl(url, m[1] ?? ''))
      .filter((href) => sourceHost(href).endsWith('sofmap.com'));
    for (const detailUrl of [...new Set(detailLinks)].slice(0, 5)) {
      try {
        const detailHtml = await fetchShopText(withSofmapAdultBypass(detailUrl), { encoding: 'shift_jis', headers: { cookie: 'UCAA=on' }, signal });
        const parsed = parseSofmapDetail(detailHtml, withSofmapAdultBypass(detailUrl), target);
        if (parsed) {
          const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
          offers.push(offerInput(vnId, 'sofmap', 'direct', now, { ...parsed, ...classificationToFields(cl) }));
        }
      } catch {}
    }
  }
  return offers;
}

export function parseHgame1Detail(html: string, url: string, target: StockTarget): ParsedOffer | null {
  const title = firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || /年齢確認/.test(title)) return null;
  const price = Number(/name=["']price["']\s+value=["'](\d+)["']/i.exec(html)?.[1] ?? NaN);
  const stockCode = /在庫の状況[\s\S]*?switch\(parseInt\(["'](\d+)["']\)\)/i.exec(html)?.[1] ?? null;
  const condition = firstMatchText(html, /<th>\s*商品状態\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  const availability: VnStockAvailability =
    stockCode === '1' ? 'out_of_stock' : stockCode === '2' ? 'limited' : stockCode === '3' ? 'in_stock' : availabilityFromText(html);
  const label = stockCode === '1' ? 'Sold out' : stockCode === '2' ? '1' : stockCode === '3' ? 'Several' : null;
  return {
    provider_offer_id: target.jan ?? new URL(url).pathname,
    title,
    url,
    price: Number.isInteger(price) && price > 0 ? price : parsePriceYen(html),
    availability,
    availability_label: label,
    condition,
    edition_label: null,
    location_label: 'PC Shop Unoya',
    source_release_id: target.releaseId,
    jan: target.jan,
  };
}

async function refreshHgame1(vnId: string, releases: VndbRelease[], vn: CollectionItem, discovered: Map<StockProviderId, StockTarget[]>, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  const offers: VnStockOfferInput[] = [];
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  for (const target of allTargetsForProvider(releases, 'hgame1', vn, discovered, aliases).slice(0, 20)) {
    const html = await fetchShopText(target.url, { headers: { cookie: 'age_verified=1' }, signal });
    const parsed = parseHgame1Detail(html, target.url, target);
    if (parsed) {
      const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
      offers.push(offerInput(vnId, 'hgame1', 'direct', now, { ...parsed, ...classificationToFields(cl) }));
    }
  }
  return offers;
}

export function parseMelonbooksDetail(html: string, url: string, target: StockTarget): ParsedOffer | null {
  const title = firstMatchText(html, /<h1[^>]*class=["'][^"']*page-header[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ?? firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) return null;
  const statusText = firstMatchText(html, /product-info__inventory-status__text[^>]*>([\s\S]*?)<\/span>/i);
  const productId = new URL(url).searchParams.get('product_id') ?? target.jan ?? url;
  return {
    provider_offer_id: productId,
    title,
    url,
    price: parsePriceYen(html),
    availability: availabilityFromText(statusText ?? html),
    availability_label: statusText,
    condition: null,
    edition_label: null,
    location_label: 'Online stock',
    source_release_id: target.releaseId,
    jan: target.jan,
  };
}

async function refreshMelonbooks(vnId: string, releases: VndbRelease[], vn: CollectionItem, discovered: Map<StockProviderId, StockTarget[]>, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  const offers: VnStockOfferInput[] = [];
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  for (const target of allTargetsForProvider(releases, 'melonbooks', vn, discovered, aliases).slice(0, 12)) {
    const html = await fetchShopText(target.url, { signal });
    const parsed = parseMelonbooksDetail(html, target.url, target);
    if (parsed) {
      const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
      offers.push(offerInput(vnId, 'melonbooks', 'direct', now, { ...parsed, ...classificationToFields(cl) }));
    }
  }
  return offers;
}

export function parseMandarakeDetail(html: string, url: string, target: StockTarget): ParsedOffer | null {
  const blockedTitle = firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (blockedTitle === 'MANDARAKE' && !/itemCode|価格|円|在庫|cart|price/i.test(html)) return null;
  const title =
    firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    firstMatchText(html, /itemprop=["']name["'][^>]*content=["']([^"']+)["']/i) ??
    blockedTitle;
  if (!title || title === 'MANDARAKE') return null;
  const u = new URL(url);
  const itemCode = u.searchParams.get('itemCode') ?? u.searchParams.get('itemcode') ?? target.jan ?? url;
  return {
    provider_offer_id: itemCode,
    title,
    url,
    price: parsePriceYen(html),
    availability: availabilityFromText(html),
    availability_label: null,
    condition: /中古|開封|傷み|まんだらけ/i.test(html) ? 'Used' : null,
    edition_label: null,
    location_label: 'Mandarake',
    source_release_id: target.releaseId,
    jan: target.jan,
  };
}

async function refreshMandarake(vnId: string, releases: VndbRelease[], vn: CollectionItem, discovered: Map<StockProviderId, StockTarget[]>, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  const offers: VnStockOfferInput[] = [];
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  for (const target of allTargetsForProvider(releases, 'mandarake', vn, discovered, aliases).slice(0, 8)) {
    const html = await fetchShopText(target.url, { signal });
    const links = [...html.matchAll(/href=["']([^"']*detailPage\/item\?[^"']*itemCode=[^"']+)["']/gi)]
      .map((m) => absUrl(target.url, m[1] ?? ''))
      .filter((href) => sourceHost(href) === 'order.mandarake.co.jp');
    if (links.length > 0 && !/detailPage\/item/i.test(new URL(target.url).pathname)) {
      for (const detailUrl of [...new Set(links)].slice(0, 5)) {
        const detailHtml = await fetchShopText(detailUrl, { signal });
        const parsed = parseMandarakeDetail(detailHtml, detailUrl, target);
        if (parsed) {
          const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
          offers.push(offerInput(vnId, 'mandarake', 'search', now, { ...parsed, ...classificationToFields(cl) }));
        }
      }
      continue;
    }
    const parsed = parseMandarakeDetail(html, target.url, target);
    if (parsed) {
      const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
      offers.push(offerInput(vnId, 'mandarake', 'direct', now, { ...parsed, ...classificationToFields(cl) }));
    }
  }
  return offers;
}

export function parseWondergooDetail(html: string, url: string, target: StockTarget): ParsedOffer | null {
  const title =
    firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    firstMatchText(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ??
    firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) return null;
  const id = new URL(url).searchParams.get('id') ?? target.jan ?? url;
  return {
    provider_offer_id: id,
    title,
    url,
    price: parsePriceYen(html),
    availability: 'unknown',
    availability_label: null,
    condition: null,
    edition_label: /特典|限定|limited|set|box/i.test(title + html.slice(0, 2000)) ? 'Store bonus' : null,
    location_label: 'WonderGOO',
    source_release_id: target.releaseId,
    jan: target.jan,
  };
}

async function refreshWondergoo(vnId: string, releases: VndbRelease[], vn: CollectionItem, discovered: Map<StockProviderId, StockTarget[]>, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  const offers: VnStockOfferInput[] = [];
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  for (const target of allTargetsForProvider(releases, 'wondergoo', vn, discovered, aliases).slice(0, 12)) {
    const html = await fetchShopText(target.url, { signal });
    const parsed = parseWondergooDetail(html, target.url, target);
    if (parsed) {
      const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
      offers.push(offerInput(vnId, 'wondergoo', 'direct', now, { ...parsed, ...classificationToFields(cl) }));
    }
  }
  return offers;
}


function traderEditionLabel(title: string): string | null {
  if (/グッズ|タペストリー|抱き枕|特典|単品/.test(title)) return 'Bonus item';
  if (/初回限定版|初回版/.test(title)) return 'First press';
  if (/完全生産限定版|完全限定版/.test(title)) return 'Complete limited';
  if (/限定版/.test(title)) return 'Limited edition';
  if (/豪華版|デラックス/.test(title)) return 'Deluxe edition';
  if (/パック|セット/.test(title)) return 'Bundle';
  return null;
}

/** Returns all chuko-tsuhan search query variants for a base query. */
export function traderSearchVariants(baseQuery: string): string[] {
  return [
    baseQuery,
    `${baseQuery} 店頭併売`,
    `【店頭併売】${baseQuery}`,
    `${baseQuery} 【店頭併売】`,
    `${baseQuery} 実店舗`,
    `${baseQuery} 店頭`,
    `${baseQuery} 店舗`,
    `${baseQuery} 在庫`,
    `${baseQuery} 店舗在庫`,
    `${baseQuery} 秋葉原`,
    `${baseQuery} 秋葉原トレーダー`,
    `${baseQuery} トレーダー`,
    `${baseQuery} 本店`,
    `${baseQuery} 1号店`,
    `${baseQuery} 2号店`,
    `${baseQuery} 3号店`,
  ];
}

/**
 * Parses a chuko-tsuhan smartphone list page.
 * Detects sold-out via actual `.soldout` elements only — never via raw body text.
 * Sets location_label to the online shop name; location_branch is always null
 * because per-branch stock is not available on list pages.
 */
export function parseTraderChukoSmartphoneList(
  html: string,
  baseUrl: string,
  target: StockTarget,
): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  const blocks = html.split(/<\/li\s*>/i);

  for (const rawBlock of blocks) {
    const liStart = rawBlock.lastIndexOf('<li');
    if (liStart === -1) continue;
    const block = rawBlock.slice(liStart);

    const linkMatch = /href=["']([^"']*detail\.html\?[^"']*)["']/i.exec(block);
    if (!linkMatch) continue;

    const detailUrl = absUrl(baseUrl, decodeEntities(linkMatch[1]));
    let productId: string | null = null;
    try { productId = new URL(detailUrl).searchParams.get('id'); } catch {}
    if (!productId) continue;

    const imgAlt = /<img\b[^>]+\balt=["']([^"']+)["'][^>]*>/i.exec(block)?.[1];
    const pText = /<p[^>]*>([^<]+)<\/p>/i.exec(block)?.[1];
    const title = decodeEntities((imgAlt || pText || '').trim());
    if (!title) continue;
    if (!targetMatchesTitle(target, title)) continue;

    const isSoldOut = /<p[^>]+class=["'][^"']*\bsoldout\b[^"']*["'][^>]*>/i.test(block);

    const priceEmMatch = /<p[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*><em>([\d,]+)<\/em>/i.exec(block);
    const price = priceEmMatch ? parseInt(priceEmMatch[1].replace(/,/g, ''), 10) || null : null;

    const availability: VnStockAvailability = isSoldOut
      ? 'out_of_stock'
      : price !== null
        ? 'in_stock'
        : 'unknown';

    offers.push({
      provider_offer_id: productId,
      title,
      url: detailUrl,
      price: isSoldOut ? null : price,
      availability,
      availability_label: isSoldOut ? '売り切れ' : price !== null ? '販売中' : null,
      condition: 'Used',
      edition_label: traderEditionLabel(title),
      location_label: 'Trader Online / 秋葉原トレーダー通販',
      location_branch: null,
      source_release_id: target.releaseId,
      jan: target.jan,
      product_id: productId,
      page_kind: 'detail',
    });
  }

  return offers;
}

/**
 * Parses a chuko-tsuhan smartphone detail page.
 * Strips script/style/noscript before sold-out detection to avoid false positives
 * from template text. physical_stock_confirmed is always false — location_branch
 * remains null unless a future parser can extract per-branch evidence.
 */
export function parseTraderChukoDetail(
  html: string,
  url: string,
  fallback: ParsedOffer | null = null,
): ParsedOffer | null {
  const visible = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');

  const isSoldOut =
    /<(?:p|div|span)[^>]*(?:class=["'][^"']*\bsoldout\b[^"']*["']|id=["']soldout["'])[^>]*>[^<]*売り切れ[^<]*<\/(?:p|div|span)>/i.test(visible);

  const ogTitle =
    /<meta\b[^>]+\bproperty=["']og:title["'][^>]+\bcontent=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] ??
    /<meta\b[^>]+\bcontent=["']([^"']+)["'][^>]+\bproperty=["']og:title["'][^>]*>/i.exec(html)?.[1];
  const h1Text = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(visible)?.[1];
  const pageTitleText = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = stripTags(ogTitle || h1Text || pageTitleText || '').trim() || fallback?.title || '';
  if (!title) return null;

  let price: number | null = null;

  const metaAmount =
    /<meta\b[^>]+\bproperty=["']product:price:amount["'][^>]+\bcontent=["']([\d.]+)["'][^>]*>/i.exec(html)?.[1] ??
    /<meta\b[^>]+\bcontent=["']([\d.]+)["'][^>]+\bproperty=["']product:price:amount["'][^>]*>/i.exec(html)?.[1];
  if (metaAmount) price = Math.round(parseFloat(metaAmount)) || null;

  if (!price) {
    const taxPriceHtml = /id=["']taxPrice["'][^>]*>([\s\S]*?)<\//i.exec(visible)?.[1];
    if (taxPriceHtml) price = parsePriceYen(taxPriceHtml);
  }

  if (!price) {
    const inputPrice =
      /<input\b[^>]+\bname=["']price1["'][^>]+\bvalue=["']([\d]+)["'][^>]*>/i.exec(html)?.[1] ??
      /<input\b[^>]+\bvalue=["']([\d]+)["'][^>]+\bname=["']price1["'][^>]*>/i.exec(html)?.[1] ??
      /<input\b[^>]+\bname=["']price2["'][^>]+\bvalue=["']([\d]+)["'][^>]*>/i.exec(html)?.[1] ??
      /<input\b[^>]+\bvalue=["']([\d]+)["'][^>]+\bname=["']price2["'][^>]*>/i.exec(html)?.[1];
    if (inputPrice) price = parseInt(inputPrice, 10) || null;
  }

  if (!price) {
    const priceEm = /<p\b[^>]*\bclass=["'][^"']*\bprice\b[^"']*["'][^>]*>[\s\S]*?<em>([\d,]+)<\/em>/i.exec(visible)?.[1];
    if (priceEm) price = parseInt(priceEm.replace(/,/g, ''), 10) || null;
  }

  const availability: VnStockAvailability = isSoldOut
    ? 'out_of_stock'
    : price !== null && price > 0
      ? 'in_stock'
      : fallback?.availability ?? 'unknown';

  const hasSharedStoreHint = /【店頭併売】/.test(title);

  const availability_label = isSoldOut
    ? '売り切れ'
    : price !== null
      ? hasSharedStoreHint
        ? '販売中（店頭在庫共有の可能性あり）'
        : '販売中'
      : null;

  let productId: string | null = null;
  try { productId = new URL(url).searchParams.get('id'); } catch {}

  return {
    provider_offer_id: productId ?? fallback?.provider_offer_id ?? url,
    title,
    url,
    price: isSoldOut ? null : price,
    availability,
    availability_label,
    condition: fallback?.condition ?? 'Used',
    edition_label: fallback?.edition_label ?? traderEditionLabel(title),
    location_label: 'Trader Online / 秋葉原トレーダー通販',
    location_branch: null,
    source_release_id: fallback?.source_release_id ?? null,
    jan: fallback?.jan ?? null,
    product_id: productId,
    page_kind: 'detail',
  };
}

async function refreshTrader(
  vnId: string,
  _releases: VndbRelease[],
  vn: CollectionItem,
  _discovered: Map<StockProviderId, StockTarget[]>,
  now: number,
  signal?: AbortSignal,
  aliases: string[] = [],
): Promise<VnStockOfferInput[]> {
  const queries = titleQueries(vn, aliases).slice(0, 3);
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };

  const seenProductIds = new Set<string>();
  const allListOffers: ParsedOffer[] = [];

  for (const query of queries) {
    if (signal?.aborted) break;
    for (const variant of traderSearchVariants(query).slice(0, 16)) {
      if (signal?.aborted) break;
      const searchUrl = `https://www.chuko-tsuhan.com/smartphone/list.html?search_key=${encodeEucJpQuery(variant)}`;
      try {
        const html = await fetchShopText(searchUrl, {
          encoding: 'euc-jp',
          signal,
          headers: TRADER_MOBILE_HEADERS,
        });
        const searchTarget: StockTarget = { url: searchUrl, releaseId: null, jan: null, query };
        for (const offer of parseTraderChukoSmartphoneList(html, searchUrl, searchTarget)) {
          if (seenProductIds.has(offer.provider_offer_id)) continue;
          seenProductIds.add(offer.provider_offer_id);
          allListOffers.push(offer);
        }
      } catch {}
    }
  }

  const sorted = [...allListOffers].sort((a, b) => {
    if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
    if (b.availability === 'in_stock' && a.availability !== 'in_stock') return 1;
    return 0;
  });

  const MAX_DETAIL_PAGES = 10;
  const offers: VnStockOfferInput[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (signal?.aborted) break;
    const listOffer = sorted[i];
    let finalOffer = listOffer;
    let source = 'search';

    if (i < MAX_DETAIL_PAGES) {
      try {
        const html = await fetchShopText(listOffer.url, {
          encoding: 'euc-jp',
          signal,
          headers: TRADER_MOBILE_HEADERS,
        });
        const detailed = parseTraderChukoDetail(html, listOffer.url, listOffer);
        if (detailed) { finalOffer = detailed; source = 'direct'; }
      } catch {}
    }

    const cl = classifyOffer(finalOffer.title, finalOffer.category ?? null, classifyTarget);
    offers.push(offerInput(vnId, 'trader', source, now, { ...finalOffer, ...classificationToFields(cl) }));
  }

  return offers;
}

function targetIdFromUrl(url: string): string {
  const u = new URL(url);
  const key =
    u.searchParams.get('itemCode') ??
    u.searchParams.get('product_id') ??
    u.searchParams.get('id') ??
    u.searchParams.get('keyword') ??
    u.searchParams.get('smt') ??
    u.searchParams.get('q') ??
    u.searchParams.get('word') ??
    u.searchParams.get('QK');
  return key ? `${u.hostname}:${key}` : `${u.hostname}:${u.pathname}:${u.search}`;
}

function genericTitle(html: string): string | null {
  return (
    firstMatchText(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ??
    firstMatchText(html, /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i) ??
    firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  );
}

function normalizeComparable(value: string): string {
  return stripTags(value)
    .toLocaleLowerCase()
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function targetMatchesTitle(target: StockTarget, title: string): boolean {
  const query = target.query?.trim();
  if (!query) return true;
  const normalizedQuery = normalizeComparable(query);
  const normalizedTitle = normalizeComparable(title);
  return normalizedQuery.length < 2 || normalizedTitle.includes(normalizedQuery);
}

function parsePriceFromBlock(block: string): number | null {
  return parsePriceYen(stripTags(block));
}

function offerFromListBlock(
  provider: StockProviderId,
  url: string,
  target: StockTarget,
  rawHref: string,
  rawTitle: string,
  priceBlock: string,
  stockBlock: string,
  options: { condition?: string | null; location?: string | null; edition?: string | null } = {},
): ParsedOffer | null {
  const title = stripTags(rawTitle);
  if (!title || !targetMatchesTitle(target, title)) return null;
  const offerUrl = absUrl(url, rawHref);
  const stockText = stripTags(stockBlock);
  return {
    provider_offer_id: targetIdFromUrl(offerUrl),
    title,
    url: offerUrl,
    price: parsePriceFromBlock(priceBlock),
    availability: availabilityFromText(stockBlock || priceBlock) === 'unknown' && priceBlock ? 'in_stock' : availabilityFromText(stockBlock || priceBlock),
    availability_label: stockText || null,
    condition: options.condition ?? null,
    edition_label: options.edition ?? (/特典|限定|初回|DX|BOX/i.test(title) ? 'Edition / bonus' : null),
    location_label: options.location ?? providerLabel(provider),
    source_release_id: target.releaseId,
    jan: target.jan,
  };
}

function parseAnimateList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<li>\s*<div class=["']item_list_class["'][\s\S]*?<\/li>/gi)) {
    const block = m[0] ?? '';
    const a = /<h3>\s*<a\s+href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/i.exec(block);
    const price = /<p class=["']price["'][^>]*>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? '';
    const stock = /<p class=["']stock["'][^>]*>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? '';
    if (!a?.[1] || !a[2]) continue;
    const offer = offerFromListBlock('animate', url, target, a[1], a[2], price, stock, { location: 'Animate' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseEbtenList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<dl class=["']block-thumbnail-t--goods[\s\S]*?<\/dl>/gi)) {
    const block = m[0] ?? '';
    const a = /<a\s+href=["']([^"']+)["'][^>]*class=["']js-enhanced-ecommerce-goods-name["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const price = /<div class=["'][^"']*js-enhanced-ecommerce-goods-price[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? '';
    const stock = /<span class=["']stock["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? '';
    if (!a?.[1] || !a[2]) continue;
    const offer = offerFromListBlock('ebten', url, target, a[1], a[2], price, stock, { location: 'ebten' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseGetchuList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<li>\s*<div class=["']content_block["'][\s\S]*?<\/li>/gi)) {
    const block = m[0] ?? '';
    const a = /<A\s+HREF=["']?([^"'\s>]+)["']?[^>]*class=["']blueb["'][^>]*>([\s\S]*?)<\/A>/i.exec(block);
    const price = /特典付き価格[\s\S]*?<SPAN class=["']redb["'][^>]*>([\s\S]*?)<\/SPAN>/i.exec(block)?.[1] ?? /<SPAN class=["']redb["'][^>]*>([\s\S]*?)<\/SPAN>/i.exec(block)?.[1] ?? '';
    const stock = block.includes('<!--予約-->') ? '予約受付中' : block;
    if (!a?.[1] || !a[2]) continue;
    const offer = offerFromListBlock('getchu', url, target, a[1], a[2], price, stock, { location: 'Getchu' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseGamersList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<li class=["']list_product["'][\s\S]*?<\/li>/gi)) {
    const block = m[0] ?? '';
    const href = /<a\s+href=["']([^"']+)["']/i.exec(block)?.[1];
    const title = /<h3 class=["'][^"']*item_list_ttl[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i.exec(block)?.[1];
    const price = /<p class=["']price["'][^>]*>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? '';
    const stock = /<p class=["']sell["'][^>]*>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? '';
    if (!href || !title) continue;
    const offer = offerFromListBlock('gamers', url, target, href, title, price, stock, { location: 'Gamers' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseGeoList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<li>\s*<a class=["']sendDatalayer["'][\s\S]*?<\/li>/gi)) {
    const block = m[0] ?? '';
    const href = /<a class=["']sendDatalayer["']\s+href=["']([^"']+)["']/i.exec(block)?.[1];
    const title = /<h3 class=["']itemName["'][^>]*>([\s\S]*?)<\/h3>/i.exec(block)?.[1];
    const price = /<div class=["']sellPtnLeftPrice["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? '';
    const stock = /<span class=["'][^"']*labelNow[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? '';
    const condition = /<span class=["'][^"']*labelSituation[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? null;
    if (!href || !title) continue;
    const offer = offerFromListBlock('geo', url, target, href, title, price, stock, { condition: condition ? stripTags(condition) : null, location: 'GEO' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseYodobashiList(provider: 'yodobashi', html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<div[^>]+class=["'][^"']*productListTile[^"']*["'][\s\S]*?<!-- \/pListBlock -->/gi)) {
    const block = m[0] ?? '';
    const href = /<a[^>]+href=["']([^"']+)["'][\s\S]*?<div class=["']pName[^"']*["'][^>]*>([\s\S]*?)<\/div><\/a>/i.exec(block);
    const price = /<span class=["']productPrice["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? '';
    const stock = /<span class=["'](?:green|red)["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? /<div class=["'](?:soldout|yoyaku)["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? '';
    if (!href?.[1] || !href[2]) continue;
    const offer = offerFromListBlock(provider, url, target, href[1], href[2], price, stock, { location: providerLabel(provider) });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseJoshinList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const starts = [...html.matchAll(/<div class=["']search_container_name["']>/gi)];
  const offers: ParsedOffer[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    if (start?.index == null) continue;
    const end = starts[i + 1]?.index ?? html.length;
    const block = html.slice(start.index, end);
    const a = /<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!a?.[1] || !a[2]) continue;
    const price = /<div class=["']search_container_price["'][\s\S]*?<div class=["']price["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? '';
    const stock = /<div class=["']search_container_stock["'][^>]*>([\s\S]*?)<\/div><div class=["']search_container_review["']/i.exec(block)?.[1] ?? '';
    const offer = offerFromListBlock('joshin', url, target, a[1], a[2], price, stock, { location: 'Joshin' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseAmazonList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const starts = [...html.matchAll(/<div role=["']listitem["'][^>]+data-asin=["']([A-Z0-9]{10})["'][^>]+data-component-type=["']s-search-result["']/gi)];
  const offers: ParsedOffer[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const asin = start?.[1];
    if (!asin || start.index == null) continue;
    const end = starts[i + 1]?.index ?? html.length;
    const block = html.slice(start.index, end);
    const title = /<h2[^>]*aria-label=["']([^"']+)["'][\s\S]*?<\/h2>/i.exec(block)?.[1] ?? /<h2[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i.exec(block)?.[1];
    const href = /<a[^>]+href=["']([^"']*\/dp\/[A-Z0-9]{10}[^"']*)["']/i.exec(block)?.[1] ?? `/dp/${asin}`;
    const price = /<span class=["']a-offscreen["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? '';
    const stock = /発売予定|予約|無料配送/.test(block) ? '予約受付中' : block;
    if (!title) continue;
    const offer = offerFromListBlock('amazon_jp', url, target, href, title, price, stock, { location: 'Amazon JP' });
    if (offer) offers.push({ ...offer, provider_offer_id: asin });
  }
  return offers;
}

function parseYahooList(html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<a\s+href=["']([^"']+)["'][^>]+data-beacon=["']([^"']*?tname:[^"']+?)["'][^>]*>[\s\S]*?<span class=["'][^"']*ItemTitle[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<span class=["'][^"']*ItemPrice_ItemPrice[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)) {
    const href = m[1] ?? '';
    const beacon = decodeEntities(m[2] ?? '');
    const title = m[3] ?? /(?:^|;)tname:([^;]+)/.exec(beacon)?.[1] ?? '';
    const beaconPrice = /(?:^|;)prc:(\d+)/.exec(beacon)?.[1];
    const price = beaconPrice ? `${beaconPrice}円` : (m[4] ?? '');
    const stock = /text:([^;]+)/.exec(beacon)?.[1] ?? (/予約/.test(m[0] ?? '') ? '予約' : '');
    const offer = offerFromListBlock('asakusa_mach', url, target, href, title, price, stock, { location: 'Yahoo Shopping' });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseMakeshopList(provider: StockProviderId, html: string, url: string, target: StockTarget): ParsedOffer[] {
  const offers: ParsedOffer[] = [];
  for (const m of html.matchAll(/<li>\s*<div class=["']innerBox["'][\s\S]*?<p class=["']name["']>\s*<a href=([^>\s]+)[^>]*>([\s\S]*?)<\/a><\/p>[\s\S]*?<p class=["']price["']>\s*([\s\S]*?)<\/p>[\s\S]*?<\/div>\s*<\/li>/gi)) {
    const href = (m[1] ?? '').replace(/^["']|["']$/g, '');
    const offer = offerFromListBlock(provider, url, target, href, m[2] ?? '', m[3] ?? '', m[0] ?? '', { location: providerLabel(provider) });
    if (offer) offers.push(offer);
  }
  return offers;
}

function parseKnownProviderList(provider: StockProviderId, html: string, url: string, target: StockTarget): ParsedOffer[] {
  if (provider === 'animate') return parseAnimateList(html, url, target);
  if (provider === 'ebten') return parseEbtenList(html, url, target);
  if (provider === 'getchu') return parseGetchuList(html, url, target);
  if (provider === 'gamers') return parseGamersList(html, url, target);
  if (provider === 'geo') return parseGeoList(html, url, target);
  if (provider === 'joshin') return parseJoshinList(html, url, target);
  if (provider === 'yodobashi') return parseYodobashiList(provider, html, url, target);
  if (provider === 'amazon_jp') return parseAmazonList(html, url, target);
  if (provider === 'asakusa_mach') return parseYahooList(html, url, target);
  if (provider === 'otakarasouko' || provider === 'bikkuri_takarajima') return parseMakeshopList(provider, html, url, target);
  return [];
}

function providerListPatterns(provider: StockProviderId): RegExp[] {
  if (provider === 'animate') {
    return [/<li[^>]*class=["'][^"']*item[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][\s\S]*?(?:alt|title)=["']([^"']+)["'][\s\S]*?(?:price|価格|税込)([\s\S]{0,300}?円)/gi];
  }
  if (provider === 'gamers') {
    return [/<li[^>]*class=["'][^"']*item[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][\s\S]*?<[^>]*(?:class=["'][^"']*name|title)[^>]*>([\s\S]*?)<\/[^>]+>[\s\S]*?([\d,]+\s*円)/gi];
  }
  if (provider === 'amazon_jp') {
    return [/<div[^>]+data-asin=["']([^"']+)["'][\s\S]*?<h2[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?(?:¥|￥)\s*([\d,]+)/gi];
  }
  if (provider === 'yodobashi') {
    return [/<div[^>]*class=["'][^"']*productListTile[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?([\d,]+\s*円)/gi];
  }
  return [];
}

export function parseGenericProviderPage(provider: StockProviderId, html: string, url: string, target: StockTarget): ParsedOffer[] {
  const knownOffers = parseKnownProviderList(provider, html, url, target);
  if (knownOffers.length > 0) return knownOffers;
  const offers: ParsedOffer[] = [];
  for (const pattern of providerListPatterns(provider)) {
    for (const m of html.matchAll(pattern)) {
      const rawHref = m[1] ?? '';
      const title = stripTags(m[2] ?? '');
      const priceText = stripTags(m[3] ?? '');
      if (!title || !targetMatchesTitle(target, title)) continue;
      const offerUrl = provider === 'amazon_jp' && /^[A-Z0-9]{10}$/.test(rawHref)
        ? `https://www.amazon.co.jp/dp/${rawHref}`
        : absUrl(url, rawHref);
      offers.push({
        provider_offer_id: targetIdFromUrl(offerUrl),
        title,
        url: offerUrl,
        price: parsePriceYen(priceText),
        availability: availabilityFromText(m[0] ?? '') === 'out_of_stock' ? 'out_of_stock' : availabilityFromText(m[0] ?? '') === 'unknown' ? 'unknown' : 'in_stock',
        availability_label: null,
        condition: null,
        edition_label: /特典|限定|初回|DX|BOX/i.test(title) ? 'Edition / bonus' : null,
        location_label: providerLabel(provider),
        source_release_id: target.releaseId,
        jan: target.jan,
      });
    }
  }
  if (offers.length > 0) return offers;
  const title = genericTitle(html);
  if (!title || /captcha|access denied|just a moment/i.test(title)) return [];
  const price = parsePriceYen(html);
  if (price == null && target.releaseId == null) return [];
  if (!targetMatchesTitle(target, title)) return [];
  const rawAvailability = availabilityFromText(html);
  offers.push({
    provider_offer_id: targetIdFromUrl(url),
    title,
    url,
    price,
    availability: price == null && rawAvailability === 'out_of_stock' ? 'unknown' : rawAvailability,
    availability_label: null,
    condition: /中古|used/i.test(html) ? 'Used' : null,
    edition_label: /特典|限定|初回|DX|BOX/i.test(title + html.slice(0, 2000)) ? 'Edition / bonus' : null,
    location_label: providerLabel(provider),
    source_release_id: target.releaseId,
    jan: target.jan,
  });
  return offers;
}

function providerEncoding(provider: StockProviderId): string | undefined {
  if (provider === 'trader' || provider === 'getchu') return 'euc-jp';
  if (provider === 'sofmap') return 'shift_jis';
  return undefined;
}

async function refreshGenericProvider(provider: StockProviderId, vnId: string, releases: VndbRelease[], vn: CollectionItem, discovered: Map<StockProviderId, StockTarget[]>, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  const offers: VnStockOfferInput[] = [];
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  for (const target of allTargetsForProvider(releases, provider, vn, discovered, aliases).slice(0, 8)) {
    const html = await fetchShopText(target.url, { encoding: providerEncoding(provider), signal });
    for (const parsed of parseGenericProviderPage(provider, html, target.url, target).slice(0, 10)) {
      const cl = classifyOffer(parsed.title, parsed.category ?? null, classifyTarget);
      offers.push(offerInput(vnId, provider, target.releaseId ? 'direct' : 'search', now, { ...parsed, ...classificationToFields(cl) }));
    }
  }
  return offers;
}

function parseJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = decodeEntities(m[1] ?? '').replace(/,\s*([}\]])/g, '$1').trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch {}
  }
  return blocks;
}

function collectOffers(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(collectOffers);
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  const direct = type === 'Offer' || (Array.isArray(type) && type.includes('Offer')) ? [obj] : [];
  const nested = collectOffers(obj.offers);
  return [...direct, ...nested];
}

function sellerName(offer: Record<string, unknown>): string | null {
  const seller = offer.seller;
  if (seller && typeof seller === 'object' && !Array.isArray(seller)) {
    const name = (seller as Record<string, unknown>).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

function availabilityFromSchema(value: unknown): VnStockAvailability {
  if (typeof value !== 'string') return 'unknown';
  if (/OutOfStock|SoldOut|Discontinued/i.test(value)) return 'out_of_stock';
  if (/LimitedAvailability/i.test(value)) return 'limited';
  if (/InStock|PreOrder|PreSale/i.test(value)) return 'in_stock';
  return 'unknown';
}

export function parseErogePrice(html: string, url: string, vnId: string, now: number): VnStockOfferInput[] {
  const title = firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? 'Eroge Price';
  const offers: VnStockOfferInput[] = [];
  for (const block of parseJsonLd(html)) {
    for (const offer of collectOffers(block)) {
      const rawPrice = offer.price;
      const price = typeof rawPrice === 'number' ? rawPrice : typeof rawPrice === 'string' ? Number(rawPrice.replace(/[^\d]/g, '')) : NaN;
      const seller = sellerName(offer);
      const offerUrl = typeof offer.url === 'string' ? offer.url : url;
      offers.push(offerInput(vnId, 'eroge_price', 'search', now, {
        provider_offer_id: `${seller ?? 'offer'}:${offerUrl}`,
        title,
        url: offerUrl,
        price: Number.isInteger(price) && price > 0 ? price : null,
        availability: availabilityFromSchema(offer.availability),
        availability_label: seller,
        condition: null,
        edition_label: null,
        location_label: seller,
        source_release_id: null,
        jan: null,
      }));
    }
  }
  for (const m of html.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const seller = stripTags(m[1] ?? '');
    const edition = stripTags(m[2] ?? '');
    const priceText = stripTags(m[3] ?? '');
    const condition = stripTags(m[4] ?? '');
    if (!seller || !priceText) continue;
    const key = `${seller}:${edition}:${priceText}:${condition}`;
    if (offers.some((offer) => offer.provider_offer_id === key)) continue;
    offers.push(offerInput(vnId, 'eroge_price', 'search', now, {
      provider_offer_id: key,
      title,
      url,
      price: parsePriceYen(priceText),
      availability: availabilityFromText(condition || seller),
      availability_label: seller,
      condition: condition || null,
      edition_label: edition || null,
      location_label: seller,
      source_release_id: null,
      jan: null,
    }));
  }
  return offers;
}

async function refreshErogePrice(vnId: string, egsId: number | null | undefined, vn: CollectionItem, now: number, signal?: AbortSignal, aliases: string[] = []): Promise<VnStockOfferInput[]> {
  if (!egsId) return [];
  const url = `https://eroge-price.com/games/${egsId}`;
  const html = await fetchShopText(url, { signal });
  const raw = parseErogePrice(html, url, vnId, now);
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };
  return raw.map((offer) => {
    const cl = classifyOffer(offer.title, null, classifyTarget);
    return { ...offer, ...classificationToFields(cl) };
  });
}

/** Build a Suruga-ya search URL using URLSearchParams. Never uses raw & concatenation. */
export function buildSurugayaSearchUrl(query: string, page?: number): string {
  const url = new URL('https://www.suruga-ya.jp/search');
  url.searchParams.set('category', '');
  url.searchParams.set('search_word', query);
  url.searchParams.set('rankBy', 'relavancy(int)');
  if (page && page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export interface SurugayaSearchCard {
  productId: string;
  pageKind: 'detail' | 'other';
  title: string;
  url: string;
  category: string | null;
  condition: string | null;
  listPrice: number | null;
  primaryPrice: number | null;
  officialAvailability: 'in_stock' | 'out_of_stock' | 'unknown';
  marketplacePrice: number | null;
  marketplaceCount: number | null;
  storeCode: string | null;
  branchNumber: string | null;
  imageUrl: string | null;
  badges: string[];
}

export interface SurugayaSearchResult {
  cards: SurugayaSearchCard[];
  pagination: { start: number; end: number; total: number } | null;
}

/**
 * Parse a Suruga-ya /search result page into structured cards.
 * Pure HTML parsing — no I/O.
 *
 * Cloudflare classification rule: only throw if actual challenge page.
 * Normal Cloudflare-served search pages with real content are parseable.
 */
export function parseSurugayaSearch(html: string): SurugayaSearchResult {
  const pagination = (() => {
    const m = /([\d,]+)\s*[-–]\s*([\d,]+)\s*件?\s*[/／]\s*([\d,]+)\s*件/.exec(html);
    return m
      ? {
          start: parseInt(m[1].replace(/,/g, ''), 10),
          end: parseInt(m[2].replace(/,/g, ''), 10),
          total: parseInt(m[3].replace(/,/g, ''), 10),
        }
      : null;
  })();

  const shippingStripped = html
    .replace(/送料[^<]{0,80}(?:未満|以上)[^<]{0,60}/g, '')
    .replace(/配送[^<]{0,60}(?:無料|有料)[^<]{0,60}/g, '');

  // Pass 1: collect each unique product's first link position and metadata
  interface _ProductLink { pos: number; pageKind: 'detail' | 'other'; productId: string; queryStr: string }
  const productUrlRe = /href=["'](\/product\/(detail|other)\/(\d+)([^"'#]*))["']/gi;
  const uniqueLinks: _ProductLink[] = [];
  const seenIds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = productUrlRe.exec(shippingStripped)) !== null) {
    const pid = m[3];
    if (!seenIds.has(pid)) {
      seenIds.add(pid);
      uniqueLinks.push({ pos: m.index, pageKind: m[2] as 'detail' | 'other', productId: pid, queryStr: m[4] ?? '' });
    }
  }

  const cards: SurugayaSearchCard[] = [];

  for (let li = 0; li < uniqueLinks.length; li++) {
    const { pos, pageKind, productId, queryStr } = uniqueLinks[li];

    const productUrl = `https://www.suruga-ya.jp/product/${pageKind}/${productId}`;

    let storeCode: string | null = null;
    let branchNumber: string | null = null;
    try {
      const qs = new URLSearchParams(queryStr.replace(/^[?&]/, ''));
      storeCode = qs.get('tenpo_cd');
      branchNumber = qs.get('branch_number');
    } catch {}

    // Bound context: start at the link position (content comes after it), forward to next card's start.
    // Do NOT look backward past a previous card — that causes availability/price bleeding.
    const ctxStart = pos;
    const ctxEnd = li + 1 < uniqueLinks.length
      ? uniqueLinks[li + 1].pos
      : Math.min(shippingStripped.length, pos + 2500);
    const ctx = shippingStripped.slice(ctxStart, ctxEnd);
    const linkIdx = pos;

    const titleRe = new RegExp(
      `href=["'][^"']*\\/product\\/(?:detail|other)\\/${productId}[^"']*["'][^>]*>\\s*([^<]{3,}?)\\s*<`,
      'i',
    );
    const titleMatch = titleRe.exec(ctx);
    let title = titleMatch ? normalizeText(decodeEntities(titleMatch[1])) : '';
    if (!title) {
      const anyAnchor = /<a\b[^>]*>\s*([^<]{3,}?)\s*<\/a>/i.exec(ctx);
      if (anyAnchor) title = normalizeText(decodeEntities(anyAnchor[1]));
    }
    if (!title) continue;

    const catPatterns: RegExp[] = [
      /class=["'][^"']*item_kind[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div|li)/i,
      /class=["'][^"']*product_kind[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div|li)/i,
      /class=["'][^"']*kind_type[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div|li)/i,
      /class=["'][^"']*category[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div|li)/i,
    ];
    let category: string | null = null;
    for (const re of catPatterns) {
      const cm = re.exec(ctx);
      if (cm) { category = stripTags(cm[1]).trim() || null; break; }
    }

    const listPriceMatch = /定価[：:]\s*[￥¥]?([\d,]+)/.exec(ctx);
    const listPrice = listPriceMatch ? parseInt(listPriceMatch[1].replace(/,/g, ''), 10) : null;

    const usedMatch = /中古[：:]\s*[￥¥]([\d,]+)/.exec(ctx);
    const newMatch = /新品[：:]\s*[￥¥]([\d,]+)/.exec(ctx);
    const rawPrimaryPrice = usedMatch
      ? parseInt(usedMatch[1].replace(/,/g, ''), 10)
      : newMatch
        ? parseInt(newMatch[1].replace(/,/g, ''), 10)
        : null;

    const mktMatch = /マケプレ\s*[￥¥]([\d,]+)/.exec(ctx);
    const rawMktPrice = mktMatch ? parseInt(mktMatch[1].replace(/,/g, ''), 10) : null;

    const mktCountMatch = /(\d+)\s*点の中古品/.exec(ctx);
    const marketplaceCount = mktCountMatch ? parseInt(mktCountMatch[1], 10) : null;

    let officialAvailability: 'in_stock' | 'out_of_stock' | 'unknown' = 'unknown';
    if (/品切れ/.test(ctx)) officialAvailability = 'out_of_stock';
    else if (rawPrimaryPrice !== null && rawPrimaryPrice > 0) officialAvailability = 'in_stock';
    else if (/在庫あり|入荷中/.test(ctx)) officialAvailability = 'in_stock';

    let condition: string | null = null;
    if (/ランクB/.test(ctx)) condition = 'Used (Rank B)';
    else if (/中古/.test(ctx)) condition = 'Used';
    else if (/新品/.test(ctx)) condition = 'New';

    const imgMatch = /https?:\/\/shinaban[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/i.exec(ctx);
    const imageUrl = imgMatch ? imgMatch[0] : null;

    const badges: string[] = [];
    if (/新入荷/.test(ctx)) badges.push('新入荷');
    if (/値下げ/.test(ctx)) badges.push('値下げ');
    if (/予約/.test(ctx)) badges.push('予約');

    const primaryPrice = rawPrimaryPrice !== null && rawPrimaryPrice > 0 ? rawPrimaryPrice : null;
    const marketplacePrice = rawMktPrice !== null && rawMktPrice > 0 ? rawMktPrice : null;

    cards.push({
      productId,
      pageKind,
      title,
      url: productUrl,
      category,
      condition,
      listPrice: listPrice !== null && listPrice > 0 ? listPrice : null,
      primaryPrice,
      officialAvailability,
      marketplacePrice,
      marketplaceCount: marketplaceCount ?? null,
      storeCode,
      branchNumber,
      imageUrl,
      badges,
    });
  }

  return { cards, pagination };
}

function surugayaCardToOffer(card: SurugayaSearchCard, classifyTarget: ClassifyTarget): ParsedOffer {
  const availability: VnStockAvailability =
    card.officialAvailability === 'in_stock' ? 'in_stock' :
    card.officialAvailability === 'out_of_stock' ? 'out_of_stock' :
    'unknown';

  const price = card.primaryPrice ?? card.marketplacePrice;

  let availLabel: string | null = null;
  if (card.officialAvailability === 'out_of_stock' && card.marketplacePrice !== null) {
    availLabel = `Marketplace: ¥${card.marketplacePrice.toLocaleString('ja-JP')}`;
  }

  const cl = classifyOffer(card.title, card.category, classifyTarget);
  const clFields = classificationToFields(cl);

  const storeLabel = card.storeCode ? `Store ${card.storeCode}` : null;

  return {
    provider_offer_id: card.productId,
    product_id: card.productId,
    page_kind: card.pageKind,
    title: card.title,
    url: card.url,
    price: price ?? null,
    availability,
    availability_label: availLabel,
    condition: card.condition,
    edition_label: null,
    location_label: storeLabel ?? 'Suruga-ya',
    location_branch: storeLabel,
    source_release_id: null,
    jan: null,
    store_code: card.storeCode,
    list_price: card.listPrice,
    marketplace_price: card.marketplacePrice,
    marketplace_count: card.marketplaceCount,
    category: card.category,
    ...clFields,
  };
}

async function refreshSurugaya(
  vnId: string,
  _releases: VndbRelease[],
  vn: CollectionItem,
  _discovered: Map<StockProviderId, StockTarget[]>,
  now: number,
  signal?: AbortSignal,
  aliases: string[] = [],
): Promise<VnStockOfferInput[]> {
  const queries = titleQueries(vn, aliases).slice(0, 3);
  const classifyTarget: ClassifyTarget = {
    title: vn.title ?? '',
    altTitles: [vn.alttitle].filter((v): v is string => typeof v === 'string' && v.length > 0),
    aliases,
  };

  const allCards: SurugayaSearchCard[] = [];
  const seen = new Set<string>();
  const MAX_PAGES = 3;

  for (const query of queries) {
    if (signal?.aborted) break;
    const url1 = buildSurugayaSearchUrl(query);
    const html1 = await fetchShopText(url1, { signal });
    const { cards: cards1, pagination } = parseSurugayaSearch(html1);
    for (const c of cards1) {
      if (!seen.has(c.productId)) { seen.add(c.productId); allCards.push(c); }
    }

    let page = 2;
    const total = pagination?.total ?? 0;
    while (!signal?.aborted && page <= MAX_PAGES && (page - 1) * 24 < total) {
      try {
        const htmlN = await fetchShopText(buildSurugayaSearchUrl(query, page), { signal });
        const { cards: cardsN } = parseSurugayaSearch(htmlN);
        for (const c of cardsN) {
          if (!seen.has(c.productId)) { seen.add(c.productId); allCards.push(c); }
        }
      } catch {}
      page++;
    }
  }

  return allCards.map((card) =>
    offerInput(vnId, 'surugaya', 'search', now, surugayaCardToOffer(card, classifyTarget)),
  );
}

async function loadVnForStock(vnId: string): Promise<CollectionItem | null> {
  const cached = getCollectionItem(vnId);
  if (cached || !isVndbVnId(vnId)) return cached;
  const fresh = await getVn(vnId);
  if (!fresh) return null;
  upsertVn(fresh);
  return getCollectionItem(vnId);
}

async function refreshProvider(
  provider: StockProviderId,
  vnId: string,
  releases: VndbRelease[],
  vn: CollectionItem,
  discovered: Map<StockProviderId, StockTarget[]>,
  egsId: number | null | undefined,
  now: number,
  signal?: AbortSignal,
  aliases: string[] = [],
): Promise<VnStockOfferInput[]> {
  if (provider === 'eroge_price') return refreshErogePrice(vnId, egsId, vn, now, signal, aliases);
  if (provider === 'sofmap') return refreshSofmap(vnId, releases, vn, discovered, now, signal, aliases);
  if (provider === 'hgame1') return refreshHgame1(vnId, releases, vn, discovered, now, signal, aliases);
  if (provider === 'melonbooks') return refreshMelonbooks(vnId, releases, vn, discovered, now, signal, aliases);
  if (provider === 'surugaya') return refreshSurugaya(vnId, releases, vn, discovered, now, signal, aliases);
  if (provider === 'mandarake') return refreshMandarake(vnId, releases, vn, discovered, now, signal, aliases);
  if (provider === 'wondergoo') return refreshWondergoo(vnId, releases, vn, discovered, now, signal, aliases);
  if (provider === 'trader') return refreshTrader(vnId, releases, vn, discovered, now, signal, aliases);
  return refreshGenericProvider(provider, vnId, releases, vn, discovered, now, signal, aliases);
}

export async function refreshStockForVn(vnId: string, providers: StockProviderId[] = [...STOCK_PROVIDER_IDS], signal?: AbortSignal): Promise<StockSnapshot> {
  const vn = await loadVnForStock(vnId);
  if (!vn) throw new Error(`VN not found: ${vnId}`);
  const aliases = listStockAliases(vnId).map((a) => a.alias_term);
  const releases = isVndbVnId(vnId) ? await getReleasesForVn(vnId, 100) : [];
  const egsId = getEgsForVn(vnId)?.egs_id ?? null;
  const discovered = await discoverRetailerTargetsFromOfficialPages(vn, releases, signal);
  for (const provider of providers) {
    const now = Date.now();
    try {
      const offers = await refreshProvider(provider, vnId, releases, vn, discovered, egsId, now, signal, aliases);
      const hasInputs =
        provider === 'eroge_price'
          ? !!egsId
          : provider === 'surugaya' || provider === 'trader'
            ? titleQueries(vn, aliases).length > 0
            : allTargetsForProvider(releases, provider, vn, discovered, aliases).length > 0;
      replaceVnStockProviderSnapshot(vnId, provider, offers, {
        status: hasInputs ? 'ok' : 'skipped',
        message: hasInputs ? null : 'No release link, JAN, or EGS id available for this provider.',
        fetched_at: now,
        offer_count: offers.length,
      });
    } catch (e) {
      const msg = (e as Error).message;
      const isCloudflare = msg === 'cloudflare_challenge';
      replaceVnStockProviderSnapshot(vnId, provider, [], {
        status: 'error',
        message: isCloudflare
          ? 'Cloudflare protected — automated access blocked.'
          : msg,
        fetched_at: now,
        offer_count: 0,
      });
    }
  }
  return getStockForVn(vnId);
}

export function getStockForVn(vnId: string): StockSnapshot {
  const directOffers: StockOffer[] = listVnStockOffers(vnId).map((offer) => ({
    ...offer,
    provider_label: providerLabel(offer.provider),
  }));
  const kobeOffers: StockOffer[] = listKobeStockForVn(vnId).map((row) => ({
    vn_id: vnId,
    provider: 'alicesoft_kobe',
    provider_offer_id: row.code,
    source: 'alicesoft_kobe',
    title: row.title,
    url: 'https://www.alice-kobe.com/html/page4.html',
    price: parsePriceYen(row.sale_price ?? row.list_price ?? ''),
    currency: 'JPY',
    availability: 'in_stock' as VnStockAvailability,
    availability_label: 'AliceSoft Kobe stock',
    condition: 'Used',
    edition_label: null,
    location_label: 'AliceSoft Kobe',
    location_branch: null,
    source_release_id: null,
    jan: row.jan,
    fetched_at: row.fetched_at,
    updated_at: row.updated_at,
    error: null,
    provider_label: providerLabel('alicesoft_kobe'),
    content_kind: 'game_package',
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
  }));
  const offers = [...directOffers, ...kobeOffers].sort((a, b) => {
    const rank = (v: VnStockAvailability) => (v === 'in_stock' ? 0 : v === 'limited' ? 1 : v === 'unknown' ? 2 : v === 'out_of_stock' ? 3 : 4);
    return rank(a.availability) - rank(b.availability) || (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
  });
  const statuses = listVnStockProviderStatuses(vnId);
  const available = offers.filter((offer) => offer.availability === 'in_stock' || offer.availability === 'limited').length;
  const priced = offers.map((offer) => offer.price).filter((price): price is number => price != null && price > 0);
  const lastRefresh = Math.max(0, ...offers.map((offer) => offer.fetched_at), ...statuses.map((status) => status.fetched_at));
  return {
    offers,
    statuses,
    providers: PROVIDERS,
    summary: {
      total: offers.length,
      available,
      best_price: priced.length > 0 ? Math.min(...priced) : null,
      last_refresh: lastRefresh > 0 ? lastRefresh : null,
    },
  };
}
