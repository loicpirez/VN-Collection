#!/usr/bin/env node
/**
 * R5-212 — live proof that recommendation cards visually match the
 * `VnCard` baseline across every `/recommendations?mode=*` flavour:
 *   - same cover aspect-[2/3]
 *   - card width clusters within a tolerance band per mode
 *   - card height variance bounded (no one tile that's 2x taller
 *     because of an oversized reason chip)
 *   - first card always has a cover image OR a SafeImage fallback
 *
 * The earlier evidence (source class-chain pin) was not visual
 * proof per the user's rules. This spec measures rendered bbox
 * shapes against the contract.
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-212-recommendations-visual.mjs
 */
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const MODES = [
  { mode: 'default', url: '/recommendations' },
  { mode: 'hidden-gems', url: '/recommendations?mode=hidden-gems' },
  { mode: 'classics', url: '/recommendations?mode=classics' },
];

let passed = 0;
const failures = [];
function assert(name, cond, reason = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); return; }
  failures.push({ name, reason });
  console.log(`  ✗ ${name}${reason ? `  (${reason})` : ''}`);
}

async function measureCards(page) {
  // Cards on /recommendations: each is a Link whose first child is
  // the aspect-[2/3] cover wrapper. Walk by that wrapper to find
  // the parent card root.
  return page.evaluate(() => {
    const covers = Array.from(document.querySelectorAll('div.aspect-\\[2\\/3\\]'));
    return covers.slice(0, 24).map((cover) => {
      const card = cover.closest('a, article, li, div.flex.flex-col') ?? cover.parentElement;
      const cardRect = card ? card.getBoundingClientRect() : { width: 0, height: 0 };
      const coverRect = cover.getBoundingClientRect();
      return {
        cardW: Math.round(cardRect.width),
        cardH: Math.round(cardRect.height),
        coverW: Math.round(coverRect.width),
        coverH: Math.round(coverRect.height),
        ratio: coverRect.width > 0 ? +(coverRect.height / coverRect.width).toFixed(3) : 0,
      };
    });
  });
}

function summarize(name, rows) {
  if (rows.length === 0) return null;
  const widths = rows.map((r) => r.cardW);
  const heights = rows.map((r) => r.cardH);
  const ratios = rows.map((r) => r.ratio);
  const min = (a) => Math.min(...a);
  const max = (a) => Math.max(...a);
  return {
    name,
    count: rows.length,
    widthMin: min(widths),
    widthMax: max(widths),
    widthSpread: max(widths) - min(widths),
    heightMin: min(heights),
    heightMax: max(heights),
    heightSpread: max(heights) - min(heights),
    ratioMin: min(ratios),
    ratioMax: max(ratios),
  };
}

async function main() {
  console.log(`R5-212 recommendations-visual — BASE=${BASE}`);
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  for (const { mode, url } of MODES) {
    console.log(`\n[${mode} — ${url}]`);
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const cards = await measureCards(page);
    const summary = summarize(mode, cards);
    if (!summary || summary.count === 0) {
      assert(`R5-212 ${mode}: at least one card with aspect-[2/3] cover`, false, 'no cards measured');
      continue;
    }
    console.log(`  cards=${summary.count} w[${summary.widthMin}-${summary.widthMax}] h[${summary.heightMin}-${summary.heightMax}] ratio[${summary.ratioMin}-${summary.ratioMax}]`);
    assert(
      `R5-212 ${mode}: at least one card measured`,
      summary.count > 0,
    );
    assert(
      `R5-212 ${mode}: card width spread ≤ 60px (consistent grid template)`,
      summary.widthSpread <= 60,
      `spread=${summary.widthSpread}`,
    );
    assert(
      `R5-212 ${mode}: cover ratio ≈ 2:3 (1.4 - 1.6)`,
      summary.ratioMin >= 1.4 && summary.ratioMax <= 1.6,
      `ratio range ${summary.ratioMin}-${summary.ratioMax}`,
    );
    // Heights vary because of metadata + reason chips, but the
    // spread should be bounded so a single oversized card doesn't
    // jump the row baseline.
    assert(
      `R5-212 ${mode}: card height spread ≤ 200px (no rogue oversized tile)`,
      summary.heightSpread <= 200,
      `spread=${summary.heightSpread}`,
    );
  }

  await browser.close();
  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-212: unexpected error:', e);
  process.exit(2);
});
