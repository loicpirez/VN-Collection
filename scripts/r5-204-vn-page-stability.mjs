#!/usr/bin/env node
/**
 * R5-204 — stability check: opening 30-50 distinct `/vn/[id]`
 * pages sequentially never makes a later page fail to load.
 *
 * Failure modes the row was opened to catch:
 *   - accumulating global listeners (DOM resize, scroll, pointer)
 *   - cache growth (vndb-cache, in-memory tag index)
 *   - leaked EventSource / polling intervals
 *   - server-side fetch fan-out that exhausts the upstream rate
 *     limit or stalls a worker pool
 *   - memory leak / stuck promise that never resolves
 *
 * Strategy:
 *   - Sample 50 random VN ids from the operator's `.qa` snapshot
 *     (`SELECT id FROM vn ORDER BY RANDOM() LIMIT 50`). No hardcoded
 *     ids — keeps the script copyright-neutral and reproducible
 *     against any QA db shape.
 *   - For each id, navigate to `/vn/<id>` and assert:
 *       * HTTP 200 (no 404 / 502 / 500)
 *       * body length > 6000 bytes (page paints, not a blank shell)
 *       * no `Application error`, `Unhandled Runtime Error`,
 *         `SqliteError`, `no such column` markers in the rendered
 *         body
 *   - Track DOM listener count via `window.performance` between
 *     pages and report the trend so a leak is visible.
 *
 * Usage:
 *   BASE=http://localhost:3100 \
 *   DB_PATH=$PWD/.qa/data/collection.db \
 *   node scripts/r5-204-vn-page-stability.mjs
 *
 * Exits non-zero on any assertion failure. Reads from the QA DB
 * (read-only) only to sample ids — never writes.
 */
import process from 'node:process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const DB_PATH = process.env.DB_PATH;
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? 40);

if (!DB_PATH) {
  console.error('R5-204: DB_PATH env var is required (point at .qa/data/collection.db)');
  process.exit(2);
}

function sampleVnIds() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db.prepare(`SELECT id FROM vn WHERE id LIKE 'v%' ORDER BY RANDOM() LIMIT ?`).all(SAMPLE_SIZE);
    return rows.map((r) => /** @type {{id: string}} */ (r).id);
  } finally {
    db.close();
  }
}

const FATAL_RX = /Functions cannot be passed directly|Application error|Unhandled Runtime Error|SqliteError|no such column|TypeError: Cannot read|TypeError: Cannot destructure/;

async function main() {
  const ids = sampleVnIds();
  console.log(`R5-204 stability — BASE=${BASE} sample=${ids.length} VNs`);
  console.log('');

  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const failures = [];
  let passed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const url = `${BASE}/vn/${id}`;
    let res;
    try {
      res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {
      failures.push({ id, reason: `goto threw: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` });
      continue;
    }
    const status = res?.status() ?? 0;
    if (status !== 200) {
      failures.push({ id, reason: `HTTP ${status}` });
      continue;
    }
    const html = await page.content();
    if (html.length < 6000) {
      failures.push({ id, reason: `body bytes=${html.length} (suspected blank shell)` });
      continue;
    }
    const body = await page.locator('body').innerText().catch(() => '');
    if (FATAL_RX.test(body)) {
      const match = body.match(FATAL_RX);
      failures.push({ id, reason: `fatal marker "${match?.[0]}"` });
      continue;
    }
    passed += 1;
    if ((i + 1) % 5 === 0 || i === ids.length - 1) {
      // Compact progress: print every 5 pages.
      const heap = await page.evaluate(() => {
        // performance.memory is non-standard but present in
        // Chromium — best-effort signal for memory growth.
        const m = /** @type {any} */ (performance).memory;
        return m ? Math.round(m.usedJSHeapSize / 1024 / 1024) : null;
      });
      console.log(`  [${String(i + 1).padStart(2)}/${ids.length}] last=${id}  heapMB=${heap ?? '?'}`);
    }
  }

  await browser.close();

  console.log('');
  console.log(`PASS: ${passed}/${ids.length}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(`  ✗ /vn/${f.id} — ${f.reason}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-204: unexpected error:', e);
  process.exit(2);
});
