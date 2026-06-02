import 'server-only';
import { db } from './db';
import { isAllowedHttpTarget } from './url-allowlist';
import { safeFetch } from './safe-fetch';

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
const SCRAPE_MAX_RETRY = 3;
/** Base backoff between scrape retries (doubles each attempt: 3s → 6s → 12s). */
const SCRAPE_RETRY_BASE_MS = 3_000;

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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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

  const target = `${VNDB_WEB}${path}`;
  if (!isAllowedHttpTarget(target)) return null;

  // Cap the buffered HTML so a malicious mirror (or a future VNDB
  // accident — e.g. a debug log dumped into the page body) can't OOM
  // the Node process. 8 MiB is generous for any /p<id>, /v<id>, or
  // /c<id> page the scraper currently touches (the regex blocks all
  // run against a handful of KB in practice).
  const MAX_HTML_BYTES = 8 * 1024 * 1024;

  let html: string | null = null;
  for (let attempt = 1; attempt <= SCRAPE_MAX_RETRY; attempt++) {
    if (attempt > 1) {
      await sleep(SCRAPE_RETRY_BASE_MS * (2 ** (attempt - 2)));
    }
    await nextSlot();
    try {
      const res = await safeFetch(target, {
        headers: { 'User-Agent': 'vn-collection (local cache builder)' },
      });
      if (!res.ok) continue;
      const cl = res.headers.get('content-length');
      if (cl && parseInt(cl, 10) > MAX_HTML_BYTES) {
        // Skip ridiculous payloads outright — no point retrying the
        // same response on a different attempt.
        return null;
      }
      // Stream the response into a chunked buffer so a lying or
      // missing Content-Length still hits the cap. `res.text()` would
      // buffer everything before our check fires, defeating the guard.
      const reader = res.body?.getReader();
      if (!reader) continue;
      const chunks: Uint8Array[] = [];
      let total = 0;
      let exceeded = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_HTML_BYTES) {
          exceeded = true;
          try {
            await reader.cancel('cap exceeded');
          } catch {}
          break;
        }
        chunks.push(value);
      }
      if (exceeded) return null;
      html = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
      break;
    } catch {
      // network error — sleep handled at top of loop on next iteration
    }
  }
  if (!html) return null;

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
