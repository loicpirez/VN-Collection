#!/usr/bin/env node
/**
 * R5-208 — live proof that the parent-VN-cover fallback actually
 * renders on `/release/<id>` when the release itself has no images
 * but the parent VN does. The source-pin alone (the `coverSrc =
 * cover?.url ?? parentVnCover?.url ?? null` ternary) is not visual
 * proof per the user's evidence rules.
 *
 * Strategy: walk a random sample of owned releases in `.qa`, visit
 * each `/release/<id>`, and check whether the page rendered the
 * fallback `<figcaption>` carrying `t.releases.parentVnCoverFallback`
 * ("Couverture du VN parent" / "Parent VN cover" / "親VNのカバー").
 * As long as ≥1 release in the sample triggers the fallback path,
 * the row is proven.
 *
 * Usage:
 *   BASE=http://localhost:3100 DB_PATH=$PWD/.qa/data/collection.db \
 *     node scripts/r5-208-release-cover-fallback.mjs
 */
import process from 'node:process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const DB_PATH = process.env.DB_PATH;
if (!DB_PATH) {
  console.error('R5-208: DB_PATH env var required');
  process.exit(2);
}

const FALLBACK_LABELS = [
  'Couverture du VN parent',
  'Parent VN cover',
  '親VNのカバー',
];

function sampleReleases(n) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return db
      .prepare(`SELECT release_id FROM owned_release WHERE release_id LIKE 'r%' ORDER BY RANDOM() LIMIT ?`)
      .all(n)
      .map((r) => /** @type {{release_id:string}} */ (r).release_id);
  } finally {
    db.close();
  }
}

async function main() {
  const ids = sampleReleases(20);
  console.log(`R5-208 release-cover-fallback — BASE=${BASE} sample=${ids.length}`);

  const browser = await chromium.launch({ headless: true }).catch((e) => {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  let fallbackHits = 0;
  let withImagesHits = 0;
  let blankHits = 0;
  let httpErrors = 0;

  for (const id of ids) {
    try {
      const res = await page.goto(`${BASE}/release/${id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      if (!res || res.status() !== 200) {
        httpErrors += 1;
        continue;
      }
      const html = await page.content();
      const hasFallback = FALLBACK_LABELS.some((l) => html.includes(l));
      const hasReleaseImages = /class="grid gap-3"\s+style="grid-template-columns:\s*repeat\(auto-fill/.test(html);
      const hasNoVisuals = /aria-hidden|noVisuals/.test(html) && !hasFallback && !hasReleaseImages;
      if (hasFallback) fallbackHits += 1;
      else if (hasReleaseImages) withImagesHits += 1;
      else blankHits += 1;
    } catch (e) {
      httpErrors += 1;
    }
  }

  await browser.close();
  console.log('');
  console.log(`releases with parent-VN-cover fallback rendered: ${fallbackHits}`);
  console.log(`releases with their own image grid:               ${withImagesHits}`);
  console.log(`releases with neither (no-visuals branch):         ${blankHits}`);
  console.log(`http errors:                                       ${httpErrors}`);
  console.log('');
  if (fallbackHits === 0) {
    console.log('FAIL — sample did not include any release in the fallback branch.');
    console.log('Re-run with a larger sample, or seed a release that needs the fallback.');
    process.exit(1);
  }
  console.log(`PASS — ${fallbackHits}/${ids.length} releases rendered the parent-VN-cover fallback figcaption.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('r5-208: unexpected error:', e);
  process.exit(2);
});
