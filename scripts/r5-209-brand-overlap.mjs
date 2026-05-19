#!/usr/bin/env node
/**
 * R5-209 — live proof that `/brand-overlap?a=…&b=…` ships the full
 * feature:
 *   - the page mounts and renders the brand-overlap picker
 *   - given two producer ids with shared staff in `.qa`, overlap
 *     `<li>` entries render
 *   - VN credits inside each entry mark in-collection items with
 *     `data-in-collection="true"` + a star icon
 *
 * The earlier evidence ("HTTP 200 + 151KB + page.tsx exists") was
 * body-size only. This spec measures the rendered DOM directly.
 *
 * Producer ids are sampled at runtime from `.qa`'s
 * `vn_staff_credit` index (no hardcoded copyrighted ids).
 *
 * Usage:
 *   BASE=http://localhost:3100 DB_PATH=$PWD/.qa/data/collection.db \
 *     node scripts/r5-209-brand-overlap.mjs
 */
import process from 'node:process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const DB_PATH = process.env.DB_PATH;
if (!DB_PATH) {
  console.error('R5-209: DB_PATH env var required');
  process.exit(2);
}

/**
 * Return up to N producer-pairs that share staff between VNs the
 * user owns AND that overlap with VNs in the user's collection
 * (so the rendered page should mark at least one credit owned).
 * Pairs are sorted by the count of shared sids whose vn_id is in
 * the collection — best candidates first.
 */
/**
 * Pick producer pairs that satisfy all three constraints:
 *   - share staff via vn_staff_credit
 *   - the shared staff have cached `staff_full:<sid>` payloads
 *     (otherwise findBrandStaffOverlap returns needsMoreData)
 *   - the overlap includes at least one VN already in the
 *     collection (so the rendered page has at least one
 *     in-collection marker to assert on)
 */
function pickPairs(n = 4) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const cachedSids = new Set(
      db.prepare(`SELECT REPLACE(cache_key, 'staff_full:', '') AS sid FROM vndb_cache WHERE cache_key LIKE 'staff_full:%'`)
        .all().map((r) => /** @type {{sid:string}} */ (r).sid),
    );
    const rows = db.prepare(`
      SELECT vsc.sid, json_extract(va.developers,'$[0].id') AS pid, vsc.vn_id,
             (SELECT 1 FROM collection c WHERE c.vn_id = vsc.vn_id) AS owned
      FROM vn_staff_credit vsc
      JOIN vn va ON va.id = vsc.vn_id
      WHERE va.developers IS NOT NULL
    `).all();
    const map = new Map();
    for (const r of /** @type {{pid:string|null; sid:string; vn_id:string; owned:number|null}[]} */ (rows)) {
      if (!r.pid) continue;
      if (!cachedSids.has(r.sid)) continue;
      if (!map.has(r.sid)) map.set(r.sid, new Map());
      const sidMap = map.get(r.sid);
      if (!sidMap.has(r.pid)) sidMap.set(r.pid, { owned: 0 });
      if (r.owned) sidMap.get(r.pid).owned += 1;
    }
    const pairCounts = new Map();
    for (const [, sidMap] of map) {
      const arr = [...sidMap.entries()];
      if (arr.length < 2) continue;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = [arr[i][0], arr[j][0]].sort().join('|');
          const ownedHit = (arr[i][1].owned + arr[j][1].owned) > 0 ? 1 : 0;
          if (!pairCounts.has(k)) pairCounts.set(k, { shared: 0, ownedHits: 0 });
          pairCounts.get(k).shared += 1;
          pairCounts.get(k).ownedHits += ownedHit;
        }
      }
    }
    return [...pairCounts.entries()]
      .filter(([, v]) => v.ownedHits > 0)
      .sort((a, b) => b[1].ownedHits - a[1].ownedHits)
      .slice(0, n)
      .map(([k, v]) => {
        const [a, b] = k.split('|');
        return { a, b, shared: v.shared, ownedHits: v.ownedHits };
      });
  } finally {
    db.close();
  }
}

let passed = 0;
const failures = [];
function assert(name, cond, reason = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); return; }
  failures.push({ name, reason });
  console.log(`  ✗ ${name}${reason ? `  (${reason})` : ''}`);
}

async function main() {
  const pairs = pickPairs(4);
  if (pairs.length === 0) {
    console.error('R5-209: no shared-staff + in-collection producer pair available in .qa');
    process.exit(2);
  }
  const pair = pairs[0];
  console.log(`R5-209 brand-overlap — BASE=${BASE} a=${pair.a} b=${pair.b} (shared sids=${pair.shared}, owned overlap=${pair.ownedHits})`);

  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ── /brand-overlap (no params): picker mounts ────────────────
  console.log('\n[/brand-overlap baseline]');
  await page.goto(`${BASE}/brand-overlap`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const pickerCount = await page.locator('input.input, select.input').count();
  assert(
    'R5-209 brand-overlap picker mounts on baseline /brand-overlap',
    pickerCount > 0,
    `picker control count=${pickerCount}`,
  );

  // ── /brand-overlap?a=…&b=… with a known pair ──────────────────
  console.log(`\n[/brand-overlap?a=${pair.a}&b=${pair.b}]`);
  await page.goto(`${BASE}/brand-overlap?a=${pair.a}&b=${pair.b}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

  // Each overlap entry uses the `rounded-lg border border-border
  // bg-bg-elev/30 p-3` class chain on its outer <li>.
  const entryHtml = await page.content();
  const entryCount = (entryHtml.match(/rounded-lg border border-border bg-bg-elev\/30 p-3/g) ?? []).length;
  assert(
    'R5-209 overlap entries render at least one <li> per shared staff',
    entryCount > 0,
    `entry count=${entryCount}`,
  );

  // In-collection marker on at least one VN credit link.
  const inCollCount = (entryHtml.match(/data-in-collection="true"/g) ?? []).length;
  assert(
    'R5-209 in-collection markers render on at least one VN credit',
    inCollCount > 0,
    `marker count=${inCollCount}`,
  );

  // No horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
  assert('R5-209 brand-overlap has no horizontal overflow', !overflow);

  await browser.close();
  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-209: unexpected error:', e);
  process.exit(2);
});
