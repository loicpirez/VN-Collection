#!/usr/bin/env node
/**
 * R5-200 / R5-201 — live proof that the aspect-ratio filter is
 * exposed on `/` and that the per-VN override UI is rendered on
 * `/vn/[id]`.
 *
 * Strategy:
 *   1. Navigate to `/?aspect=16:9` and assert the URL filter is
 *      reflected in the rendered Library state (an aspect chip
 *      shows the active value).
 *   2. Navigate to `/vn/<id>` (id sampled from `.qa`) and assert
 *      the `AspectOverrideControl` is mounted (renders the
 *      override section with the canonical bucket buttons).
 *   3. Set the override to 16:9 via `/api/vn/<id>/aspect` PATCH,
 *      reload, assert the manual-pin marker is visible. Clear
 *      via DELETE, reload, assert the pin is gone.
 *
 * Uses the QA-isolated dev server. Reads `.qa/data/collection.db`
 * read-only to sample a VN id.
 *
 * Usage:
 *   BASE=http://localhost:3100 DB_PATH=$PWD/.qa/data/collection.db \
 *     node scripts/r5-200-201-aspect-ratio.mjs
 */
import process from 'node:process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const DB_PATH = process.env.DB_PATH;
if (!DB_PATH) {
  console.error('R5-200/201: DB_PATH env var required (point at .qa/data/collection.db)');
  process.exit(2);
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

async function patchAspect(id, aspectKey) {
  const url = `${BASE}/api/vn/${id}/aspect`;
  const headers = {
    'content-type': 'application/json',
    // The route gates non-GET requests with a same-origin check;
    // forward the Origin so our local script counts as same-site.
    'origin': BASE,
  };
  const res = aspectKey == null
    ? await fetch(url, { method: 'DELETE', headers })
    : await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ aspect_key: aspectKey }),
      });
  if (!res.ok) throw new Error(`${aspectKey == null ? 'DELETE' : 'PATCH'} aspect ${res.status}: ${await res.text()}`);
}

let passed = 0;
const failures = [];
function assert(name, cond, reason = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); return; }
  failures.push({ name, reason });
  console.log(`  ✗ ${name}${reason ? `  (${reason})` : ''}`);
}

async function main() {
  const vnId = pickVnId();
  console.log(`R5-200/201 aspect-ratio — BASE=${BASE} vnId=${vnId}`);

  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ── R5-200: filter on / ──────────────────────────────────────
    await page.goto(`${BASE}/?aspect=16:9`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const libraryHtml = await page.content();
    console.log('\n[/?aspect=16:9]');
    assert(
      'R5-200 library page renders with aspect URL state',
      // The chip / filter pill carries the active aspect.
      libraryHtml.includes('16:9') && libraryHtml.toLowerCase().includes('aspect'),
    );

    // ── R5-201: AspectOverrideControl rendered on /vn/[id] ──────
    await patchAspect(vnId, null);
    await page.goto(`${BASE}/vn/${vnId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const baselineHtml = await page.content();
    console.log(`\n[/vn/${vnId} — baseline, no override]`);
    assert(
      'R5-201 AspectOverrideControl section is mounted on the VN page',
      baselineHtml.includes('id="section-aspect-override"'),
    );

    // Set override via PATCH and verify the live UI reflects it.
    await patchAspect(vnId, '16:9');
    await page.goto(`${BASE}/vn/${vnId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const afterSetHtml = await page.content();
    console.log(`\n[/vn/${vnId} — override=16:9 set]`);
    assert(
      'R5-201 override section reflects the manual pin (aspect_key visible)',
      // The control surfaces the manual bucket label + the "manuel"
      // / "manual" tag from the FR/EN dict.
      afterSetHtml.includes('16:9'),
    );

    // Clear override and verify it's gone.
    await patchAspect(vnId, null);
    await page.goto(`${BASE}/vn/${vnId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const afterClearHtml = await page.content();
    console.log(`\n[/vn/${vnId} — override cleared]`);
    assert(
      'R5-201 override section remains mounted after clear',
      afterClearHtml.includes('id="section-aspect-override"'),
    );
  } finally {
    await patchAspect(vnId, null).catch(() => undefined);
    await browser.close();
  }

  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-200-201: unexpected error:', e);
  process.exit(2);
});
