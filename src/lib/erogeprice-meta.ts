/**
 * Eroge Price (`https://eroge-price.com`) full-page metadata parser.
 *
 * Real-world page structure (sampled 2026-05-28, see
 * `tests/fixtures/eroge-price/`):
 *
 *   <script type="application/ld+json">[
 *     { "@type":"Product",
 *       "name":"沙耶の唄",
 *       "brand":{"@type":"Brand","name":"NitroPlus"},
 *       "releaseDate":"2003-12-26",
 *       "image":"https://pics.dmm.co.jp/...",
 *       "offers":{
 *         "@type":"AggregateOffer",
 *         "lowPrice":2530, "highPrice":3211, "offerCount":3,
 *         "offers":[{"seller":{"name":"駿河屋"},"price":3211,"url":"..."},
 *                   ...]
 *       }
 *     },
 *     { "@type":"BreadcrumbList", ... }
 *   ]</script>
 *
 *   <div id="ssr-content">
 *     <h1>沙耶の唄 の価格比較</h1>
 *     <p>ブランド: NitroPlus ／ 発売日: 2003-12-26</p>
 *     <p>沙耶の唄は現在3ショップで取扱があります。最安値は…</p>
 *     <h2>価格比較</h2>
 *     <table>
 *       <thead><tr><th>ショップ</th><th>版種</th><th>価格</th><th>状態</th><th>セール</th></tr></thead>
 *       <tbody><tr><td>駿河屋</td><td>パッケージ版</td><td>¥3,211</td><td>特殊版・限定版 / 中古</td><td>-</td></tr>…</tbody>
 *     </table>
 *     <p>最安値: ¥2,530</p>
 *     <h2>価格履歴サマリ</h2>
 *     <ul>
 *       <li>価格履歴: 217件</li>
 *       <li>過去最安値: ¥1,501（2026-05-22）</li>
 *       <li>過去最高値: ¥3,411（2026-05-25）</li>
 *       <li>価格更新日: 2026-05-27</li>
 *     </ul>
 *     <p>年齢対象: R18</p>
 *     <h2>スタッフ</h2>
 *     <dl>
 *       <dt>シナリオ</dt><dd>虚淵玄</dd>
 *       <dt>原画</dt><dd>中央東口</dd>
 *       <dt>音楽</dt><dd>磯江俊道、川越好博、神保伸太郎、大山曜</dd>
 *       <dt>主題歌</dt><dd>いとうかなこ</dd>
 *       <dt>声優</dt><dd>矢沢泉、川村みどり、海原エレナ、佐藤まこと、…</dd>
 *     </dl>
 *     <h2>NitroPlusの他のゲーム</h2>      ← related: same brand
 *     <ul><li><a href="/games/NN">…</a></li>…</ul>
 *     <h2>同じスタッフの関連ゲーム</h2>     ← related: same staff
 *     <h2>YYYY年発売の関連ゲーム</h2>     ← related: same year
 *   </div>
 *
 * This module ONLY parses. Persistence + UI wiring live in stock.ts /
 * the StockPanel component.
 */

/** One row of the price-comparison table. */
export interface ErogePriceTableRow {
  /** Store name as displayed (`駿河屋`, `DLsite`, `FANZA`, `らしんばん`, …). */
  shop: string;
  /** Edition kind (`パッケージ版`, `ダウンロード版`, or rare variants). */
  edition: string | null;
  /** Yen price as parsed from `¥X,XXX`. `null` when the cell reads `-`. */
  price: number | null;
  /** Raw condition cell text (`通常 / A / 店舗併売品の為…`, `中古`, etc.). */
  condition: string | null;
  /** Raw sale cell text — `-` when no promotion is active. */
  saleLabel: string | null;
}

/** One link surfaced in a "related games" block at the bottom of the page. */
export interface ErogePriceRelatedLink {
  egsId: number;
  title: string;
  /** `brand-other` | `same-staff` | `same-year`. */
  kind: 'brand-other' | 'same-staff' | 'same-year';
  /** Only populated when the bullet rendered it (same-staff list does). */
  brand: string | null;
}

/** Aggregated metadata for one Eroge Price game page. */
export interface ErogePriceMeta {
  /** The numeric id from `/games/{id}` — same as EGS id (the site is keyed by it). */
  egsId: number;
  /** Source URL the meta was parsed from. */
  url: string;
  title: string;
  brand: string | null;
  /** ISO date like `2003-12-26`. */
  releaseDate: string | null;
  /** Cover image URL — pulled from JSON-LD `image`. */
  imageUrl: string | null;
  /** Age rating string as it appears on the page (`R18`, `全年齢` …). */
  ageRating: string | null;
  /** Editions the page knows about (from table column 2 + summary copy). */
  editionsAvailable: string[];
  /** Number of offers across all stores, from JSON-LD AggregateOffer.offerCount. */
  offerCount: number | null;
  /** Current lowest yen across all stores. */
  currentLow: number | null;
  /** Current highest yen across all stores. */
  currentHigh: number | null;
  /**
   * Price-history summary. Some keys may be null when the page lacks
   * the corresponding bullet.
   */
  history: {
    /** Total number of recorded price points (`価格履歴: NN件`). */
    sampleCount: number | null;
    /** All-time low. */
    allTimeLow: { price: number; date: string } | null;
    /** All-time high. */
    allTimeHigh: { price: number; date: string } | null;
    /** When the page last refreshed its scrape (`価格更新日`). */
    updatedAt: string | null;
  };
  staff: {
    scenario: string[];
    artist: string[];
    music: string[];
    themeSong: string[];
    voiceActors: string[];
  };
  /** Price-comparison table — one row per store / edition pair. */
  offers: ErogePriceTableRow[];
  /** Related-game links scraped from the three bottom blocks. */
  related: ErogePriceRelatedLink[];
}

/** Search-result card from `/games?q=…`. */
export interface ErogePriceSearchCandidate {
  egsId: number;
  title: string;
  brand: string | null;
}

// ────────────────────────────────────────────────────────────────────────────

const SSR_CONTENT_RE = /<div id="ssr-content">([\s\S]*?)<\/div>\s*<div id="app">/;
const JSON_LD_RE = /<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '').trim());
}

function parseYen(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[¥￥,\s]/g, '');
  const m = /^(\d+)/.exec(cleaned);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function splitStaffList(text: string): string[] {
  // Names separated by `、` (full-width comma) or `,`. Trim each.
  return text
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface JsonLdProduct {
  '@type'?: string;
  name?: string;
  brand?: { name?: string };
  releaseDate?: string;
  image?: string;
  offers?: {
    '@type'?: string;
    lowPrice?: number;
    highPrice?: number;
    offerCount?: number;
  };
}

function extractJsonLdProduct(html: string): JsonLdProduct | null {
  const m = JSON_LD_RE.exec(html);
  if (!m) return null;
  try {
    const parsed: unknown = JSON.parse(m[1]);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of arr) {
      if (node && typeof node === 'object' && (node as JsonLdProduct)['@type'] === 'Product') {
        return node as JsonLdProduct;
      }
    }
  } catch {
    // ignore malformed JSON-LD
  }
  return null;
}

function parsePriceHistory(ssr: string): ErogePriceMeta['history'] {
  const out: ErogePriceMeta['history'] = {
    sampleCount: null,
    allTimeLow: null,
    allTimeHigh: null,
    updatedAt: null,
  };
  const block = /<h2[^>]*>価格履歴サマリ<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/.exec(ssr);
  if (!block) return out;
  const items = block[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g);
  for (const item of items) {
    const text = stripTags(item[1]);
    let m = /価格履歴:\s*(\d+)\s*件/.exec(text);
    if (m) out.sampleCount = parseInt(m[1], 10);
    m = /過去最安値:\s*¥([\d,]+)\s*（([\d-]+)）/.exec(text);
    if (m) out.allTimeLow = { price: parseYen(m[1]) ?? 0, date: m[2] };
    m = /過去最高値:\s*¥([\d,]+)\s*（([\d-]+)）/.exec(text);
    if (m) out.allTimeHigh = { price: parseYen(m[1]) ?? 0, date: m[2] };
    m = /価格更新日:\s*([\d-]+)/.exec(text);
    if (m) out.updatedAt = m[1];
  }
  return out;
}

function parseStaffDl(ssr: string): ErogePriceMeta['staff'] {
  const staff: ErogePriceMeta['staff'] = {
    scenario: [],
    artist: [],
    music: [],
    themeSong: [],
    voiceActors: [],
  };
  const block = /<h2[^>]*>スタッフ<\/h2>\s*<dl[^>]*>([\s\S]*?)<\/dl>/.exec(ssr);
  if (!block) return staff;
  const pairs = block[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g);
  for (const p of pairs) {
    const key = stripTags(p[1]);
    const value = stripTags(p[2]);
    const names = splitStaffList(value);
    if (/シナリオ/.test(key)) staff.scenario = names;
    else if (/原画/.test(key)) staff.artist = names;
    else if (/音楽/.test(key)) staff.music = names;
    else if (/主題歌/.test(key)) staff.themeSong = names;
    else if (/声優/.test(key)) staff.voiceActors = names;
  }
  return staff;
}

function parseOffersTable(ssr: string): ErogePriceTableRow[] {
  const tableMatch = /<h2[^>]*>価格比較<\/h2>\s*<table[^>]*>([\s\S]*?)<\/table>/.exec(ssr);
  if (!tableMatch) return [];
  const rows: ErogePriceTableRow[] = [];
  for (const trMatch of tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells: string[] = [];
    for (const td of trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)) {
      cells.push(stripTags(td[1]));
    }
    if (cells.length < 5) continue; // header rows have <th>, body rows have <td>
    const [shop, edition, priceText, condition, saleLabel] = cells;
    rows.push({
      shop,
      edition: edition && edition !== '-' ? edition : null,
      price: parseYen(priceText ?? ''),
      condition: condition && condition !== '-' ? condition : null,
      saleLabel: saleLabel && saleLabel !== '-' ? saleLabel : null,
    });
  }
  return rows;
}

function parseRelatedSection(
  ssr: string,
  heading: RegExp,
  kind: ErogePriceRelatedLink['kind'],
): ErogePriceRelatedLink[] {
  const block = new RegExp(`<h2[^>]*>${heading.source}<\\/h2>\\s*<ul[^>]*>([\\s\\S]*?)<\\/ul>`).exec(ssr);
  if (!block) return [];
  const links: ErogePriceRelatedLink[] = [];
  for (const li of block[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const inner = li[1];
    const aMatch = /<a\s+href="\/games\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(inner);
    if (!aMatch) continue;
    const egsId = parseInt(aMatch[1], 10);
    if (!Number.isInteger(egsId) || egsId <= 0) continue;
    const title = stripTags(aMatch[2]);
    // The same-staff section adds `（Brand）` after the link.
    const afterLink = inner.slice(aMatch.index! + aMatch[0].length);
    const brandMatch = /^\s*（([^）]+)）/.exec(decodeEntities(afterLink));
    const brand = brandMatch ? brandMatch[1].trim() : null;
    links.push({ egsId, title, kind, brand });
  }
  return links;
}

/**
 * Parse a `/games/{id}` page. Returns `null` if the SSR content block
 * cannot be located — the site occasionally serves an empty SSR
 * shell for unknown ids.
 */
export function parseErogePriceMeta(html: string, url: string, egsId: number): ErogePriceMeta | null {
  const ssrMatch = SSR_CONTENT_RE.exec(html);
  if (!ssrMatch) return null;
  const ssr = ssrMatch[1];

  // Title + brand + release date — prefer JSON-LD then SSR fallback.
  const jsonLd = extractJsonLdProduct(html);
  const titleFromH1 = /<h1[^>]*>([\s\S]*?)\s+の価格比較<\/h1>/.exec(ssr);
  const title = jsonLd?.name ?? (titleFromH1 ? stripTags(titleFromH1[1]) : '').trim();

  let brand: string | null = jsonLd?.brand?.name?.trim() ?? null;
  let releaseDate: string | null = jsonLd?.releaseDate ?? null;
  if (!brand || !releaseDate) {
    const m = /<p[^>]*>ブランド:\s*([^<\n／]+)\s*[／/]\s*発売日:\s*([\d-]+)\s*<\/p>/.exec(ssr);
    if (m) {
      brand = brand ?? (m[1].trim() || null);
      releaseDate = releaseDate ?? (m[2].trim() || null);
    }
  }

  // Age rating + edition list. Anchor on the raw HTML so a missing
  // closing `<p>` doesn't sweep the rest of the SSR into the match.
  const ageMatch = /<p[^>]*>\s*年齢対象:\s*([^<\s][^<]*?)\s*<\/p>/.exec(ssr);
  const ageRating = ageMatch ? ageMatch[1].trim() : null;

  // Image URL — JSON-LD or og:image fallback.
  let imageUrl: string | null = jsonLd?.image ?? null;
  if (!imageUrl) {
    const ogMatch = /<meta\s+property="og:image"\s+content="([^"]+)"/.exec(html);
    if (ogMatch) imageUrl = ogMatch[1];
  }

  // Current low/high — prefer JSON-LD AggregateOffer, fall back to SSR copy.
  let currentLow: number | null = jsonLd?.offers?.lowPrice ?? null;
  let currentHigh: number | null = jsonLd?.offers?.highPrice ?? null;
  if (currentLow == null) {
    const m = /最安値:\s*¥([\d,]+)/.exec(stripTags(ssr));
    if (m) currentLow = parseYen(m[1]);
  }
  const offerCount = jsonLd?.offers?.offerCount ?? null;

  const offers = parseOffersTable(ssr);
  // Editions available = the distinct non-null `edition` cells in the
  // offers table. The table column is the canonical source — checking
  // raw SSR substrings for `限定版` etc. was picking up offer-condition
  // text like `特殊版・限定版 / 中古` and producing false positives.
  const editionsAvailable = Array.from(
    new Set(offers.map((row) => row.edition).filter((e): e is string => !!e)),
  );
  const staff = parseStaffDl(ssr);
  const history = parsePriceHistory(ssr);
  const related: ErogePriceRelatedLink[] = [
    ...parseRelatedSection(ssr, /[\s\S]+?の他のゲーム/, 'brand-other'),
    ...parseRelatedSection(ssr, /同じスタッフの関連ゲーム/, 'same-staff'),
    ...parseRelatedSection(ssr, /[\d]+?年発売の関連ゲーム/, 'same-year'),
  ];

  return {
    egsId,
    url,
    title,
    brand,
    releaseDate,
    imageUrl,
    ageRating,
    editionsAvailable,
    offerCount,
    currentLow,
    currentHigh,
    history,
    staff,
    offers,
    related,
  };
}

/**
 * Parse a `/games?q=…` search-results page. Returns the candidate
 * `{ egsId, title, brand }` list in display order. The site renders
 * results as `<ul><li><a href="/games/NN">title</a>（brand）</li>…</ul>`
 * inside the SSR `<div id="ssr-content">` shell, so even when the
 * Vue app hasn't mounted (most operator setups) we get the list.
 */
export function parseErogePriceSearch(html: string): ErogePriceSearchCandidate[] {
  const ssrMatch = SSR_CONTENT_RE.exec(html);
  if (!ssrMatch) return [];
  const ssr = ssrMatch[1];
  const out: ErogePriceSearchCandidate[] = [];
  for (const li of ssr.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const inner = li[1];
    const aMatch = /<a\s+href="\/games\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(inner);
    if (!aMatch) continue;
    const egsId = parseInt(aMatch[1], 10);
    if (!Number.isInteger(egsId) || egsId <= 0) continue;
    const title = stripTags(aMatch[2]);
    const afterLink = inner.slice(aMatch.index! + aMatch[0].length);
    const brandMatch = /^\s*（([^）]+)）/.exec(decodeEntities(afterLink));
    out.push({ egsId, title, brand: brandMatch ? brandMatch[1].trim() : null });
  }
  return out;
}

/**
 * Build the Eroge Price search URL. The site supports any free-form
 * text in `q`; we URL-encode and pass through. Operator feedback
 * flagged that romaji titles return zero hits — `沙耶の唄` is the
 * canonical query. Callers should prefer the operator's `alttitle`
 * when present.
 */
export function buildErogePriceSearchUrl(query: string): string {
  const u = new URL('https://eroge-price.com/games');
  u.searchParams.set('q', query);
  return u.toString();
}

/** Build the per-game detail URL. */
export function buildErogePriceGameUrl(egsId: number): string {
  return `https://eroge-price.com/games/${egsId}`;
}
