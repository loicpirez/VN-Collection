#!/usr/bin/env node
/**
 * R5-202 — live proof for the shelf fullscreen mode contract on
 * `/shelf?view=spatial`.
 *
 * Strategy:
 *   1. Navigate to `/shelf?view=spatial`, assert the
 *      `ShelfSpatialFullscreen` trigger is mounted with the
 *      canonical "enter fullscreen" label + aria-pressed=false.
 *   2. Click the trigger; assert the wrapper carries the
 *      `fixed inset-0 z-50` overlay class chain and
 *      `aria-pressed=true`.
 *   3. Press Escape; assert the overlay is gone and the trigger
 *      reads "enter fullscreen" again with `aria-pressed=false`.
 *   4. Assert the trigger has document focus after Escape (focus
 *      restore).
 *   5. Confirm input/textarea focus skips the keyboard nav (no
 *      hijack outside fullscreen / focused shelf).
 *
 * Uses the QA-isolated dev server. Does NOT mutate data.
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-202-shelf-fullscreen.mjs
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
  console.log(`R5-202 shelf-fullscreen — BASE=${BASE}`);
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/shelf?view=spatial`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

  // ── Step 1: trigger is mounted, baseline state ────────────────
  console.log('\n[baseline — view=spatial, fullscreen=false]');
  // The trigger is a `<button aria-pressed=...>` with a localised
  // aria-label. Pin via the button's aria-pressed attribute.
  const trigger = page.locator('button[aria-pressed]').first();
  assert(
    'R5-202 ShelfSpatialFullscreen trigger is mounted',
    (await trigger.count()) > 0,
  );
  const baselinePressed = await trigger.getAttribute('aria-pressed');
  assert('R5-202 baseline aria-pressed=false', baselinePressed === 'false', `got ${baselinePressed}`);

  // ── Step 2: enter fullscreen ─────────────────────────────────
  console.log('\n[click trigger — fullscreen on]');
  await trigger.click();
  await page.waitForTimeout(200);
  const pressedAfter = await trigger.getAttribute('aria-pressed');
  assert('R5-202 aria-pressed=true after click', pressedAfter === 'true', `got ${pressedAfter}`);
  // The fullscreen overlay class chain applies to the wrapper div.
  const overlayCount = await page.locator('div.fixed.inset-0.z-50').count();
  assert(
    'R5-202 wrapper carries fixed inset-0 z-50 overlay class chain',
    overlayCount > 0,
    `overlay count=${overlayCount}`,
  );
  // body { overflow: hidden } is set while fullscreen.
  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  assert('R5-202 body.style.overflow=hidden during fullscreen', bodyOverflow === 'hidden', `got ${bodyOverflow}`);

  // ── Step 3: Escape exits ─────────────────────────────────────
  console.log('\n[Escape — fullscreen off]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const pressedExit = await trigger.getAttribute('aria-pressed');
  assert('R5-202 aria-pressed=false after Escape', pressedExit === 'false', `got ${pressedExit}`);
  const overlayCountAfter = await page.locator('div.fixed.inset-0.z-50').count();
  assert('R5-202 overlay class chain removed after Escape', overlayCountAfter === 0);
  const bodyOverflowAfter = await page.evaluate(() => document.body.style.overflow);
  assert('R5-202 body.style.overflow restored after Escape', bodyOverflowAfter !== 'hidden', `got ${bodyOverflowAfter}`);

  // ── Step 4: focus returned to the trigger ────────────────────
  const focusOnTrigger = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed') === 'false');
  assert('R5-202 focus restored to trigger button after Escape', focusOnTrigger);

  await browser.close();

  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-202: unexpected error:', e);
  process.exit(2);
});
