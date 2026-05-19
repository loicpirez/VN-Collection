#!/usr/bin/env node
/**
 * R5-210 — live proof that the VN-page section layout setting
 * actually hides + restores sections on `/vn/[id]`. Both the
 * page-level editor (`VnDetailLayout` component) and the Settings
 * modal `VnLayoutPanel` write to the same `app_setting.
 * vn_detail_section_layout_v1` JSON blob, so a single end-to-end
 * verification of "hide → reload → restore → reload" pins both
 * controls' contract.
 *
 * Strategy:
 *   1. PATCH `/api/settings { vn_detail_section_layout_v1: <layout
 *      with `notes` hidden> }`.
 *   2. Navigate Playwright to `/vn/<id>` (id sampled at runtime from
 *      the `.qa` snapshot) and assert the rendered DOM does NOT
 *      contain a `data-vn-section="notes"` (or the section's
 *      `<details>` anchor).
 *   3. PATCH `/api/settings { vn_detail_section_layout_v1: null }`
 *      to restore the default layout.
 *   4. Navigate again and assert the notes section IS present (the
 *      section may render an empty inner panel if the VN has no
 *      notes, but the section container must exist).
 *
 * Uses .qa-isolated dev server. Reads `.qa/data/collection.db`
 * read-only to sample a VN id.
 *
 * Usage:
 *   BASE=http://localhost:3100 DB_PATH=$PWD/.qa/data/collection.db \
 *     node scripts/r5-210-vn-layout-restore.mjs
 */
import process from 'node:process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const DB_PATH = process.env.DB_PATH;

if (!DB_PATH) {
  console.error('R5-210: DB_PATH env var is required (point at .qa/data/collection.db)');
  process.exit(2);
}

const VN_SECTION_IDS = [
  'notes', 'series-suggest', 'routes', 'session-activity', 'relations',
  'vndb-status', 'egs-panel', 'egs-details', 'characters', 'cast', 'staff',
  'tag-overlap', 'similar', 'aspect-override', 'my-editions', 'releases',
  'quotes', 'cover-banner-tools', 'edit-form',
];

function buildHiddenLayout(targetId) {
  const sections = {};
  for (const id of VN_SECTION_IDS) {
    sections[id] = { visible: id !== targetId, collapsedByDefault: false };
  }
  return { order: [...VN_SECTION_IDS], sections };
}

function pickVnId() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const row = db.prepare(`SELECT v.id FROM vn v JOIN collection c ON c.vn_id = v.id WHERE v.id LIKE 'v%' ORDER BY RANDOM() LIMIT 1`).get();
    return /** @type {{id:string}} */ (row).id;
  } finally {
    db.close();
  }
}

async function patch(payload) {
  const res = await fetch(`${BASE}/api/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PATCH /api/settings ${res.status}: ${await res.text()}`);
}

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

async function main() {
  const vnId = pickVnId();
  console.log(`R5-210 vn-layout-restore — BASE=${BASE} vnId=${vnId}`);

  // Pick a section that's always rendered. Try "releases" — present
  // for nearly every VN with a release record in the .qa snapshot.
  const TARGET = 'releases';

  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ── Step 1: hide `releases` via PATCH ────────────────────────
    await patch({ vn_detail_section_layout_v1: buildHiddenLayout(TARGET) });
    console.log(`\n[hide] ${TARGET} via PATCH`);
    await page.goto(`${BASE}/vn/${vnId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const hiddenHtml = await page.content();
    // `<SectionWrapper>` renders each visible section inside
    // `<section id="section-<id>">`. Hidden sections never receive
    // their JSX node, so the id never appears in the rendered HTML.
    assert(
      `R5-210 ${TARGET} section is hidden after PATCH`,
      !hiddenHtml.includes(`id="section-${TARGET}"`),
      'section wrapper still present in HTML',
    );

    // ── Step 2: restore via PATCH null ───────────────────────────
    await patch({ vn_detail_section_layout_v1: null });
    console.log(`\n[restore] vn_detail_section_layout_v1=null (canonical defaults)`);
    await page.goto(`${BASE}/vn/${vnId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const restoredHtml = await page.content();
    assert(
      `R5-210 ${TARGET} section is restored after PATCH null`,
      restoredHtml.includes(`id="section-${TARGET}"`),
      'section wrapper missing from HTML after restore',
    );
  } finally {
    // Always restore the canonical defaults so the QA snapshot
    // doesn't carry test pollution.
    await patch({ vn_detail_section_layout_v1: null }).catch(() => undefined);
    await browser.close();
  }

  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-210: unexpected error:', e);
  process.exit(2);
});
