import 'server-only';
import {
  clearEgsForVn,
  db,
  getCollectionItem,
  getEgsForVn,
  upsertEgsForVn,
  type EgsRow,
} from './db';
import { getReleasesForVn } from './vndb';

/**
 * Erogamescape (EGS) integration. EGS exposes a public SQL form that returns CSV;
 * we use it instead of HTML scraping for reliability.
 *
 * - Find the EGS game id by scanning VNDB release extlinks (label === "ErogameScape").
 * - Pull aggregate stats (median, average, dispersion, vote count, sellday, playtime).
 * - Optionally fall back to a name search when no VNDB extlink exists.
 *
 * Everything is cached in the shared `vndb_cache` table so we don't hammer EGS.
 */

const EGS_BASE = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki';
// EGS's SQL form is at `sql_for_erogamer_form.php` (the bare `sql_for_erogamer.php`
// is a 404). The form requires POST; GET just re-renders the input HTML.
// Response is always an HTML table — there's no CSV / JSON output, the
// `format` query param is silently ignored. We parse the <tr>/<td> structure.
const SQL_ENDPOINT = `${EGS_BASE}/sql_for_erogamer_form.php`;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 15000;

export interface EgsGame {
  id: number;
  gamename: string;
  gamename_furigana: string | null;
  brand_id: number | null;
  brand_name: string | null;
  model: string | null;
  description: string | null;
  /** EGS-served cover image URL (may 404 — SafeImage handles it gracefully). */
  image_url: string | null;
  okazu: boolean | null;
  erogame: boolean | null;
  median: number | null;
  average: number | null;
  dispersion: number | null;
  count: number | null;
  sellday: string | null;
  /** Median playtime in minutes if EGS exposes one; null otherwise. */
  playtime_median_minutes: number | null;
  url: string;
  /** Raw column map preserved so future columns are usable without a schema change. */
  raw?: Record<string, string | null>;
}

interface CacheRow {
  body: string;
  expires_at: number;
}

function cacheKey(prefix: string, value: string): string {
  return `egs:${prefix}:${value}`;
}

function readCache<T>(key: string): T | null {
  const row = db
    .prepare('SELECT body, expires_at FROM vndb_cache WHERE cache_key = ?')
    .get(key) as CacheRow | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  try {
    return JSON.parse(row.body) as T;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown, ttlMs = CACHE_TTL_MS): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key, JSON.stringify(value), now, now + ttlMs);
}

async function fetchTable(sql: string): Promise<string[][]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(SQL_ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'vndb-collection/1.0 (personal use)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ sql }).toString(),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`EGS HTTP ${res.status}`);
  const html = await res.text();
  return parseHtmlTable(html);
}

const TABLE_RE = /<table\b[^>]*class="[^"]*\bsql_for_erogamer\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i;
const TABLE_FALLBACK_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<(th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;

/**
 * Decode the small set of HTML entities EGS actually emits — full DOM parsing
 * would pull in cheerio (~200KB). The page is generated server-side from a
 * fixed template, so this short list covers every case we've seen.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&'); // last so we don't double-decode entities containing &amp;
}

/**
 * Find the result <table> and return rows as a 2-D string array. The first
 * row holds column names (decoded from <th>). NULL cells are emitted as "".
 */
function parseHtmlTable(html: string): string[][] {
  // EGS's "no results" path skips the result table entirely. Detect it explicitly.
  if (/該当するデータはありません/.test(html) || /結果がありません/.test(html)) return [];

  let body = '';
  const named = html.match(TABLE_RE);
  if (named) {
    body = named[1];
  } else {
    // No class — pick the last <table>, which is consistently the result block.
    let last: RegExpExecArray | null = null;
    TABLE_FALLBACK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TABLE_FALLBACK_RE.exec(html)) !== null) {
      last = m;
    }
    if (!last) return [];
    body = last[1];
  }

  const rows: string[][] = [];
  ROW_RE.lastIndex = 0;
  let rm: RegExpExecArray | null;
  while ((rm = ROW_RE.exec(body)) !== null) {
    const cells: string[] = [];
    CELL_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = CELL_RE.exec(rm[1])) !== null) {
      // Strip nested anchors / spans, then decode entities.
      const inner = cm[2].replace(/<[^>]+>/g, '').trim();
      cells.push(decodeEntities(inner));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function toNumber(v: string | undefined): number | null {
  if (v == null || v === '' || v === 'NULL') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pulls the EGS game id from a VNDB release extlink URL, e.g. `?game=4192`. */
export function parseEgsIdFromUrl(url: string): number | null {
  const m = url.match(/[?&]game=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Returns the first EGS game id found across the supplied release extlinks. */
export function findEgsIdInExtlinks(
  extlinks: { url: string; label: string; name: string }[],
): number | null {
  for (const link of extlinks) {
    const label = `${link.label} ${link.name}`.toLowerCase();
    if (label.includes('erogamescape') || link.url.includes('erogamescape.dyndns.org')) {
      const id = parseEgsIdFromUrl(link.url);
      if (id != null) return id;
    }
  }
  return null;
}

function buildImageUrl(id: number): string {
  // EGS exposes covers via a tiny PHP redirector. Some games have no image at all;
  // SafeImage's `errored` fallback handles the 404 silently.
  return `${EGS_BASE}/image.php?game=${id}`;
}

function toBool(v: string | undefined): boolean | null {
  if (v == null || v === '' || v === 'NULL') return null;
  if (v === 't' || v === 'true' || v === '1') return true;
  if (v === 'f' || v === 'false' || v === '0') return false;
  return null;
}

async function fetchOne(sql: string): Promise<Record<string, string | null> | null> {
  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return null;
  }
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.trim());
  const data = rows[1];
  const out: Record<string, string | null> = {};
  for (let i = 0; i < header.length; i++) {
    const value = data[i] ?? '';
    out[header[i]] = value === '' || value === 'NULL' ? null : value;
  }
  return out;
}

/**
 * Real gamelist columns (verified against the live DB, May 2026):
 *   id, gamename, furigana, sellday, brandname (FK → brandlist.id),
 *   median, stdev, count2, average2, median2, max2, min2,
 *   model, erogame, okazu, banner_url, total_play_time_median,
 *   time_before_understanding_fun_median, genre, shoukai (URL — not a synopsis!),
 *   gyutto_id, dmm, dlsite_id, dlsite_domain, twitter, erogetrailers, …
 *
 * Caveats:
 *   - `count` doesn't exist; the vote count is `count2`.
 *   - `gamelist.brandname` is a numeric FK to `brandlist.id`; join is mandatory
 *     to get the readable brand name.
 *   - `shoukai` is a URL (publisher's product page), not a synopsis.
 *   - There is no structured synopsis column in EGS — the page text is
 *     assembled from user comments. We surface a single top-scored user
 *     long comment as the EGS "description" instead.
 *   - Some columns return PostgreSQL `t` / `f` for booleans; toBool handles both.
 */
export async function fetchEgsGame(id: number, opts: { force?: boolean } = {}): Promise<EgsGame | null> {
  const cacheK = cacheKey('game', String(id));
  if (!opts.force) {
    const cached = readCache<EgsGame | null>(cacheK);
    if (cached !== null) return cached;
  }

  // `g.*` pulls every gamelist column (creater, comike, hanbaisuu, gyutto_id,
  // dmm, dlsite_id, erogetrailers, genre, axis_of_soft_or_hard, max2, min2,
  // total_pov_enrollment_of_{a,b,c}, time_before_understanding_fun_median, …)
  // into `raw_json` so we never need to re-query for fields we forgot.
  // Then alias the brandlist join's `brandname` so it doesn't collide with
  // `gamelist.brandname` (which is actually the brand FK id).
  const sql = `
    SELECT g.*,
           b.id AS brand_fk_id, b.brandname AS brand_name
    FROM gamelist g
    LEFT JOIN brandlist b ON g.brandname = b.id
    WHERE g.id = ${id}
    LIMIT 1
  `;
  let row: Record<string, string | null> | null = null;
  try {
    row = await fetchOne(sql);
  } catch {
    row = null;
  }
  if (!row) {
    writeCache(cacheK, null, 6 * 3600 * 1000);
    return null;
  }

  // Banner / cover image: gamelist.banner_url when present, else fall back to the
  // EGS image.php redirector (which 404s for games without an upload).
  const image_url = row.banner_url && row.banner_url.startsWith('http')
    ? row.banner_url
    : buildImageUrl(id);

  // Description: pull the top-scored user long-comment so we have *something*
  // to display next to VNDB's synopsis. Stays optional — if EGS has no
  // long-form comment for this game, description stays null and VNDB wins.
  const description = await fetchTopLongComment(id);
  const playMin = await fetchEgsPlaytimeMedian(id);

  const game: EgsGame = {
    id,
    gamename: (row.gamename ?? '').trim(),
    gamename_furigana: row.furigana ?? null,
    brand_id: toNumber(row.brand_fk_id ?? undefined),
    brand_name: row.brand_name ?? null,
    model: row.model ?? null,
    description,
    image_url,
    okazu: toBool(row.okazu ?? undefined),
    erogame: toBool(row.erogame ?? undefined),
    median: toNumber(row.median ?? undefined),
    average: toNumber(row.average2 ?? undefined),
    dispersion: toNumber(row.stdev ?? undefined),
    count: toNumber(row.count2 ?? undefined),
    sellday: row.sellday ?? null,
    playtime_median_minutes: playMin ?? toNumber(row.total_play_time_median ?? undefined),
    url: `${EGS_BASE}/game.php?game=${id}`,
    raw: row,
  };
  writeCache(cacheK, game);
  return game;
}

/**
 * Top user long-comment for a game. EGS doesn't ship a structured synopsis;
 * this is the best stand-in we have. Picks the highest-rated review's long
 * comment so it reads like a curated blurb.
 */
async function fetchTopLongComment(id: number): Promise<string | null> {
  const sql = `
    SELECT long_comment FROM userreview
    WHERE id = ${id} AND long_comment IS NOT NULL AND long_comment <> ''
    ORDER BY point DESC LIMIT 1
  `;
  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return null;
  }
  if (rows.length < 2) return null;
  const value = rows[1][0]?.trim();
  if (!value) return null;
  // Long comments can be huge — keep a reasonable preview to avoid bloating the row.
  return value.length > 4000 ? `${value.slice(0, 4000).trimEnd()}…` : value;
}

async function fetchEgsPlaytimeMedian(id: number): Promise<number | null> {
  // userreview holds per-review play_time in minutes; take the median across non-null entries.
  const sql = `SELECT play_time FROM userreview WHERE id = ${id} AND play_time IS NOT NULL ORDER BY play_time`;
  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return null;
  }
  if (rows.length < 2) return null;
  const values = rows
    .slice(1)
    .map((r) => toNumber(r[0]))
    .filter((n): n is number => n != null && n > 0);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}

const ROW_TTL_MS = 7 * 24 * 3600 * 1000;

function rowToGame(row: EgsRow): EgsGame | null {
  if (row.egs_id == null) return null;
  let raw: Record<string, string | null> | undefined;
  if (row.raw_json) {
    try {
      const parsed = JSON.parse(row.raw_json) as unknown;
      if (parsed && typeof parsed === 'object') raw = parsed as Record<string, string | null>;
    } catch {
      // ignore — stale or malformed snapshot, keep undefined
    }
  }
  return {
    id: row.egs_id,
    gamename: row.gamename ?? '',
    gamename_furigana: row.gamename_furigana ?? null,
    brand_id: row.brand_id ?? null,
    brand_name: row.brand_name ?? null,
    model: row.model ?? null,
    description: row.description ?? null,
    image_url: row.image_url ?? `${EGS_BASE}/image.php?game=${row.egs_id}`,
    okazu: row.okazu != null ? !!row.okazu : null,
    erogame: row.erogame != null ? !!row.erogame : null,
    median: row.median,
    average: row.average,
    dispersion: row.dispersion,
    count: row.count,
    sellday: row.sellday,
    playtime_median_minutes: row.playtime_median_minutes,
    url: `${EGS_BASE}/game.php?game=${row.egs_id}`,
    raw,
  };
}

function persistGame(vnId: string, game: EgsGame, source: 'extlink' | 'search' | 'manual'): void {
  upsertEgsForVn({
    vn_id: vnId,
    egs_id: game.id,
    gamename: game.gamename,
    gamename_furigana: game.gamename_furigana,
    brand_id: game.brand_id,
    brand_name: game.brand_name,
    model: game.model,
    description: game.description,
    image_url: game.image_url,
    okazu: game.okazu == null ? null : game.okazu ? 1 : 0,
    erogame: game.erogame == null ? null : game.erogame ? 1 : 0,
    raw_json: game.raw ? JSON.stringify(game.raw) : null,
    median: game.median,
    average: game.average,
    dispersion: game.dispersion,
    count: game.count,
    sellday: game.sellday,
    playtime_median_minutes: game.playtime_median_minutes,
    source,
  });
}

function persistNoMatch(vnId: string): void {
  upsertEgsForVn({
    vn_id: vnId,
    egs_id: null,
    gamename: null,
    gamename_furigana: null,
    brand_id: null,
    brand_name: null,
    model: null,
    description: null,
    image_url: null,
    okazu: null,
    erogame: null,
    raw_json: null,
    median: null,
    average: null,
    dispersion: null,
    count: null,
    sellday: null,
    playtime_median_minutes: null,
    source: null,
  });
}

export interface ResolveResult {
  game: EgsGame | null;
  source: 'extlink' | 'search' | null;
}

/**
 * Resolve the EGS game for a VN: returns the cached row if recent, otherwise
 * scans VNDB release extlinks (preferred) or falls back to a name search.
 * Persists the result in `egs_game` (including a `null` for "no match") so
 * cards/library/stats can read it without re-hitting EGS.
 */
export async function resolveEgsForVn(
  vnId: string,
  opts: { force?: boolean; allowSearch?: boolean } = {},
): Promise<ResolveResult> {
  const { force = false, allowSearch = true } = opts;
  const cached = getEgsForVn(vnId);
  if (cached && !force && Date.now() - cached.fetched_at < ROW_TTL_MS) {
    return { game: rowToGame(cached), source: cached.source === 'manual' ? 'extlink' : cached.source };
  }

  let egsId: number | null = null;
  // Synthetic EGS-only VNs encode the EGS id in their vn_id (`egs_1234`) — short-circuit.
  if (vnId.startsWith('egs_')) {
    const parsed = Number(vnId.slice('egs_'.length));
    if (Number.isInteger(parsed) && parsed > 0) egsId = parsed;
  } else {
    try {
      const releases = await getReleasesForVn(vnId);
      for (const r of releases) {
        const candidate = findEgsIdInExtlinks(r.extlinks ?? []);
        if (candidate != null) {
          egsId = candidate;
          break;
        }
      }
    } catch {
      // releases unavailable — leave egsId null and try name search below
    }
  }

  let game: EgsGame | null = null;
  let source: 'extlink' | 'search' | null = null;
  if (egsId != null) {
    // Bypass the per-EGS-id cache too when force is set, so users can re-pull
    // data after EGS publishes updates (median changed, new playtime entries,
    // newly added trailer URL, etc.).
    game = await fetchEgsGame(egsId, { force });
    if (game) source = 'extlink';
  }
  if (!game && allowSearch) {
    const item = getCollectionItem(vnId);
    const probe = item?.alttitle?.trim() || item?.title?.trim();
    if (probe) {
      game = await searchEgsByName(probe, { force });
      if (game) source = 'search';
    }
  }

  if (game && source) {
    persistGame(vnId, game, source);
  } else {
    // Store a negative result so we don't retry every page view.
    persistNoMatch(vnId);
  }
  return { game, source };
}

export function readCachedEgsForVn(vnId: string): EgsGame | null {
  const row = getEgsForVn(vnId);
  if (!row) return null;
  return rowToGame(row);
}

export function clearEgsCache(vnId: string): void {
  clearEgsForVn(vnId);
}

/** Best-effort name search when no VNDB extlink is available. Returns the top hit. */
export async function searchEgsByName(query: string, opts: { force?: boolean } = {}): Promise<EgsGame | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const cacheK = cacheKey('search', trimmed.toLowerCase());
  if (!opts.force) {
    const cached = readCache<EgsGame | null>(cacheK);
    if (cached !== null) return cached;
  }
  const escaped = trimmed.replace(/['%\\]/g, '');
  // Search the native (gamename) and the kana reading (furigana) so romaji /
  // hiragana queries still hit. count2 NULLs are pushed to the bottom by
  // putting "count2 IS NULL" first in the ORDER BY (EGS' Postgres rejects
  // explicit `NULLS LAST` on the SQL form).
  const sql = `
    SELECT id FROM gamelist
    WHERE gamename ILIKE '%${escaped}%' OR furigana ILIKE '%${escaped}%'
    ORDER BY (count2 IS NULL), count2 DESC
    LIMIT 1
  `;
  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return null;
  }
  if (rows.length < 2) {
    writeCache(cacheK, null, 6 * 3600 * 1000);
    return null;
  }
  const id = toNumber(rows[1][0]);
  if (id == null) return null;
  const game = await fetchEgsGame(id, { force: opts.force });
  writeCache(cacheK, game, 12 * 3600 * 1000);
  return game;
}

export interface EgsCandidate {
  id: number;
  gamename: string;
  median: number | null;
  count: number | null;
  sellday: string | null;
}

/** Returns up to `limit` candidates matching the query (for the manual-link picker). */
export async function searchEgsCandidates(query: string, limit = 20): Promise<EgsCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheK = cacheKey('candidates', `${limit}:${trimmed.toLowerCase()}`);
  const cached = readCache<EgsCandidate[]>(cacheK);
  if (cached) return cached;
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const escaped = trimmed.replace(/['%\\]/g, '');
  const sql = `
    SELECT id, gamename, median, count2 AS count, sellday FROM gamelist
    WHERE gamename ILIKE '%${escaped}%' OR furigana ILIKE '%${escaped}%'
    ORDER BY (count2 IS NULL), count2 DESC
    LIMIT ${safeLimit}
  `;
  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return [];
  }
  if (rows.length < 2) {
    writeCache(cacheK, [], 6 * 3600 * 1000);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  const colIdx = (n: string): number => header.indexOf(n);
  const out: EgsCandidate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = toNumber(r[colIdx('id')]);
    if (id == null) continue;
    out.push({
      id,
      gamename: r[colIdx('gamename')] ?? '',
      median: toNumber(r[colIdx('median')]),
      count: toNumber(r[colIdx('count')]),
      sellday: r[colIdx('sellday')] ?? null,
    });
  }
  writeCache(cacheK, out, 12 * 3600 * 1000);
  return out;
}

/** Manually link a VN to a specific EGS game (overrides any previous match). */
export async function linkEgsToVn(vnId: string, egsId: number): Promise<EgsGame | null> {
  const game = await fetchEgsGame(egsId);
  if (!game) return null;
  persistGame(vnId, game, 'manual');
  return game;
}
