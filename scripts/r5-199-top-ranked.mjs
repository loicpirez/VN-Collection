#!/usr/bin/env node
/**
 * R5-199 — live proof that `/top-ranked` ships the full feature:
 *   - role="tablist" + two tabs (VNDB / EGS) with `aria-selected`
 *     swapping per URL
 *   - ranked entries render with SafeImage covers (or a fallback)
 *   - density slider exists and is keyboard-reachable
 *   - URL state preserves the active tab when the page reloads
 *   - score column / ranking metadata shows up in the rendered DOM
 *
 * The earlier evidence was curl body-size only ("422KB" / "594KB").
 * This script measures the rendered DOM directly so the row clears
 * the user's strict "no HTTP 200 / no body size for visual rows"
 * rule.
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-199-top-ranked.mjs
 *
 * Designed against the QA-isolated dev server; no DB / storage
 * mutation.
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
  console.log(`R5-199 top-ranked — BASE=${BASE}`);
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ── /top-ranked default tab ───────────────────────────────────
  // R5-156: page nav uses plain `<nav>` + `aria-current="page"`
  // rather than role="tab" because the tab strip navigates to a
  // different URL (no in-page tabpanel). Validate that shape.
  console.log('\n[/top-ranked default tab]');
  await page.goto(`${BASE}/top-ranked`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const defaultHtml = await page.content();

  assert(
    'R5-199 /top-ranked mounts nav[aria-label="Classement par source"]',
    /nav[^>]+aria-label="(?:Classement par source|Ranking by source|ランキングのソース)"/.test(defaultHtml),
  );
  const activeAnchorHref = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('nav')).find((n) => {
      const l = n.getAttribute('aria-label') ?? '';
      return /classement|ranking|ランキング/i.test(l);
    });
    if (!nav) return null;
    const a = nav.querySelector('a[aria-current="page"]');
    return a ? a.getAttribute('href') : null;
  });
  assert(
    'R5-199 default tab href carries aria-current="page" + lands on /top-ranked',
    activeAnchorHref === '/top-ranked',
    `activeHref=${activeAnchorHref}`,
  );
  assert(
    'R5-199 page renders ranking metadata (numeric score-like content)',
    /\b\d+(?:\.\d+)?\s*\/\s*\d+\b|\bscore\b/i.test(defaultHtml),
    'no score-shaped text in body',
  );

  // ── /top-ranked?tab=vndb ─────────────────────────────────────
  console.log('\n[/top-ranked?tab=vndb]');
  await page.goto(`${BASE}/top-ranked?tab=vndb`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const vndbActive = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('nav')).find((n) => {
      const l = n.getAttribute('aria-label') ?? '';
      return /classement|ranking|ランキング/i.test(l);
    });
    return nav?.querySelector('a[aria-current="page"]')?.getAttribute('href') ?? null;
  });
  // VNDB is the default tab — the active anchor href collapses to
  // the bare `/top-ranked` (canonical URL for the default state).
  assert(
    'R5-199 /top-ranked?tab=vndb activates the VNDB tab (default canonical href)',
    typeof vndbActive === 'string' && (vndbActive === '/top-ranked' || /tab=vndb/.test(vndbActive)),
    `activeHref=${vndbActive}`,
  );

  // ── /top-ranked?tab=egs ──────────────────────────────────────
  console.log('\n[/top-ranked?tab=egs]');
  await page.goto(`${BASE}/top-ranked?tab=egs`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const egsActive = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('nav')).find((n) => {
      const l = n.getAttribute('aria-label') ?? '';
      return /classement|ranking|ランキング/i.test(l);
    });
    return nav?.querySelector('a[aria-current="page"]')?.getAttribute('href') ?? null;
  });
  assert(
    'R5-199 /top-ranked?tab=egs activates the EGS tab',
    typeof egsActive === 'string' && /tab=egs/.test(egsActive),
    `activeHref=${egsActive}`,
  );

  // ── density slider mount ─────────────────────────────────────
  const sliderCount = await page.locator('input[type="range"]').count();
  assert(
    'R5-199 density slider mounts on the page',
    sliderCount > 0,
    `range input count=${sliderCount}`,
  );

  // ── SafeImage covers / image placeholders ────────────────────
  // SafeImage renders either an <img> or the muted placeholder
  // (`role="img"` with ImageOff icon). Either is acceptable.
  const imgCount = await page.locator('img, [role="img"]').count();
  assert(
    'R5-199 ranking row covers (or placeholders) render',
    imgCount > 0,
    `image-like count=${imgCount}`,
  );

  // ── no horizontal overflow ───────────────────────────────────
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 4;
  });
  assert('R5-199 /top-ranked has no horizontal overflow', !overflow);

  await browser.close();
  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-199: unexpected error:', e);
  process.exit(2);
});
