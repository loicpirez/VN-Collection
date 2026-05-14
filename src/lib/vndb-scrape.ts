import 'server-only';
import { db } from './db';

/**
 * Lightweight HTML scraper for vndb.org pages, covering fields the
 * Kana API explicitly Misses (producer relations, tag parent/child DAG,
 * character instances, character voice-actor map).
 *
 * Stays polite: in-process serial queue + 2s gap between requests +
 * 30-day disk cache through the existing `vndb_cache` table.
 *
 * The user explicitly opted in by using the "Download all" feature;
 * results land in the same cache the raw JSON export already streams,
 * so nothing leaves the local box.
 */

const VNDB_WEB = 'https://vndb.org';
const SCRAPE_TTL_MS = 30 * 24 * 3600 * 1000;
const SCRAPE_GAP_MS = 2_000;

const queue: Array<() => void> = [];
let last = 0;
let working = false;

async function nextSlot(): Promise<void> {
  return new Promise((resolve) => {
    const release = () => {
      const elapsed = Date.now() - last;
      const wait = Math.max(0, SCRAPE_GAP_MS - elapsed);
      setTimeout(() => {
        last = Date.now();
        resolve();
      }, wait);
    };
    queue.push(release);
    drain();
  });
}

function drain(): void {
  if (working) return;
  const next = queue.shift();
  if (!next) return;
  working = true;
  Promise.resolve().then(() => {
    next();
  }).finally(() => {
    working = false;
    drain();
  });
}

function key(path: string): string {
  return `scrape:${path}`;
}

interface ScrapeCacheRow {
  body: string;
  fetched_at: number;
}

/**
 * Fetch a vndb.org HTML page. Returns the raw HTML body (string). Cache
 * keyed on `path` (e.g. "/p126") and hits the existing vndb_cache table
 * so the raw-export endpoint dumps it for free.
 *
 * `force` bypasses the 30-day fresh check.
 */
export async function fetchVndbWebHtml(path: string, opts: { force?: boolean } = {}): Promise<string | null> {
  const k = key(path);
  if (!opts.force) {
    const cached = db
      .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ? AND expires_at > ?')
      .get(k, Date.now()) as ScrapeCacheRow | undefined;
    if (cached) return cached.body;
  }

  await nextSlot();
  let html: string;
  try {
    const res = await fetch(`${VNDB_WEB}${path}`, {
      headers: { 'User-Agent': 'vn-collection (local cache builder)' },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(k, html, now, now + SCRAPE_TTL_MS);

  return html;
}

/**
 * Strip HTML entities + collapse whitespace. The scrapers only need raw
 * text, never markup, so this is enough.
 */
export function htmlToText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
