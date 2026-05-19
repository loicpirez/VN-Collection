#!/usr/bin/env node
/**
 * R5-207 — live proof that the default-Library-view setting is
 * actually applied by `LibraryClient`, AND that explicit URL
 * parameters override the setting.
 *
 * Strategy:
 *   1. PATCH `/api/settings { default_sort: 'title', default_order:
 *      'asc', default_group: 'producer' }` to seed the QA snapshot's
 *      app-setting row.
 *   2. Navigate Playwright to `/` (no query string) and read the
 *      rendered `<select>` values for the sort + group controls;
 *      assert they match the persisted setting.
 *   3. Navigate Playwright to `/?sort=rating&group=status&order=desc`
 *      and assert the controls now reflect the URL params (URL wins
 *      over settings).
 *   4. Restore the defaults to the canonical pristine values
 *      (`updated_at` / `desc` / `none`).
 *
 * The PATCH path is gated by `requireLocalhostOrToken`; the QA dev
 * server runs on localhost so the loopback gate lets us call the
 * route without a token. NO real DB / storage mutation outside the
 * `.qa` snapshot.
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-207-library-defaults.mjs
 */
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
let passed = 0;
const failures = [];

function assert(name, cond, reason = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failures.push({ name, reason });
  console.log(`  ✗ ${name}${reason ? `  (${reason})` : ''}`);
}

async function patchSettings(payload) {
  const res = await fetch(`${BASE}/api/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/settings ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function readControls(page) {
  // Each LibraryClient toolbar `<select>` has an `aria-label`. We
  // pin via the surrounding `<label>` text-content-agnostic shape
  // — the sort select sits inside a `<label>` whose first child
  // span is `t.library.sortBy`; we read the `<select>` directly.
  const sort = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select.input'));
    for (const s of selects) {
      if (s.getAttribute('aria-label') === 'Tri' || s.getAttribute('aria-label') === 'Trier par') {
        return /** @type {HTMLSelectElement} */ (s).value;
      }
    }
    return null;
  });
  const group = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select.input'));
    for (const s of selects) {
      const label = s.getAttribute('aria-label') ?? '';
      if (/grouper/i.test(label) || /group by/i.test(label) || /グループ化/.test(label)) {
        return /** @type {HTMLSelectElement} */ (s).value;
      }
    }
    return null;
  });
  return { sort, group };
}

async function main() {
  console.log(`R5-207 library-defaults — BASE=${BASE}`);
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ── Step 1: seed the QA setting ──────────────────────────────
  await patchSettings({ default_sort: 'title', default_order: 'asc', default_group: 'producer' });
  console.log('\n[seeded defaults] sort=title order=asc group=producer');

  // ── Step 2: visit / with no params → defaults apply ───────────
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  // Wait an extra tick for the client-side defaults useEffect to
  // hydrate the controls (`/api/settings` fetch finishes after the
  // initial render).
  await page.waitForTimeout(1200);
  const baseline = await readControls(page);
  console.log(`\n[/ no params] sort=${baseline.sort} group=${baseline.group}`);
  assert('R5-207 sort control reads default_sort from settings', baseline.sort === 'title');
  assert('R5-207 group control reads default_group from settings', baseline.group === 'producer');

  // ── Step 3: visit /?sort=rating&group=status → URL overrides ──
  await page.goto(`${BASE}/?sort=rating&group=status`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const overridden = await readControls(page);
  console.log(`\n[/?sort=rating&group=status] sort=${overridden.sort} group=${overridden.group}`);
  assert('R5-207 sort URL param overrides default_sort', overridden.sort === 'rating');
  assert('R5-207 group URL param overrides default_group', overridden.group === 'status');

  // ── Step 4: restore canonical pristine defaults ──────────────
  await patchSettings({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' });
  console.log('\n[restored defaults] sort=updated_at order=desc group=none');

  await browser.close();
  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-207: unexpected error:', e);
  process.exit(2);
});
