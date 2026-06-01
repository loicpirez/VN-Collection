/**
 * Eroge Price (`https://eroge-price.com`) JSON-API client + types.
 *
 * The site ships a clean REST API under `/api/games/…` that the Vue
 * front-end consumes. Switching to that gives us:
 *   - full structured staff (scenario / illustration / voice / music /
 *     singer)
 *   - per-retailer offers split into Download / Package, with sale
 *     flags, condition, condition note, original-price, discount rate,
 *     quality rank, last-checked timestamp
 *   - full price-history time-series (`/prices`) — every scrape point
 *     with retailer + edition + sale state
 *   - rolled-up price statistics (`/priceStats`) — all-time min/max,
 *     30-day min, optional notes
 *   - related-games graph (`/related`) — `connections` carry a
 *     relationship kind (fandisk / transplant / sequel …) plus
 *     `sameBrand` for browsing
 *   - search results (`/games?q=`) with cover / lowest-prices /
 *     retailer counts
 *
 * Everything is plain JSON. We persist the lot under `extras_json`
 * on `vn_stock_provider_status` so the StockPanel can render the
 * full picture without re-fetching.
 */

// ────────────────────────────────────────────────────────────────────────────
// Wire-format types — what the eroge-price API actually returns.
// ────────────────────────────────────────────────────────────────────────────

export interface EpApiSearchCard {
  id: number;
  title: string;
  maker: string | null;
  releaseDate: string | null;
  coverImageUrl: string | null;
  ageRating: string | null;
  hasDownload: boolean;
  hasPackage: boolean;
  /** Best price across all retailers / editions at fetch time. */
  lowestPrice: number | null;
  /** Best DL price. */
  lowestDownloadPrice: number | null;
  /** Best package price. */
  lowestPackagePrice: number | null;
  platform: string | null;
  retailerCount: number;
  isOnSale?: boolean;
  isDownloadOnSale?: boolean;
  isPackageOnSale?: boolean;
}

export interface EpApiSearchPayload {
  games: EpApiSearchCard[];
  pagination: { page: number; limit: number; total: number };
}

export interface EpApiStaff {
  scenario: string[];
  illustration: string[];
  voice: string[];
  music: string[];
  singer: string[];
}

export interface EpApiRetailer {
  retailerId: number;
  retailerName: string;
  retailerLogoUrl: string | null;
  productUrl: string;
  productCode: string | null;
  isAvailable: boolean;
  condition: string | null;
  conditionNote: string | null;
  qualityRank: number | null;
  currentPrice: number | null;
  isOnSale: boolean;
  originalPrice: number | null;
  discountRate: number | null;
  regularPrice: number | null;
  lastChecked: string | null;
}

export interface EpApiGameDetail {
  id: number;
  title: string;
  maker: string | null;
  genres: string[];
  mainStaff: EpApiStaff;
  releaseDate: string | null;
  coverImageUrl: string | null;
  description: string | null;
  officialSiteUrl: string | null;
  brandSiteUrl: string | null;
  platform: string | null;
  ageRating: string | null;
  hasDownload: boolean;
  hasPackage: boolean;
  fanzaDownloadCid: string | null;
  fanzaPackageCid: string | null;
  downloadRetailers: EpApiRetailer[];
  packageRetailers: EpApiRetailer[];
}

export interface EpApiPricePoint {
  id: number;
  price: number;
  isOnSale: boolean;
  originalPrice: number | null;
  discountRate: number | null;
  scrapedAt: string;
  retailerId: number;
  retailerName: string;
  /** `DOWNLOAD` | `PACKAGE`. */
  retailerEdition: string;
  retailerLogoUrl: string | null;
  conditionNote: string | null;
}

export interface EpApiPriceStats {
  allTimeMin: number | null;
  allTimeMax: number | null;
  allTimeMinNote: string | null;
  allTimeMaxNote: string | null;
  thirtyDayMin: number | null;
  thirtyDayMinNote: string | null;
}

export interface EpApiRelatedItem {
  id: number;
  title: string;
  maker: string | null;
  coverImageUrl: string | null;
}

export interface EpApiRelatedConnection extends EpApiRelatedItem {
  /** Raw kind string from the API (`fandisk`, `transplant`, `sequel`, …). */
  kind: string;
  /** Localised label (`FD`, `移植`, `続編`, …). */
  kindLabel: string;
}

export interface EpApiRelatedPayload {
  connections: EpApiRelatedConnection[];
  sameBrand: EpApiRelatedItem[];
}

// ────────────────────────────────────────────────────────────────────────────
// Bundle type — what we persist per candidate.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Aggregated bundle for one eroge-price game. We persist an array of
 * these (`{ candidates: ErogePriceBundle[] }`) per VN because a single
 * exact-title match commonly returns multiple games — original release,
 * re-release, mobile port, etc. The user explicitly asked for all of
 * them to be integrated, not just the first.
 *
 * NAMING — `epId` is the **eroge-price.com** numeric game id (the
 * path segment in `/games/<n>`). It is NOT the project's
 * ErogameScape "EGS" id (`egs_game.egs_id`, `vn_id = egs_<n>`).
 * Earlier drafts confused the two; do not revert. Legacy
 * persisted JSON blobs may carry an `egsId` key — the reader at
 * `decodeStoredExtras` upgrades on read, so both forms parse.
 */
export interface ErogePriceBundle {
  /** Eroge-price.com game id (NOT ErogameScape). */
  epId: number;
  /** Original eroge-price URL for `Open on Erogeprice` actions. */
  gameUrl: string;
  detail: EpApiGameDetail;
  priceStats: EpApiPriceStats;
  priceHistory: EpApiPricePoint[];
  related: EpApiRelatedPayload;
  /** Epoch ms when we last fetched this bundle. */
  fetchedAt: number;
}

export interface ErogePriceExtrasV1 {
  /** Schema version pin so future migrations are explicit. */
  schemaVersion: 1;
  /** All exact-title candidates returned by `/api/games?q=…`. */
  candidates: ErogePriceBundle[];
  /**
   * Operator's chosen candidate eroge-price game id (defaults to
   * first when null). NOT an ErogameScape id.
   */
  selectedEpId: number | null;
  /** The query string we sent to `/api/games?q=…`. */
  searchQuery: string | null;
  /** Epoch ms when the bundle was assembled. */
  refreshedAt: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Title normalization for search queries.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert full-width ASCII/Latin characters (！-～, 0xFF01-0xFF5E) to
 * half-width equivalents. Leaves CJK, hiragana, katakana untouched.
 */
function fullToHalf(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * Normalise tilde variants. The three most common in Japanese VN titles:
 *  U+007E  ~  TILDE (ASCII half-width)
 *  U+FF5E  ～ FULLWIDTH TILDE
 *  U+301C  〜 WAVE DASH
 * All are mapped to U+FF5E (the form most common in eroge-price titles).
 */
function normalizeTildes(s: string): string {
  return s.replace(/[~〜～]/g, '～');
}

/** Remove decorative non-letter symbols (☆ ★ ♪ ♥ ◆ ◇ ♦ ♠ etc.) */
function removeDecorative(s: string): string {
  return s.replace(/[☆★♪♥◆◇♦♠♣♡✿❀✦✧✩✪✫✬✭✮✯✰❤♔♕♖♗♘♙♚♛♜♝♞♟]/g, '').trim();
}

function japaneseKanaStem(s: string): string {
  const idx = s.search(/[～〜~☆★♪♥◆◇♦♠♣♡a-zA-Z]/);
  const prefix = (idx > 0 ? s.slice(0, idx) : s).trim();
  return /[぀-鿿]/.test(prefix) ? prefix : '';
}

export function buildErogePriceQueries(
  alttitle: string | null | undefined,
  title: string | null | undefined,
  aliases: string[] = [],
): string[] {
  const candidates: string[] = [];

  const add = (s: string) => {
    const q = s.trim();
    if (q.length < 2) return;
    if (!candidates.some((c) => c.toLowerCase() === q.toLowerCase())) candidates.push(q);
  };

  if (alttitle) {
    const a = alttitle.trim();
    if (a) {
      add(a);
      add(normalizeTildes(a));
      add(fullToHalf(a));
      add(normalizeTildes(fullToHalf(a)));
      const stripped = removeDecorative(normalizeTildes(fullToHalf(a)));
      if (stripped !== normalizeTildes(fullToHalf(a))) add(stripped);
      const stem = japaneseKanaStem(a);
      if (stem) add(stem);
    }
  }

  if (title) {
    const t = title.trim();
    if (t) {
      add(t);
      add(normalizeTildes(t));
      add(fullToHalf(t));
    }
  }

  for (const alias of aliases) {
    const a = alias.trim();
    if (a.length >= 2) {
      add(a);
      add(normalizeTildes(fullToHalf(a)));
    }
  }

  return candidates;
}

// ────────────────────────────────────────────────────────────────────────────
// URL builders.
// ────────────────────────────────────────────────────────────────────────────

const BASE = 'https://eroge-price.com';

/** Build the public-facing game URL (for "Open on Erogeprice"). */
export function buildErogePriceGameUrl(epId: number): string {
  return `${BASE}/games/${epId}`;
}

/** Build the search URL (for human reference in the UI). */
export function buildErogePriceSearchUrl(query: string): string {
  const u = new URL(`${BASE}/games`);
  u.searchParams.set('q', query);
  return u.toString();
}

/** Build the JSON-API search URL. */
export function buildErogePriceApiSearchUrl(query: string, page = 1): string {
  const u = new URL(`${BASE}/api/games`);
  u.searchParams.set('q', query);
  if (page > 1) u.searchParams.set('page', String(page));
  return u.toString();
}

export const apiGameUrl = (epId: number): string => `${BASE}/api/games/${epId}`;
export const apiPricesUrl = (epId: number): string => `${BASE}/api/games/${epId}/prices`;
export const apiPriceStatsUrl = (epId: number): string => `${BASE}/api/games/${epId}/priceStats`;
export const apiRelatedUrl = (epId: number): string => `${BASE}/api/games/${epId}/related`;

// ────────────────────────────────────────────────────────────────────────────
// JSON parsers (safe — any field can be missing on partial responses).
// ────────────────────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function parseEpSearch(input: unknown): EpApiSearchPayload | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const games = Array.isArray(o.games) ? o.games : [];
  const cards: EpApiSearchCard[] = [];
  for (const g of games) {
    if (!g || typeof g !== 'object') continue;
    const r = g as Record<string, unknown>;
    const id = asNumber(r.id);
    const title = asString(r.title);
    if (id == null || title == null) continue;
    cards.push({
      id,
      title,
      maker: asString(r.maker),
      releaseDate: asString(r.releaseDate),
      coverImageUrl: asString(r.coverImageUrl),
      ageRating: asString(r.ageRating),
      hasDownload: asBool(r.hasDownload),
      hasPackage: asBool(r.hasPackage),
      lowestPrice: asNumber(r.lowestPrice),
      lowestDownloadPrice: asNumber(r.lowestDownloadPrice),
      lowestPackagePrice: asNumber(r.lowestPackagePrice),
      platform: asString(r.platform),
      retailerCount: asNumber(r.retailerCount) ?? 0,
      isOnSale: asBool(r.isOnSale),
      isDownloadOnSale: asBool(r.isDownloadOnSale),
      isPackageOnSale: asBool(r.isPackageOnSale),
    });
  }
  const pag = (o.pagination && typeof o.pagination === 'object'
    ? (o.pagination as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  return {
    games: cards,
    pagination: {
      page: asNumber(pag.page) ?? 1,
      limit: asNumber(pag.limit) ?? cards.length,
      total: asNumber(pag.total) ?? cards.length,
    },
  };
}

function parseRetailer(input: unknown): EpApiRetailer | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const id = asNumber(r.retailerId);
  const name = asString(r.retailerName);
  const url = asString(r.productUrl);
  if (id == null || name == null || url == null) return null;
  return {
    retailerId: id,
    retailerName: name,
    retailerLogoUrl: asString(r.retailerLogoUrl),
    productUrl: url,
    productCode: asString(r.productCode),
    isAvailable: asBool(r.isAvailable),
    condition: asString(r.condition),
    conditionNote: asString(r.conditionNote),
    qualityRank: asNumber(r.qualityRank),
    currentPrice: asNumber(r.currentPrice),
    isOnSale: asBool(r.isOnSale),
    originalPrice: asNumber(r.originalPrice),
    discountRate: asNumber(r.discountRate),
    regularPrice: asNumber(r.regularPrice),
    lastChecked: asString(r.lastChecked),
  };
}

export function parseEpGameDetail(input: unknown): EpApiGameDetail | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const id = asNumber(r.id);
  const title = asString(r.title);
  if (id == null || title == null) return null;
  const staffRaw = (r.mainStaff && typeof r.mainStaff === 'object'
    ? (r.mainStaff as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  return {
    id,
    title,
    maker: asString(r.maker),
    genres: asStringArray(r.genres),
    mainStaff: {
      scenario: asStringArray(staffRaw.scenario),
      illustration: asStringArray(staffRaw.illustration),
      voice: asStringArray(staffRaw.voice),
      music: asStringArray(staffRaw.music),
      singer: asStringArray(staffRaw.singer),
    },
    releaseDate: asString(r.releaseDate),
    coverImageUrl: asString(r.coverImageUrl),
    description: asString(r.description),
    officialSiteUrl: asString(r.officialSiteUrl),
    brandSiteUrl: asString(r.brandSiteUrl),
    platform: asString(r.platform),
    ageRating: asString(r.ageRating),
    hasDownload: asBool(r.hasDownload),
    hasPackage: asBool(r.hasPackage),
    fanzaDownloadCid: asString(r.fanzaDownloadCid),
    fanzaPackageCid: asString(r.fanzaPackageCid),
    downloadRetailers: (Array.isArray(r.downloadRetailers) ? r.downloadRetailers : [])
      .map(parseRetailer)
      .filter((x): x is EpApiRetailer => x !== null),
    packageRetailers: (Array.isArray(r.packageRetailers) ? r.packageRetailers : [])
      .map(parseRetailer)
      .filter((x): x is EpApiRetailer => x !== null),
  };
}

export function parseEpPriceStats(input: unknown): EpApiPriceStats {
  if (!input || typeof input !== 'object') {
    return {
      allTimeMin: null,
      allTimeMax: null,
      allTimeMinNote: null,
      allTimeMaxNote: null,
      thirtyDayMin: null,
      thirtyDayMinNote: null,
    };
  }
  const r = input as Record<string, unknown>;
  return {
    allTimeMin: asNumber(r.allTimeMin),
    allTimeMax: asNumber(r.allTimeMax),
    allTimeMinNote: asString(r.allTimeMinNote),
    allTimeMaxNote: asString(r.allTimeMaxNote),
    thirtyDayMin: asNumber(r.thirtyDayMin),
    thirtyDayMinNote: asString(r.thirtyDayMinNote),
  };
}

export function parseEpPriceHistory(input: unknown): EpApiPricePoint[] {
  if (!Array.isArray(input)) return [];
  const out: EpApiPricePoint[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = asNumber(r.id);
    const price = asNumber(r.price);
    const scrapedAt = asString(r.scrapedAt);
    const retailerId = asNumber(r.retailerId);
    const retailerName = asString(r.retailerName);
    const retailerEdition = asString(r.retailerEdition);
    if (id == null || price == null || !scrapedAt || retailerId == null || !retailerName || !retailerEdition) {
      continue;
    }
    out.push({
      id,
      price,
      isOnSale: asBool(r.isOnSale),
      originalPrice: asNumber(r.originalPrice),
      discountRate: asNumber(r.discountRate),
      scrapedAt,
      retailerId,
      retailerName,
      retailerEdition,
      retailerLogoUrl: asString(r.retailerLogoUrl),
      conditionNote: asString(r.conditionNote),
    });
  }
  return out;
}

function parseRelatedItem(input: unknown): EpApiRelatedItem | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const id = asNumber(r.id);
  const title = asString(r.title);
  if (id == null || title == null) return null;
  return { id, title, maker: asString(r.maker), coverImageUrl: asString(r.coverImageUrl) };
}

export function parseEpRelated(input: unknown): EpApiRelatedPayload {
  if (!input || typeof input !== 'object') return { connections: [], sameBrand: [] };
  const r = input as Record<string, unknown>;
  const connections: EpApiRelatedConnection[] = [];
  if (Array.isArray(r.connections)) {
    for (const c of r.connections) {
      const item = parseRelatedItem(c);
      if (!item) continue;
      const cr = c as Record<string, unknown>;
      connections.push({
        ...item,
        kind: asString(cr.kind) ?? 'related',
        kindLabel: asString(cr.kindLabel) ?? '',
      });
    }
  }
  const sameBrand: EpApiRelatedItem[] = [];
  if (Array.isArray(r.sameBrand)) {
    for (const sb of r.sameBrand) {
      const item = parseRelatedItem(sb);
      if (item) sameBrand.push(item);
    }
  }
  return { connections, sameBrand };
}

// ────────────────────────────────────────────────────────────────────────────
// Server-side fetch helpers — assemble one or more candidates.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetcher signature used by `searchAndFetchAll` so unit tests can
 * inject deterministic fixture data without touching the network.
 */
export type JsonFetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>;

/**
 * Fetch the full bundle (`detail + priceStats + priceHistory + related`)
 * for a single eroge-price game id.
 *
 * Callers pass in a `JsonFetcher` so the implementation can swap
 * between the real `stockProviderFetch` (server) and a static fixture
 * (tests).
 */
export async function fetchErogePriceBundle(
  epId: number,
  fetcher: JsonFetcher,
  signal?: AbortSignal,
): Promise<ErogePriceBundle | null> {
  const [detailRaw, statsRaw, pricesRaw, relatedRaw] = await Promise.all([
    fetcher(apiGameUrl(epId), { signal }),
    fetcher(apiPriceStatsUrl(epId), { signal }),
    fetcher(apiPricesUrl(epId), { signal }),
    fetcher(apiRelatedUrl(epId), { signal }),
  ]);
  const detail = parseEpGameDetail(detailRaw);
  if (!detail) return null;
  return {
    epId,
    gameUrl: buildErogePriceGameUrl(epId),
    detail,
    priceStats: parseEpPriceStats(statsRaw),
    priceHistory: parseEpPriceHistory(pricesRaw),
    related: parseEpRelated(relatedRaw),
    fetchedAt: Date.now(),
  };
}

/**
 * Run the API search for `query`, then materialise the full bundle for
 * every candidate that matches. Returns `null` when search produces
 * zero candidates so the caller can skip the persist step.
 *
 * The user explicitly asked: "one exact name match can have many
 * games; integrate them all". This helper does exactly that — every
 * search candidate becomes a `ErogePriceBundle` in the returned
 * `candidates` array, with the first one auto-selected as the default
 * surface. The operator can re-select inside the UI without re-
 * fetching.
 */
export async function searchAndFetchAll(
  query: string,
  fetcher: JsonFetcher,
  signal?: AbortSignal,
  maxCandidates = 6,
): Promise<ErogePriceExtrasV1 | null> {
  if (!query.trim()) return null;
  const searchUrl = buildErogePriceApiSearchUrl(query.trim());
  const raw = await fetcher(searchUrl, { signal });
  const payload = parseEpSearch(raw);
  if (!payload || payload.games.length === 0) return null;
  const top = payload.games.slice(0, maxCandidates);
  const bundles: ErogePriceBundle[] = [];
  let lastError: unknown = undefined;
  for (const card of top) {
    try {
      const bundle = await fetchErogePriceBundle(card.id, fetcher, signal);
      if (bundle) bundles.push(bundle);
    } catch (err) {
      console.error('[eroge-price] bundle fetch failed for id', card.id, err);
      lastError = err;
    }
  }
  if (bundles.length === 0 && lastError !== undefined) throw lastError;
  if (bundles.length === 0) return null;
  return {
    schemaVersion: 1,
    candidates: bundles,
    selectedEpId: bundles[0].epId,
    searchQuery: query.trim(),
    refreshedAt: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Backward-compatible reader for persisted `extras_json`.
//
// Earlier drafts called the eroge-price game id `egsId` / `selectedEgsId`,
// which collided with the project-wide "EGS = ErogameScape" meaning.
// The keys have been renamed to `epId` / `selectedEpId`, but the row
// is stored in TEXT JSON so legacy blobs may still carry the old names.
// `decodeStoredExtras` is the single read path — every consumer that
// pulls `extras_json` MUST go through this helper, never `JSON.parse`
// directly, otherwise the rename will silently regress old DBs.
// ────────────────────────────────────────────────────────────────────────────

interface LegacyBundle {
  egsId?: number;
  epId?: number;
  gameUrl?: string;
  detail?: unknown;
  priceStats?: unknown;
  priceHistory?: unknown;
  related?: unknown;
  fetchedAt?: number;
}

interface LegacyExtras {
  schemaVersion?: number;
  candidates?: LegacyBundle[];
  selectedEgsId?: number | null;
  selectedEpId?: number | null;
  searchQuery?: string | null;
  refreshedAt?: number;
}

/**
 * Read a possibly-legacy persisted envelope and upgrade it on-the-fly.
 * Returns null for anything that doesn't look like an ErogePrice extras
 * blob so callers can fall back to a fresh refresh.
 */
export function decodeStoredExtras(raw: string | null | undefined): ErogePriceExtrasV1 | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const legacy = parsed as LegacyExtras;
  if (legacy.schemaVersion !== 1 || !Array.isArray(legacy.candidates)) return null;

  const candidates: ErogePriceBundle[] = [];
  for (const c of legacy.candidates) {
    if (!c || typeof c !== 'object') continue;
    const id = typeof c.epId === 'number' ? c.epId : typeof c.egsId === 'number' ? c.egsId : null;
    if (id == null || !Number.isInteger(id) || id <= 0) continue;
    const detail = parseEpGameDetail(c.detail);
    if (!detail) continue;
    candidates.push({
      epId: id,
      gameUrl: typeof c.gameUrl === 'string' ? c.gameUrl : buildErogePriceGameUrl(id),
      detail,
      priceStats: parseEpPriceStats(c.priceStats),
      priceHistory: parseEpPriceHistory(c.priceHistory),
      related: parseEpRelated(c.related),
      fetchedAt: typeof c.fetchedAt === 'number' && Number.isFinite(c.fetchedAt) ? c.fetchedAt : Date.now(),
    });
  }
  if (candidates.length === 0) return null;

  const selected =
    typeof legacy.selectedEpId === 'number'
      ? legacy.selectedEpId
      : typeof legacy.selectedEgsId === 'number'
        ? legacy.selectedEgsId
        : null;

  return {
    schemaVersion: 1,
    candidates,
    selectedEpId: selected != null && candidates.some((c) => c.epId === selected) ? selected : candidates[0].epId,
    searchQuery: typeof legacy.searchQuery === 'string' ? legacy.searchQuery : null,
    refreshedAt: typeof legacy.refreshedAt === 'number' ? legacy.refreshedAt : Date.now(),
  };
}
