import 'server-only';
import { isAllowedHttpTarget } from './url-allowlist';
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

/**
 * Strict sanitizer for values that flow into the remote EGS Postgres
 * ILIKE clause. The previous escape stripped only `' % \`; this
 * version keeps a positive allowlist of letters / digits / CJK /
 * basic punctuation that's known-safe inside a quoted LIKE pattern,
 * and drops everything else (including `;`, `--`, `/*`, dollar
 * quotes, control chars).
 *
 * Returns an empty string when nothing usable survives — callers
 * should treat that as "no results" rather than issuing a query
 * with `WHERE … ILIKE '%%'`.
 */
function sanitizeForEgsLike(value: string): string {
  return value
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s.\-_]/gu, '')
    // `_` is a single-character LIKE wildcard in Postgres. Escape it
    // with `\` so a search for `egs_` doesn't over-match `egsX`.
    .replace(/_/g, '\\_')
    .trim();
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

/**
 * Reason an EGS request couldn't complete. Distinguishing them lets the UI
 * tell the user "site is down" vs "you've been throttled" vs "you're blocked".
 *
 *   - "network": DNS failure, connection refused, aborted, timeout.
 *   - "server":  5xx — EGS is up but returning an error.
 *   - "throttled": 429 — rate-limited, back off and retry.
 *   - "blocked": 403 — banned / forbidden, more durable than throttled.
 *
 * A successful query that returned 0 rows is NOT this — that's a real
 * negative answer and is allowed to persist.
 */
export type EgsUnreachableKind = 'network' | 'server' | 'throttled' | 'blocked';

export class EgsUnreachable extends Error {
  readonly kind: EgsUnreachableKind;
  readonly status: number | null;
  constructor(kind: EgsUnreachableKind, detail: string, status: number | null = null) {
    super(`EGS ${kind}: ${detail}`);
    this.name = 'EgsUnreachable';
    this.kind = kind;
    this.status = status;
  }
}

async function fetchTable(sql: string): Promise<string[][]> {
  if (!isAllowedHttpTarget(SQL_ENDPOINT)) {
    throw new EgsUnreachable('blocked', 'host not on SSRF allowlist');
  }
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new EgsUnreachable('network', msg);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new EgsUnreachable('throttled', `HTTP ${res.status}`, res.status);
  if (res.status === 403) throw new EgsUnreachable('blocked', `HTTP ${res.status}`, res.status);
  if (res.status >= 500 || res.status === 0) throw new EgsUnreachable('server', `HTTP ${res.status}`, res.status);
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
function parseEgsIdFromUrl(url: string): number | null {
  const m = url.match(/[?&]game=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Returns the first EGS game id found across the supplied release extlinks. */
function findEgsIdInExtlinks(
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

/**
 * Cover URLs are resolved lazily by `/api/egs-cover/[id]`. The route probes
 * each candidate source (EGS image.php, DMM CDN, Suruga-ya, DLsite, gyutto,
 * banner_url) and redirects to the first one that actually responds with an
 * image — guessing a single CDN here is wrong because the image can live on
 * any of them, or none. Cover URLs stored in `egs_game.image_url` are kept
 * compatible by always pointing at this resolver.
 */
function buildImageUrl(id: number): string {
  return `/api/egs-cover/${id}`;
}

function resolveEgsCoverUrl(_row: Record<string, string | null>, id: number): string {
  return buildImageUrl(id);
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
  // fetchOne re-throws EgsUnreachable so the caller can preserve a
  // previously-good match instead of overwriting with a "no match" placeholder.
  // A successful query that returns 0 rows is the only path that returns null.
  const row = await fetchOne(sql);
  if (!row) {
    writeCache(cacheK, null, 6 * 3600 * 1000);
    return null;
  }

  // Banner / cover image: try banner_url → Suruga-ya shop image → image.php
  // redirector (last resort, often 404s on older games).
  const image_url = resolveEgsCoverUrl(row, id);

  // EGS has no structured synopsis. We used to surface a top user comment as a
  // stand-in but the result was misleading (single user opinion ≠ synopsis), so
  // it's been dropped. EGS-side data is just scores, brand, genre, playtime.
  const playMin = await fetchEgsPlaytimeMedian(id);

  const game: EgsGame = {
    id,
    gamename: (row.gamename ?? '').trim(),
    gamename_furigana: row.furigana ?? null,
    brand_id: toNumber(row.brand_fk_id ?? undefined),
    brand_name: row.brand_name ?? null,
    model: row.model ?? null,
    description: null,
    image_url,
    okazu: toBool(row.okazu ?? undefined),
    erogame: toBool(row.erogame ?? undefined),
    median: toNumber(row.median ?? undefined),
    average: toNumber(row.average2 ?? undefined),
    dispersion: toNumber(row.stdev ?? undefined),
    count: toNumber(row.count2 ?? undefined),
    sellday: row.sellday ?? null,
    playtime_median_minutes: playMin ?? egsHoursToMinutes(row.total_play_time_median ?? undefined),
    url: `${EGS_BASE}/game.php?game=${id}`,
    raw: row,
  };
  writeCache(cacheK, game);
  return game;
}

/**
 * EGS stores all playtime values in HOURS, not minutes. This bit me — the
 * column name doesn't disclose the unit and the values look fine as minutes
 * for short games. Verified empirically:
 *   - v55797 Gals Fiction: VNDB length_minutes=750 (12h30m), EGS=11 → 11h ≈ 12h ✓
 *   - v4327 KaRaKaN: EGS=2 → 2h (plausible for a short fan disc)
 * Multiply at fetch so the rest of the codebase keeps thinking in minutes.
 */
function egsHoursToMinutes(v: string | null | undefined): number | null {
  const n = toNumber(v ?? undefined);
  if (n == null) return null;
  return Math.round(n * 60);
}

async function fetchEgsPlaytimeMedian(gameId: number): Promise<number | null> {
  // userreview.total_play_time is in HOURS. We compute the median across
  // non-null entries client-side then convert to minutes for our internal
  // storage. Filter by `game` (FK) — `id` is the userreview PK.
  const sql = `SELECT total_play_time FROM userreview WHERE game = ${gameId} AND total_play_time IS NOT NULL AND total_play_time > 0 ORDER BY total_play_time`;
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
  const medianHours = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.round(medianHours * 60);
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
    image_url: `/api/egs-cover/${row.egs_id}`,
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
  const synthetic = vnId.startsWith('egs_');
  if (synthetic) {
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
  let unreachable = false;
  if (egsId != null) {
    try {
      // Bypass the per-EGS-id cache too when force is set, so users can re-pull
      // data after EGS publishes updates (median changed, new playtime entries,
      // newly added trailer URL, etc.).
      game = await fetchEgsGame(egsId, { force });
      if (game) source = 'extlink';
    } catch (e) {
      if (e instanceof EgsUnreachable) unreachable = true;
      else throw e;
    }
  }
  if (!game && !unreachable && allowSearch) {
    const item = getCollectionItem(vnId);
    const probe = item?.alttitle?.trim() || item?.title?.trim();
    if (probe) {
      try {
        game = await searchEgsByName(probe, { force });
        if (game) source = 'search';
      } catch (e) {
        if (e instanceof EgsUnreachable) unreachable = true;
        else throw e;
      }
    }
  }

  if (game && source) {
    // Synthetic egs_* entries aren't matched via a VNDB extlink — the EGS id
    // is the id itself. Persist as 'manual' so MatchBadges doesn't falsely
    // attribute the match to VNDB.
    persistGame(vnId, game, synthetic ? 'manual' : source);
    return { game, source };
  }

  // From here on, the new lookup produced no game. Two reasons:
  //   (a) EGS is unreachable — typed EgsUnreachable was caught above.
  //   (b) The query ran cleanly but returned 0 rows.
  // In *both* cases, if we already had a successful match cached, preserve it.
  // Auto-unmatching is too destructive — the data took effort to gather (EGS
  // playtime / scores) and the user can manually unlink if they really want.
  if (cached?.egs_id != null) {
    // "manual" maps to "extlink" externally so the surfaced source stays narrow.
    const fallbackSource: 'extlink' | 'search' | null = cached.source === 'manual'
      ? 'extlink'
      : cached.source ?? null;
    return { game: rowToGame(cached), source: fallbackSource };
  }

  if (unreachable) {
    // Never matched + transient outage: report no match without persisting,
    // so the next attempt (with EGS back) gets a fresh shot.
    return { game: null, source: null };
  }

  // Lookup succeeded, never matched before, still no match — persist the
  // negative so we don't retry on every page view.
  persistNoMatch(vnId);
  return { game, source };
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
  // The query is interpolated directly into a Postgres ILIKE clause
  // on the remote SQL form, so the sanitizer has to be aggressive:
  // drop every character outside the ASCII letters / digits / CJK /
  // whitespace / hyphen / underscore / dot range. This rejects every
  // SQL meta-character (' " ; -- /* % \ ( ) ; etc.) instead of just
  // the four we used to strip.
  const escaped = sanitizeForEgsLike(trimmed);
  if (!escaped) return null;
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
  // Re-throw EgsUnreachable so resolveEgsForVn can preserve a prior match.
  const rows = await fetchTable(sql);
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
  const escaped = sanitizeForEgsLike(trimmed);
  if (!escaped) return [];
  const sql = `
    SELECT id, gamename, median, count2 AS count, sellday FROM gamelist
    WHERE gamename ILIKE '%${escaped}%' OR furigana ILIKE '%${escaped}%'
    ORDER BY (count2 IS NULL), count2 DESC
    LIMIT ${safeLimit}
  `;
  // Let EgsUnreachable propagate to the route handler so the user sees a real
  // error instead of an empty list (which masquerades as "no results").
  const rows = await fetchTable(sql);
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

/** One userreview row pulled from EGS for the configured username. */
export interface EgsUserReviewRow {
  egs_id: number;
  gamename: string;
  /** User's score on the 0-100 scale, null if they haven't voted. */
  tokuten: number | null;
  /** EGS stores playtime in HOURS — multiply by 60 to align with our minutes. */
  total_play_time_hours: number | null;
  start_date: string | null;
  finish_date: string | null;
  timestamp: string | null;
}

/**
 * Every userreview entry for the given EGS username. Used by the EGS sync
 * flow to project the user's hours and scores into the local collection.
 * EGS's `uid` column is the URL-safe username; the user supplies it
 * verbatim. Cached for 30 min — short window because the user usually
 * triggers sync immediately after logging new playtime on EGS.
 */
export async function fetchEgsUserReviews(username: string): Promise<EgsUserReviewRow[]> {
  const trimmed = username.trim();
  if (!trimmed) return [];
  const cacheK = cacheKey('user-reviews', trimmed.toLowerCase());
  const cached = readCache<EgsUserReviewRow[]>(cacheK);
  if (cached) return cached;

  // Username is interpolated into an equality clause. EGS uids are
  // restricted to ASCII letters / digits / underscore on the upstream
  // service; reject anything else outright instead of trying to
  // selectively escape SQL meta-characters.
  if (!/^[A-Za-z0-9_]{1,32}$/.test(trimmed)) return [];
  const escaped = trimmed;
  const sql = `SELECT ur.game AS egs_id, ur.tokuten, ur.total_play_time, `
    + `to_char(ur.start_date,'YYYY-MM-DD') AS start_date, `
    + `to_char(ur.finish_date,'YYYY-MM-DD') AS finish_date, `
    + `to_char(ur.timestamp,'YYYY-MM-DD') AS timestamp, `
    + `g.gamename FROM userreview ur `
    + `LEFT JOIN gamelist g ON g.id = ur.game `
    + `WHERE ur.uid = '${escaped}' ORDER BY ur.timestamp DESC LIMIT 1000`;

  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return [];
  }
  if (rows.length < 2) {
    writeCache(cacheK, [], 30 * 60 * 1000);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  const idx = (n: string): number => header.indexOf(n);
  const out: EgsUserReviewRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = toNumber(r[idx('egs_id')]);
    if (id == null) continue;
    out.push({
      egs_id: id,
      gamename: r[idx('gamename')] ?? '',
      tokuten: toNumber(r[idx('tokuten')]),
      total_play_time_hours: toNumber(r[idx('total_play_time')]),
      start_date: r[idx('start_date')] || null,
      finish_date: r[idx('finish_date')] || null,
      timestamp: r[idx('timestamp')] || null,
    });
  }
  writeCache(cacheK, out, 30 * 60 * 1000);
  return out;
}

/** One row from EGS's anticipated-games list (期待されてるゲーム). */
export interface EgsAnticipated {
  egs_id: number;
  gamename: string;
  brand_name: string | null;
  sellday: string;
  /** Cross-link to VNDB if EGS records one (`v123`); empty otherwise. */
  vndb_id: string | null;
  will_buy: number;
  probably_buy: number;
  watching: number;
}

const ANTICIPATED_TTL_MS = 12 * 3600 * 1000;

/**
 * Upcoming games ranked by EGS users' pre-release purchase intent. EGS
 * stores three labels on `userreview.before_purchase_will`:
 *   - `0_必ず購入`  → "will definitely buy"
 *   - `多分購入`    → "probably buy"
 *   - `様子見`      → "wait and see"
 * The "0_" prefix is a sort-order hack on the EGS side; treat it as the
 * first bucket. We pull the top `limit` games by `will_buy` count among
 * those releasing within the next year.
 *
 * Cached for 12h — counts move slowly and the SQL form is rate-limited.
 */
export async function fetchEgsAnticipated(limit = 100): Promise<EgsAnticipated[]> {
  const safe = Math.min(200, Math.max(5, Math.floor(limit)));
  const cacheK = cacheKey('anticipated', String(safe));
  const cached = readCache<EgsAnticipated[]>(cacheK);
  if (cached) return cached;

  const sql = `SELECT g.id, g.gamename, g.sellday, b.brandname AS brand_name, g.vndb, `
    + `SUM(CASE WHEN ur.before_purchase_will = '0_必ず購入' THEN 1 ELSE 0 END) AS will_buy, `
    + `SUM(CASE WHEN ur.before_purchase_will = '多分購入' THEN 1 ELSE 0 END) AS probably, `
    + `SUM(CASE WHEN ur.before_purchase_will = '様子見' THEN 1 ELSE 0 END) AS watching `
    + `FROM gamelist g LEFT JOIN brandlist b ON g.brandname = b.id `
    + `INNER JOIN userreview ur ON ur.game = g.id `
    + `WHERE g.sellday > current_date AND g.sellday < current_date + 365 `
    + `GROUP BY g.id, g.gamename, g.sellday, b.brandname, g.vndb `
    + `ORDER BY will_buy DESC LIMIT ${safe}`;

  let rows: string[][];
  try {
    rows = await fetchTable(sql);
  } catch {
    return [];
  }
  if (rows.length < 2) {
    writeCache(cacheK, [], ANTICIPATED_TTL_MS);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string): number => header.indexOf(name);
  const out: EgsAnticipated[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = toNumber(r[idx('id')]);
    if (id == null) continue;
    const vndb = r[idx('vndb')]?.trim() ?? '';
    out.push({
      egs_id: id,
      gamename: r[idx('gamename')] ?? '',
      brand_name: r[idx('brand_name')] || null,
      sellday: r[idx('sellday')] ?? '',
      vndb_id: /^v\d+$/.test(vndb) ? vndb : null,
      will_buy: toNumber(r[idx('will_buy')]) ?? 0,
      probably_buy: toNumber(r[idx('probably')]) ?? 0,
      watching: toNumber(r[idx('watching')]) ?? 0,
    });
  }
  writeCache(cacheK, out, ANTICIPATED_TTL_MS);
  return out;
}
