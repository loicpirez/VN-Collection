#!/usr/bin/env node
/**
 * R5-203 — live proof that the "Front display / display row /
 * riser" concept is real on `/shelf?view=spatial`: a placed
 * display slot renders as a `<DisplayRow>` carrying the canonical
 * "Vitrine" / "Top display" / "Bottom display" / "Between row"
 * label, visually separated from the normal cell rows by the
 * accent-blue chip + Layers icon.
 *
 * The DB persistence is pinned by `tests/shelf-layout.test.ts`
 * (front-display describe block: 8 tests covering placement,
 * eviction, swap, removal, bounds, resize). This script proves
 * the rendered DOM actually shows the display row when slots are
 * present.
 *
 * Strategy:
 *   1. Read `.qa` to confirm shelf 3 (Etagere 1) has display
 *      slots placed.
 *   2. Navigate to `/shelf?view=spatial&shelf=1` and assert the
 *      rendered HTML contains:
 *        - one of the localised display-row labels (FR/EN/JA)
 *        - the canonical accent-blue chip class chain
 *          (`text-accent-blue` + `Layers` icon presence via
 *          `<svg .* lucide-layers`)
 *        - the display count chip "{n} en vitrine" / "{n} on
 *          display" in the shelf header
 *
 * Usage:
 *   BASE=http://localhost:3100 DB_PATH=$PWD/.qa/data/collection.db \
 *     node scripts/r5-203-shelf-riser.mjs
 */
import process from 'node:process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const DB_PATH = process.env.DB_PATH;
if (!DB_PATH) {
  console.error('R5-203: DB_PATH env var required');
  process.exit(2);
}

function pickShelfWithDisplays() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const row = db.prepare(`
      SELECT s.id, s.order_index, COUNT(d.shelf_id) AS displays
      FROM shelf_unit s LEFT JOIN shelf_display_slot d ON d.shelf_id = s.id
      GROUP BY s.id
      HAVING displays > 0
      ORDER BY s.order_index LIMIT 1
    `).get();
    return /** @type {{id:number; order_index:number; displays:number}} */ (row);
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
  const shelf = pickShelfWithDisplays();
  if (!shelf) {
    console.error('R5-203: no shelf in .qa carries display slots — skipping');
    process.exit(2);
  }
  // /shelf indexes by 1-based shelf number matching the
  // `order_index` column.
  const shelfNum = shelf.order_index + 1;
  console.log(`R5-203 shelf-riser — BASE=${BASE} shelf=${shelfNum} (id=${shelf.id}, displays=${shelf.displays})`);

  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/shelf?view=spatial&shelf=${shelfNum}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const html = await page.content();

  console.log('');
  // ── Display row label ─────────────────────────────────────────
  const labelHits = [
    'Vitrine haute', 'Vitrine basse', 'Entre la rangée',
    'Top display', 'Bottom display', 'Between row',
    'トップ', '下段', 'ディスプレイ',
  ];
  const hasLabel = labelHits.some((l) => html.includes(l));
  assert(
    'R5-203 DisplayRow label is present in the rendered HTML',
    hasLabel,
    `none of: ${labelHits.join('|')}`,
  );

  // ── Accent-blue chip + Layers icon ────────────────────────────
  assert(
    'R5-203 DisplayRow renders the accent-blue marker class chain',
    html.includes('bg-accent-blue/15') && html.includes('text-accent-blue'),
  );
  assert(
    'R5-203 DisplayRow renders the Layers lucide icon',
    /<svg[^>]*class="[^"]*lucide-layers/.test(html),
  );

  // ── Display count chip in header ──────────────────────────────
  assert(
    'R5-203 shelf header includes the display-count chip',
    /\d+\s+(?:en vitrine|on display|ディスプレイ)/.test(html),
  );

  await browser.close();
  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-203: unexpected error:', e);
  process.exit(2);
});
