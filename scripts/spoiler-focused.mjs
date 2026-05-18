#!/usr/bin/env node
/**
 * Focused Playwright check for the SpoilerChip / SpoilerReveal stable-
 * root contract (R5-218). Runs against the isolated `.qa` dev server
 * already started on PORT=3101. Does NOT touch full qa:interactions.
 *
 * Usage:
 *   node scripts/spoiler-focused.mjs
 *
 * Exits 0 on success, 1 on any failure.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3101';
const URLS = ['/vn/v32132', '/vn/v4327', '/character/c69497', '/vn/v5262'];

let pass = 0;
let fail = 0;

function ok(name) { console.log(`✓ ${name}`); pass++; }
function ko(name, why) { console.log(`✗ ${name}\n  ${why}`); fail++; }

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

for (const url of URLS) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

    const hidden = page.locator('[data-spoiler-state="hidden"]').first();
    if ((await hidden.count()) === 0) {
      console.log(`· ${url}: no hidden spoiler — skip`);
      continue;
    }
    // Tag the targeted spoiler with a unique marker so we can survive
    // the SpoilerChip button-→-Link mount swap (the wrapper SPAN is
    // stable in the new design but we still re-find by marker for
    // safety on the SpoilerReveal path too).
    const markerId = `spoiler-target-${Math.random().toString(36).slice(2, 10)}`;
    await hidden.evaluate((el, m) => el.setAttribute('data-qa-target', m), markerId);
    const handle = await page.locator(`[data-qa-target="${markerId}"]`).first().elementHandle();
    if (!handle) {
      ko(`${url} latch handle`, 'elementHandle returned null');
      continue;
    }

    // 1) Hover transitions hidden → transient (or skips to revealed if
    //    global setting already covers this node).
    await handle.hover();
    await page.waitForTimeout(250);
    const hoverState = await handle.getAttribute('data-spoiler-state');
    if (hoverState === 'transient' || hoverState === 'revealed') {
      ok(`${url} hover sets data-spoiler-state=${hoverState}`);
    } else {
      ko(`${url} hover did not reveal`, `state=${hoverState}`);
    }

    // 2) Move away → re-mask (state should NOT stay transient after
    //    pointer leaves IF the chip wasn't clicked yet).
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    const afterLeaveState = await handle.getAttribute('data-spoiler-state');
    if (afterLeaveState === 'hidden' || afterLeaveState === 'revealed') {
      // 'revealed' allowed when the global setting bumped during the
      // visit; the chip would skip the transient phase entirely.
      ok(`${url} pointer-leave re-masks (state=${afterLeaveState})`);
    } else {
      ko(`${url} pointer-leave did not re-mask`, `state=${afterLeaveState}`);
    }

    // 3) Click persists reveal. The wrapper handle is stable so this
    //    works regardless of the inner button→Link unmount inside.
    await page.locator(`[data-qa-target="${markerId}"]`).first().click({ timeout: 10000 });
    await page.waitForTimeout(300);
    const clickState = await page.locator(`[data-qa-target="${markerId}"]`).first().getAttribute('data-spoiler-state').catch(() => null);
    if (clickState === 'revealed') {
      ok(`${url} click persisted state=revealed`);
    } else {
      ko(`${url} click did not persist`, `state=${clickState}`);
    }

    // 4) No block-character placeholder anywhere in the revealed chip.
    const blocks = await page.locator('[data-qa-target] >> text=/█/').count();
    if (blocks === 0) {
      ok(`${url} no block-character placeholder`);
    } else {
      ko(`${url} block-character leak`, `${blocks} matches`);
    }
  } catch (e) {
    ko(`${url}`, String(e && e.message ? e.message : e));
  }
}

await browser.close();
console.log(`\nSpoiler focused: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
