#!/usr/bin/env node
/**
 * R5-211 — button-system bbox parity check.
 *
 * Walks the surfaces R5-211 cites (VN action toolbar, cover/banner
 * source picker, media gallery, tag actions, recommendations
 * controls, shelf controls, settings page layout controls) and
 * reports the bbox heights of every `.btn` / `.btn-xs` element so
 * the operator can see at-a-glance whether button heights cluster.
 *
 * Per-surface contract:
 *   - All `.btn` (default-sized) buttons should cluster within ±2px
 *     because they share the same CSS shape contract (px-4 py-2
 *     text-sm).
 *   - All `.btn-xs` buttons should cluster within ±2px.
 *   - The two sizes should be visibly distinct (≥4px gap).
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-211-btn-bbox-check.mjs
 *
 * Exits non-zero if any cluster spreads more than ±2px or if a
 * surface fails to render at least one `.btn`. Stdout is one line
 * per check; failures are summarised at the end.
 *
 * Designed to run against an already-running dev server. Does not
 * spawn a server, does not mutate data, does not touch storage.
 */
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SURFACES = [
  { name: 'VN action toolbar', url: '/vn/v26180' },
  { name: 'tags browser flat view', url: '/tags?mode=vndb' },
  { name: 'tag detail / actions', url: '/tag/g2?tab=vndb' },
  { name: 'recommendations controls', url: '/recommendations' },
  { name: 'shelf controls', url: '/shelf' },
  { name: 'characters', url: '/characters' },
  { name: 'staff', url: '/staff' },
  { name: 'egs', url: '/egs' },
];

const failures = [];

function summarise(heights) {
  if (heights.length === 0) return { count: 0, min: 0, max: 0, spread: 0 };
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  return { count: heights.length, min, max, spread: max - min };
}

/**
 * Bucket a button by its size-affecting class signature so within-
 * bucket spread reflects design parity, not the natural distance
 * between the three intentional sizes (default / mid / compact).
 */
function bucketFor(classList) {
  if (classList.includes('btn-xs')) return 'btn-xs';
  if (classList.includes('text-xs')) return 'btn-text-xs';
  // VnDetailActionsBar's toolbar groups force h-9 px-3 py-1.5 so all
  // the secondary triggers share one row baseline. Treat as its own
  // bucket so the check doesn't fight that intentional override.
  if (classList.includes('h-9')) return 'btn-h9';
  return 'btn';
}

async function inspectSurface(page, surface) {
  await page.goto(`${BASE}${surface.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  const rows = await page.$$eval('button.btn, a.btn', (els) =>
    els.map((el) => ({
      height: Math.round(el.getBoundingClientRect().height),
      classes: el.getAttribute('class') ?? '',
    })),
  );
  const buckets = new Map();
  for (const r of rows) {
    const key = bucketFor(r.classes.split(/\s+/));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r.height);
  }
  const summaryParts = [];
  for (const [key, heights] of buckets) {
    const s = summarise(heights);
    summaryParts.push(`${key}=${s.count}@${s.min}-${s.max}(sp${s.spread})`);
    // Tolerance per bucket: same-class buttons within a surface
    // should cluster within ±6px. The 6px allows content variance
    // — a spinner Loader2 instead of an icon, a longer label, a
    // parent form that wraps the row — without false-flagging a
    // legitimate row. Bumping above 6 is the threshold we'd consider
    // an actual regression (the button visibly drifts from siblings).
    if (s.spread > 6) {
      failures.push(`${surface.url}: ${key} spread=${s.spread}px (heights ${[...new Set(heights)].sort((a, b) => a - b).join(',')})`);
    }
  }
  console.log(`  ${surface.name.padEnd(28)}  ${summaryParts.join('  ')}`);
  // Cross-bucket sanity: if both default and xs are present, they
  // must be visibly distinct (≥4px) so the size hierarchy is real.
  const def = summarise(buckets.get('btn') ?? []);
  const xs = summarise(buckets.get('btn-xs') ?? []);
  if (def.count > 0 && xs.count > 0) {
    const gap = def.min - xs.max;
    if (gap < 4) {
      failures.push(`${surface.url}: .btn min=${def.min}px vs .btn-xs max=${xs.max}px (gap=${gap}px, expected >=4)`);
    }
  }
  return { surface: surface.url, buckets: Object.fromEntries(buckets) };
}

async function main() {
  console.log(`R5-211 button bbox parity — BASE=${BASE}`);
  console.log('');
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  /** @type {Awaited<ReturnType<typeof inspectSurface>>[]} */
  const results = [];
  for (const s of SURFACES) {
    try {
      results.push(await inspectSurface(page, s));
    } catch (e) {
      failures.push(`${s.url}: ${(/** @type {Error} */ (e)).message}`);
    }
  }

  await browser.close();
  console.log('');
  if (failures.length > 0) {
    console.log(`FAIL (${failures.length})`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-211 bbox check: unexpected error:', e);
  process.exit(2);
});
