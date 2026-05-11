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
const SQL_ENDPOINT = `${EGS_BASE}/sql_for_erogamer.php`;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 10000;

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

async function fetchCsv(sql: string): Promise<string[][]> {
  const params = new URLSearchParams({ sql, format: 'csv' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SQL_ENDPOINT}?${params}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'vndb-collection/1.0 (personal use)' },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`EGS HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

/**
 * Minimal RFC 4180 CSV parser — handles quoted fields with embedded commas/newlines
 * and "" escaping. EGS uses standard CSV, so this is enough.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (field !== '' || cur.length > 0) {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += c;
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
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
    rows = await fetchCsv(sql);
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

export async function fetchEgsGame(id: number): Promise<EgsGame | null> {
  const cacheK = cacheKey('game', String(id));
  const cached = readCache<EgsGame | null>(cacheK);
  if (cached !== null) return cached;

  // Strategy: SELECT * gives every available column for forward-compatibility.
  // We also LEFT JOIN brandlist via a separate query to keep this tolerant if
  // the JOIN happens to fail on a particular EGS instance.
  let row: Record<string, string | null> | null = null;
  try {
    row = await fetchOne(`SELECT * FROM gamelist WHERE id = ${id} LIMIT 1`);
  } catch {
    row = null;
  }
  if (!row) {
    writeCache(cacheK, null, 6 * 3600 * 1000);
    return null;
  }

  // Brand lookup (best-effort).
  let brandName: string | null = null;
  const brandIdRaw = row.brand ?? row.brand_id ?? null;
  const brandId = brandIdRaw ? toNumber(brandIdRaw) : null;
  if (brandId != null) {
    try {
      const bRow = await fetchOne(`SELECT brandname FROM brandlist WHERE id = ${brandId} LIMIT 1`);
      brandName = bRow?.brandname ?? null;
    } catch {
      brandName = null;
    }
  }

  // Description / synopsis — EGS stores this in a few possible places; try in order.
  let description: string | null = row.comment ?? row.prelude ?? row.outline ?? null;
  if (!description) {
    for (const sql of [
      `SELECT shoukai FROM shoukai_for_game WHERE id = ${id} LIMIT 1`,
      `SELECT introduction FROM gamelist_introduction WHERE id = ${id} LIMIT 1`,
    ]) {
      try {
        const desc = await fetchOne(sql);
        if (desc) {
          description = desc.shoukai ?? desc.introduction ?? null;
          if (description) break;
        }
      } catch {
        // ignore — column/table absent on this EGS instance
      }
    }
  }

  const playMin = await fetchEgsPlaytimeMedian(id);
  const game: EgsGame = {
    id,
    gamename: (row.gamename ?? '').trim(),
    gamename_furigana: row.furigana ?? row.gamename_furigana ?? null,
    brand_id: brandId,
    brand_name: brandName,
    model: row.model ?? null,
    description,
    image_url: buildImageUrl(id),
    okazu: toBool(row.okazu ?? undefined),
    erogame: toBool(row.erogame ?? undefined),
    median: toNumber(row.median ?? undefined),
    average: toNumber(row.average ?? undefined),
    dispersion: toNumber(row.dispersion ?? undefined),
    count: toNumber(row.count ?? undefined),
    sellday: row.sellday ?? null,
    playtime_median_minutes: playMin,
    url: `${EGS_BASE}/game.php?game=${id}`,
    raw: row,
  };
  writeCache(cacheK, game);
  return game;
}

async function fetchEgsPlaytimeMedian(id: number): Promise<number | null> {
  // The user_review_for_game table holds per-user playtime in minutes; we take the median.
  const sql = `SELECT play_time FROM user_review_for_game WHERE id = ${id} AND play_time IS NOT NULL ORDER BY play_time`;
  let rows: string[][];
  try {
    rows = await fetchCsv(sql);
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

  let game: EgsGame | null = null;
  let source: 'extlink' | 'search' | null = null;
  if (egsId != null) {
    game = await fetchEgsGame(egsId);
    if (game) source = 'extlink';
  }
  if (!game && allowSearch) {
    const item = getCollectionItem(vnId);
    const probe = item?.alttitle?.trim() || item?.title?.trim();
    if (probe) {
      game = await searchEgsByName(probe);
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
export async function searchEgsByName(query: string): Promise<EgsGame | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const cacheK = cacheKey('search', trimmed.toLowerCase());
  const cached = readCache<EgsGame | null>(cacheK);
  if (cached !== null) return cached;
  const escaped = trimmed.replace(/['%]/g, '');
  const sql = `SELECT id FROM gamelist WHERE gamename ILIKE '%${escaped}%' ORDER BY count DESC NULLS LAST LIMIT 1`;
  let rows: string[][];
  try {
    rows = await fetchCsv(sql);
  } catch {
    return null;
  }
  if (rows.length < 2) {
    writeCache(cacheK, null, 6 * 3600 * 1000);
    return null;
  }
  const id = toNumber(rows[1][0]);
  if (id == null) return null;
  const game = await fetchEgsGame(id);
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
  const escaped = trimmed.replace(/['%]/g, '');
  const sql = `SELECT id, gamename, median, count, sellday FROM gamelist WHERE gamename ILIKE '%${escaped}%' ORDER BY count DESC NULLS LAST LIMIT ${safeLimit}`;
  let rows: string[][];
  try {
    rows = await fetchCsv(sql);
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
