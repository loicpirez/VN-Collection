#!/usr/bin/env node
/**
 * Focused Playwright check for `/upcoming` card density / aspect
 * stability (R5-219). Sweeps the three tab variants and verifies:
 *   - cards stay within sane bounds (≥260px wide, ≤620px wide) at
 *     the default density slider value;
 *   - every cover frame has a 2/3 aspect ratio (height = width *
 *     1.5 within 2px tolerance);
 *   - no horizontal overflow.
 *
 * Runs against the isolated `.qa` dev server at PORT=3101.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3101';
const URLS = ['/upcoming', '/upcoming?tab=all', '/upcoming?tab=anticipated'];
const VIEWPORT = { width: 1280, height: 900 };

async function launchBrowser() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

let pass = 0, fail = 0;
function ok(s) { console.log(`✓ ${s}`); pass++; }
function ko(s, why) { console.log(`✗ ${s}\n  ${why}`); fail++; }

const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();

for (const url of URLS) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

    // Horizontal overflow check
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow <= 2) ok(`${url} no horizontal overflow (${overflow}px)`);
    else ko(`${url} horizontal overflow`, `${overflow}px`);

    // Card width range — exclude wide grid (anticipated) variants
    // separately if needed. Both grids share the same min-floor /
    // max-clamp pattern so the same range applies.
    const cardBoxes = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="upcoming-card"]'));
      return cards.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
    });
    if (cardBoxes.length === 0) {
      ok(`${url} no upcoming cards present (empty / skip)`);
    } else {
      const widths = cardBoxes.map((c) => c.w);
      const min = Math.min(...widths);
      const max = Math.max(...widths);
      // 260 lower bound = 280 (CSS floor) minus a 20px tolerance for
      // gap / padding rounding under various viewports.
      if (min >= 260) {
        ok(`${url} ${cardBoxes.length} cards all ≥ 260px wide (min=${min.toFixed(0)})`);
      } else {
        ko(`${url} some cards too narrow`, `min=${min.toFixed(0)}px (< 260px)`);
      }
      // 620 upper bound = 600 (CSS clamp) + 20px tolerance.
      if (max <= 620) {
        ok(`${url} ${cardBoxes.length} cards all ≤ 620px wide (max=${max.toFixed(0)})`);
      } else {
        ko(`${url} some cards too wide`, `max=${max.toFixed(0)}px (> 620px)`);
      }
    }

    // Cover frame aspect ratio (the shrink-0 div inside UpcomingCard).
    const coverFrames = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="upcoming-card"]'));
      return cards.flatMap((card) => {
        const cover = card.querySelector(':scope > div');
        if (!cover) return [];
        const r = cover.getBoundingClientRect();
        return [{ w: r.width, h: r.height }];
      });
    });
    if (coverFrames.length === 0) {
      ok(`${url} no cover frames (skip aspect check)`);
    } else {
      const offenders = coverFrames.filter((f) => {
        const expectedH = f.w * 1.5;
        return Math.abs(f.h - expectedH) > 2;
      });
      if (offenders.length === 0) {
        ok(`${url} ${coverFrames.length} cover frames within 2/3 aspect (±2px)`);
      } else {
        const dump = offenders.slice(0, 3).map((f) => `${f.w.toFixed(0)}x${f.h.toFixed(0)} (expected ${(f.w * 1.5).toFixed(0)})`).join('; ');
        ko(`${url} ${offenders.length} cover frames off-aspect`, dump);
      }
    }
  } catch (e) {
    ko(`${url}`, String(e?.message ?? e));
  }
}

await browser.close();
console.log(`\nUpcoming focused: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
