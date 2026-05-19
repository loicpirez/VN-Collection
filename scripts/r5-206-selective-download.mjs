#!/usr/bin/env node
/**
 * R5-206 — live proof that the main Library page (`/`) exposes
 * the selective-download entry point and the modal mounts the
 * SelectiveFullDownload picker (reusing the same logic that
 * `/data` uses).
 *
 * Strategy:
 *   1. Visit `/`, wait for the Library to render.
 *   2. Locate the BulkDownloadButton CTA ("Tout télécharger" /
 *      "Download everything" / equivalent).
 *   3. Click it to open the dropdown picker; assert the three
 *      menu entries — Missing only / Re-download all / Selective
 *      — are rendered.
 *   4. Click "Selective download…", assert the Dialog opens with
 *      the SelectiveFullDownload picker (heading + form
 *      controls). DO NOT actually submit — the row says "no real
 *      storage writes". The full-download POST would write to
 *      `.qa/storage` which is technically allowed, but kicking
 *      the upstream fan-out (VNDB + EGS image fetches) is
 *      flaky/expensive in a focused regression check. We pin the
 *      entrypoint + the picker mount, not the network round-trip.
 *   5. Close the dialog via Escape; assert it's gone.
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-206-selective-download.mjs
 */
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
let passed = 0;
const failures = [];
function assert(name, cond, reason = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); return; }
  failures.push({ name, reason });
  console.log(`  ✗ ${name}${reason ? `  (${reason})` : ''}`);
}

async function main() {
  console.log(`R5-206 selective-download — BASE=${BASE}`);
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  // Let the library stats fetch resolve so `stats.total > 0` and
  // BulkDownloadButton mounts.
  await page.waitForTimeout(1500);

  // ── Step 1: bulk CTA is mounted ───────────────────────────────
  // Pinned via the CloudDownload icon class (`lucide-cloud-download`)
  // inside the .btn — locale-agnostic.
  const cta = page.locator('button.btn:has(svg.lucide-cloud-download)').first();
  const ctaCount = await cta.count();
  console.log('');
  assert('R5-206 BulkDownloadButton CTA mounted on /', ctaCount > 0, `CTA count=${ctaCount}`);
  if (ctaCount === 0) {
    await browser.close();
    process.exit(1);
  }

  // ── Step 2: open the picker ──────────────────────────────────
  await cta.click();
  await page.waitForTimeout(250);
  // The dropdown panel has class `absolute right-0 top-full z-30 mt-1
  // w-64 rounded-lg border border-border bg-bg-card p-2 text-xs`.
  // Each entry is a `<button>` with a bolded label + a `[10px]` hint.
  const panelButtons = await page.locator('div.absolute.z-30 > button').count();
  assert(
    'R5-206 dropdown picker exposes the 3 download modes',
    panelButtons >= 3,
    `panel buttons=${panelButtons}`,
  );

  // ── Step 3: click the Selective option ───────────────────────
  // Pinned via the CheckSquare icon (the third entry).
  const selectiveBtn = page.locator('div.absolute.z-30 > button:has(svg.lucide-square-check-big)').first();
  assert('R5-206 "Selective download…" menu entry is present', (await selectiveBtn.count()) > 0);
  await selectiveBtn.click();
  await page.waitForTimeout(400);

  // ── Step 4: the Dialog opens with the picker mounted ────────
  const dialogCount = await page.locator('[role="dialog"]').count();
  assert('R5-206 selective Dialog mounts as role=dialog', dialogCount > 0);
  // SelectiveFullDownload renders 4+ btn buttons (Select all /
  // Select none / Invert / Submit) and a search input inside the
  // dialog. Pin via the cluster of `.btn` siblings within the
  // dialog body, which exceeds the count of any other modal in
  // the app.
  const dialogBtns = await page.locator('[role="dialog"] button.btn').count();
  const dialogInputs = await page.locator('[role="dialog"] input.input').count();
  assert(
    'R5-206 SelectiveFullDownload picker is mounted inside the dialog',
    dialogBtns >= 3 && dialogInputs >= 1,
    `dialog btns=${dialogBtns} inputs=${dialogInputs}`,
  );

  // ── Step 5: identify all role=dialog nodes for diagnostics ─
  const allDialogs = await page.locator('[role="dialog"]').evaluateAll((els) =>
    els.map((el) => ({
      classes: el.className.slice(0, 120),
      ariaLabel: el.getAttribute('aria-label'),
      labelledBy: el.getAttribute('aria-labelledby'),
      visible: !!el.offsetParent,
    })),
  );
  console.log('  ↳ role=dialog inventory:', JSON.stringify(allDialogs, null, 2));
  // Fire Escape via direct dispatch on document AND window (the
  // Dialog binds on window in a portal; some embed contexts route
  // synthetic events differently).
  await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
  });
  await page.waitForTimeout(800);
  const stillOpen = await page.locator('[role="dialog"]').evaluateAll((els) => els.map((el) => !!el.offsetParent).filter(Boolean).length);
  assert(
    'R5-206 selective dialog hides on Escape',
    stillOpen === 0,
    `${stillOpen} dialog(s) still visible`,
  );

  await browser.close();
  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-206: unexpected error:', e);
  process.exit(2);
});
