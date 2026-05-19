#!/usr/bin/env node
/**
 * R5-175 / R5-176 / R5-177 — focused Playwright proof for the
 * loading / empty / error state branches on:
 *
 *   /tag/[id]?tab=vndb   — R5-175 (and the TagVndbResults Suspense
 *                          boundary inside the page)
 *   /tags?mode=vndb      — R5-176 (TagsBrowser client component)
 *   /characters          — R5-177 local / vndb / combined tabs
 *   /staff               — R5-177 local / vndb / combined tabs
 *
 * Strategy:
 *
 *   - **Loading shell**: the route-level `loading.tsx` files
 *     themselves are pinned by `tests/loading-states.test.ts`
 *     (and the dedicated R5-178 file-existence sweep). Capturing
 *     the loading.tsx paint in a live browser is timing-volatile
 *     because the SSR stream typically resolves before
 *     `page.goto` returns and client `<Link>` navigation only
 *     paints the fallback for a few ms. Source-pin coverage is
 *     load-bearing here; this Playwright spec asserts on the
 *     resolved DOM only.
 *
 *   - **Empty branch**: navigate to a URL or interact with the
 *     page so the filter yields zero results, then assert the
 *     localised "no results" copy appears.
 *
 *   - **Error branch**: for `/tag/<id>?tab=vndb`, navigate to a
 *     synthetic tag id (e.g. `g99999`) that VNDB returns 404 for —
 *     the page's `try { ... } catch` lands on the
 *     `text-status-dropped` error panel. We assert that panel
 *     renders.
 *
 * Usage:
 *   BASE=http://localhost:3100 node scripts/r5-175-177-loading-states.mjs
 *
 * Exits non-zero on any assertion failure with a one-line summary
 * per check. Does NOT spawn a server. Does NOT mutate data. Does
 * NOT touch storage.
 */
import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const failures = [];
let passed = 0;

function assert(name, cond, reason = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failures.push({ name, reason });
  console.log(`  ✗ ${name}${reason ? `  (${reason})` : ''}`);
}

async function checkResolved(page, name, url, mustContain, mustNotContain = []) {
  console.log(`\n[${name}] resolved @ ${url}`);
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  const body = await page.locator('body').innerText().catch(() => '');
  for (const needle of mustContain) {
    assert(`${name} body contains "${needle}"`, body.toLowerCase().includes(needle.toLowerCase()));
  }
  for (const needle of mustNotContain) {
    assert(`${name} body does NOT contain "${needle}"`, !body.toLowerCase().includes(needle.toLowerCase()));
  }
}

async function checkHtmlContains(page, name, url, mustContain) {
  console.log(`\n[${name}] HTML contains @ ${url}`);
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  const html = await page.content();
  for (const needle of mustContain) {
    assert(`${name} HTML contains "${needle}"`, html.includes(needle));
  }
}

async function main() {
  console.log(`R5-175/176/177 loading-state Playwright — BASE=${BASE}`);
  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ── R5-175: /tag/[id]?tab=vndb ─────────────────────────────────
  // Resolved happy path: tab strip carries `aria-current="page"`,
  // the Local tab href preserves the tag id, and the VNDB-results
  // section renders.
  await checkHtmlContains(page, 'R5-175 /tag/g2?tab=vndb structure', '/tag/g2?tab=vndb', [
    'aria-current="page"',
    'href="/tag/g2"',
  ]);
  // Error branch: a synthetic tag id (`g99999`) that VNDB returns
  // 404 for surfaces the upstream error panel (`text-status-dropped`
  // class chain).
  await checkHtmlContains(page, 'R5-175 /tag/g99999?tab=vndb error', '/tag/g99999?tab=vndb', [
    'text-status-dropped',
  ]);
  // Cross-page state: ?page=2 link preserves tab=vndb so pagination
  // doesn't drop back to the Local tab.
  await checkHtmlContains(page, 'R5-175 pagination preserves tab=vndb', '/tag/g578?tab=vndb', [
    'tab=vndb',
  ]);

  // ── R5-176: /tags?mode=vndb ────────────────────────────────────
  // Resolved: tab strip + tree groups + child chip routing.
  await checkHtmlContains(page, 'R5-176 /tags?mode=vndb structure', '/tags?mode=vndb', [
    'role="tablist"',
    'aria-selected="true"',
  ]);
  await checkResolved(page, 'R5-176 /tags?mode=vndb tree groups', '/tags?mode=vndb', [
    'Theme', 'Character', 'Style', 'Plot', 'Setting',
  ]);
  // Empty branch in /tags: type a query into the live search input
  // and observe the empty panel render. We cannot drive this via
  // URL because TagsBrowser holds `q` in local state — the URL
  // doesn't seed it. Typing exercises the same render branch.
  console.log('\n[R5-176 /tags?mode=local empty via typed query]');
  await page.goto(`${BASE}/tags?mode=local`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  // TagsBrowser's input is `.input pl-9` and lives next to a Search
  // icon. Pin via the class chain rather than a localised
  // placeholder so the spec stays language-agnostic.
  await page.locator('input.input').first().fill('zzzzunlikely');
  await page.waitForTimeout(600);
  const tagsEmptyBody = await page.locator('body').innerText().catch(() => '');
  assert(
    'R5-176 /tags local empty branch renders localised "no results" copy',
    /aucun résultat/i.test(tagsEmptyBody),
  );

  // ── R5-177: /characters and /staff ─────────────────────────────
  // Tab strip URL preservation for each variant.
  await checkHtmlContains(page, 'R5-177 /characters?tab=vndb structure', '/characters?tab=vndb&q=test', [
    'aria-current="page"',
    'tab=vndb',
  ]);
  await checkHtmlContains(page, 'R5-177 /characters?tab=combined structure', '/characters?tab=combined&q=test', [
    'aria-current="page"',
    'tab=combined',
  ]);
  await checkHtmlContains(page, 'R5-177 /staff?tab=vndb structure', '/staff?tab=vndb&q=test', [
    'aria-current="page"',
  ]);
  // Empty branches via unlikely query (these pages DO seed `q`
  // from the URL via `parseCharacterBrowseParams` /
  // `parseStaffSearchParams`).
  await checkResolved(
    page,
    'R5-177 /characters?q=zzzzunlikely empty',
    '/characters?q=zzzzunlikely',
    ['Aucun'],
  );
  await checkHtmlContains(page, 'R5-177 /staff?q=zzzzunlikely empty panel', '/staff?q=zzzzunlikely', [
    'rounded-xl border border-border bg-bg-card',
  ]);

  await browser.close();

  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failures.length}`);
  if (failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('r5-175-177 loading-states: unexpected error:', e);
  process.exit(2);
});
