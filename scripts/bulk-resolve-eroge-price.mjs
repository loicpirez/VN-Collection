#!/usr/bin/env node
/**
 * Bulk-resolve every collection + wishlist entry against eroge-price.com.
 *
 * Walks the SQLite database directly (better-sqlite3), fires the
 * eroge-price JSON API for each VN, persists the resulting bundle
 * envelope into `vn_stock_provider_status.extras_json`, and logs misses
 * with the reason so the heuristic can be iterated.
 *
 * Pure Node ESM — no TS runner needed. Uses the public eroge-price
 * REST endpoints (`/api/games?q=…`, `/api/games/:id`, `:id/prices`,
 * `:id/priceStats`, `:id/related`) which return clean JSON.
 *
 * Resumable: skip rows that already have a non-empty `eroge_price`
 * extras blob UNLESS `--force` is passed.
 *
 * Usage:
 *   DB_PATH=.qa/data/collection.db node scripts/bulk-resolve-eroge-price.mjs
 *   DB_PATH=.qa/data/collection.db node scripts/bulk-resolve-eroge-price.mjs --force
 *   DB_PATH=.qa/data/collection.db node scripts/bulk-resolve-eroge-price.mjs --only=v90017,v95001
 */
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const FORCE = process.argv.includes('--force');
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='));
const ONLY = ONLY_ARG ? ONLY_ARG.slice('--only='.length).split(',').filter(Boolean) : null;
const DB_PATH = process.env.DB_PATH;
const LOG_PATH = process.env.RESOLVE_LOG ?? '.qa/bulk-resolve-log.jsonl';
const RATE_LIMIT_MS = 1100; // ≥ 1 s between requests
const MAX_CANDIDATES = 6;

if (!DB_PATH) {
  console.error('[bulk-resolve] DB_PATH must be set (e.g. .qa/data/collection.db)');
  process.exit(2);
}
if (!existsSync(DB_PATH)) {
  console.error(`[bulk-resolve] DB not found at ${DB_PATH}`);
  process.exit(2);
}
if (!existsSync(dirname(LOG_PATH))) mkdirSync(dirname(LOG_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Ensure the extras column exists (older prod DBs may not have it).
db.exec(
  `CREATE TABLE IF NOT EXISTS vn_stock_provider_status (
     vn_id      TEXT NOT NULL,
     provider   TEXT NOT NULL,
     status     TEXT NOT NULL,
     message    TEXT,
     fetched_at INTEGER NOT NULL,
     offer_count INTEGER NOT NULL DEFAULT 0,
     blocked_kind TEXT,
     fresh_offers_found INTEGER NOT NULL DEFAULT 0,
     cached_offers_available INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (vn_id, provider)
   );`,
);
const cols = db.prepare(`PRAGMA table_info(vn_stock_provider_status)`).all();
if (!cols.some((c) => c.name === 'extras_json')) {
  db.exec(`ALTER TABLE vn_stock_provider_status ADD COLUMN extras_json TEXT;`);
}

// ────────────────────────────────────────────────────────────────────────────
// Build the work list: collection + wishlist (ulist label=5) merged + deduped.
// ────────────────────────────────────────────────────────────────────────────
const collectionRows = db
  .prepare(
    `SELECT c.vn_id AS id, v.title AS title, v.alttitle AS alttitle
     FROM collection c
     LEFT JOIN vn v ON v.id = c.vn_id
     ORDER BY c.vn_id`,
  )
  .all();

const wishlistRows = [];
const ulistCacheRows = db
  .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /ulist|POST|%'`)
  .all();
for (const row of ulistCacheRows) {
  try {
    const payload = JSON.parse(row.body);
    for (const r of payload.results ?? []) {
      if (!r.id || !(r.labels ?? []).some((l) => l.id === 5)) continue;
      wishlistRows.push({
        id: r.id,
        title: r.vn?.title ?? null,
        alttitle: r.vn?.alttitle ?? null,
      });
    }
  } catch {
    /* skip unparseable cache row */
  }
}

const byId = new Map();
for (const r of [...wishlistRows, ...collectionRows]) {
  if (!r.id) continue;
  byId.set(r.id, r);
}
let work = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
if (ONLY) work = work.filter((r) => ONLY.includes(r.id));

console.log(
  `[bulk-resolve] target: ${work.length} VNs (collection=${collectionRows.length}, wishlist=${wishlistRows.length}, only=${ONLY ? ONLY.length : 'all'})`,
);

// ────────────────────────────────────────────────────────────────────────────
// HTTP layer — full Chrome 148 macOS desktop headers.
// ────────────────────────────────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  referer: 'https://eroge-price.com/',
  origin: 'https://eroge-price.com',
};

async function getJson(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchBundle(epId) {
  const [detail, stats, prices, related] = await Promise.all([
    getJson(`https://eroge-price.com/api/games/${epId}`),
    getJson(`https://eroge-price.com/api/games/${epId}/priceStats`),
    getJson(`https://eroge-price.com/api/games/${epId}/prices`),
    getJson(`https://eroge-price.com/api/games/${epId}/related`),
  ]);
  // Trust the upstream JSON shape — this is a backfill script, not a
  // strict typed parser. If the wire-format ever drifts the panel will
  // surface it on next refresh via the real `parseEp*` paths.
  return {
    epId,
    gameUrl: `https://eroge-price.com/games/${epId}`,
    detail,
    priceStats: stats,
    priceHistory: Array.isArray(prices?.prices) ? prices.prices : Array.isArray(prices) ? prices : [],
    related,
    fetchedAt: Date.now(),
  };
}

async function searchAndFetchAll(query) {
  if (!query?.trim()) return null;
  const url = `https://eroge-price.com/api/games?q=${encodeURIComponent(query.trim())}`;
  let payload;
  try {
    payload = await getJson(url);
  } catch {
    return null;
  }
  const games = Array.isArray(payload?.games) ? payload.games : [];
  if (games.length === 0) return null;
  const top = games.slice(0, MAX_CANDIDATES);
  const bundles = [];
  for (const card of top) {
    const id = typeof card.id === 'number' ? card.id : null;
    if (id == null) continue;
    try {
      const b = await fetchBundle(id);
      if (b?.detail?.id) bundles.push(b);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    } catch {
      /* swallow per-id failure; keep going */
    }
  }
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
// Persist
// ────────────────────────────────────────────────────────────────────────────
const upsertExtras = db.transaction((vnId, payload) => {
  const exists = db
    .prepare(`SELECT 1 FROM vn_stock_provider_status WHERE vn_id = ? AND provider = 'eroge_price' LIMIT 1`)
    .get(vnId);
  if (exists) {
    db.prepare(
      `UPDATE vn_stock_provider_status SET extras_json = ?, fetched_at = ? WHERE vn_id = ? AND provider = 'eroge_price'`,
    ).run(payload, Date.now(), vnId);
  } else {
    db.prepare(
      `INSERT INTO vn_stock_provider_status (vn_id, provider, status, extras_json, fetched_at) VALUES (?, 'eroge_price', 'unknown', ?, ?)`,
    ).run(vnId, payload, Date.now());
  }
});

const peekExtras = db.prepare(
  `SELECT extras_json FROM vn_stock_provider_status WHERE vn_id = ? AND provider = 'eroge_price' LIMIT 1`,
);

// ────────────────────────────────────────────────────────────────────────────
// Walk
// ────────────────────────────────────────────────────────────────────────────
let processed = 0;
let matched = 0;
let missed = 0;
let skipped = 0;
const startedAt = Date.now();

let stop = false;
process.once('SIGINT', () => {
  console.log('\n[bulk-resolve] caught SIGINT — finishing current row…');
  stop = true;
});

for (const row of work) {
  if (stop) break;
  processed++;

  if (!FORCE) {
    const existing = peekExtras.get(row.id);
    if (existing?.extras_json) {
      try {
        const decoded = JSON.parse(existing.extras_json);
        if (decoded?.candidates?.length > 0) {
          skipped++;
          appendFileSync(
            LOG_PATH,
            `${JSON.stringify({ vn_id: row.id, status: 'skip', reason: 'already-resolved' })}\n`,
          );
          continue;
        }
      } catch {
        /* corrupted blob — fall through to a fresh search */
      }
    }
  }

  const query = (row.alttitle ?? row.title ?? '').trim();
  if (!query) {
    missed++;
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({ vn_id: row.id, status: 'miss', reason: 'no-title' })}\n`,
    );
    continue;
  }

  // Try strategies in descending order of preference:
  //   1. Original alttitle (Japanese)
  //   2. alttitle with bracketed edition/release markers stripped
  //   3. Leading clause before any 〜・／| separator
  //   4. The romaji `title` field as a last resort
  let extras = null;
  let triedQuery = query;
  let reason = null;
  try {
    extras = await searchAndFetchAll(query);
  } catch (e) {
    reason = `error:${e.message ?? e}`;
  }
  if (!extras) {
    const cleaned = query.replace(/[【［\[][^】］\]]*[】］\]]\s*/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned && cleaned !== query) {
      try {
        extras = await searchAndFetchAll(cleaned);
        if (extras) triedQuery = cleaned;
      } catch (e) {
        reason ??= `error-cleaned:${e.message ?? e}`;
      }
    }
  }
  if (!extras) {
    const leading = query.split(/[〜・／|]/)[0].trim();
    if (leading && leading !== query) {
      try {
        extras = await searchAndFetchAll(leading);
        if (extras) triedQuery = leading;
      } catch (e) {
        reason ??= `error-leading:${e.message ?? e}`;
      }
    }
  }
  if (!extras && row.title && row.title !== query) {
    try {
      extras = await searchAndFetchAll(row.title);
      if (extras) triedQuery = row.title;
    } catch (e) {
      reason ??= `error-romaji:${e.message ?? e}`;
    }
  }

  if (extras) {
    try {
      upsertExtras(row.id, JSON.stringify(extras));
      matched++;
      appendFileSync(
        LOG_PATH,
        `${JSON.stringify({
          vn_id: row.id,
          status: 'match',
          query: triedQuery,
          count: extras.candidates.length,
          ep_ids: extras.candidates.map((c) => c.epId),
        })}\n`,
      );
    } catch (e) {
      missed++;
      appendFileSync(
        LOG_PATH,
        `${JSON.stringify({ vn_id: row.id, status: 'miss', reason: `persist-failed:${e.message ?? e}` })}\n`,
      );
    }
  } else {
    missed++;
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({
        vn_id: row.id,
        status: 'miss',
        query,
        reason: reason ?? 'no-search-results',
      })}\n`,
    );
  }

  if (processed % 5 === 0 || processed === work.length) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[bulk-resolve] ${processed}/${work.length} · match=${matched} miss=${missed} skip=${skipped} · ${elapsed}s`,
    );
  }

  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
}

console.log(
  `[bulk-resolve] DONE · processed=${processed} match=${matched} miss=${missed} skip=${skipped} log=${LOG_PATH}`,
);
db.close();
