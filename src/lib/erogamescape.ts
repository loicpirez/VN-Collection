import 'server-only';
import { db } from './db';

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
  median: number | null;
  average: number | null;
  dispersion: number | null;
  count: number | null;
  sellday: string | null;
  /** Median playtime in minutes if EGS exposes one; null otherwise. */
  playtime_median_minutes: number | null;
  url: string;
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

export async function fetchEgsGame(id: number): Promise<EgsGame | null> {
  const cacheK = cacheKey('game', String(id));
  const cached = readCache<EgsGame | null>(cacheK);
  if (cached !== null) return cached;

  const sql = `SELECT id, gamename, median, average, dispersion, count, sellday FROM gamelist WHERE id = ${id} LIMIT 1`;
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
  const header = rows[0].map((h) => h.trim());
  const data = rows[1];
  const get = (col: string): string | undefined => {
    const idx = header.indexOf(col);
    return idx >= 0 ? data[idx] : undefined;
  };
  const playMin = await fetchEgsPlaytimeMedian(id);
  const game: EgsGame = {
    id,
    gamename: (get('gamename') ?? '').trim(),
    median: toNumber(get('median')),
    average: toNumber(get('average')),
    dispersion: toNumber(get('dispersion')),
    count: toNumber(get('count')),
    sellday: get('sellday') ?? null,
    playtime_median_minutes: playMin,
    url: `${EGS_BASE}/game.php?game=${id}`,
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
