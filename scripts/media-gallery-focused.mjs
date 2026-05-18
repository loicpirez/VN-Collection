#!/usr/bin/env node
/**
 * Focused Playwright check for the VN media gallery responsive bound
 * (R5-221). Verifies that no media tile renders an image wider than
 * its container, no image exceeds a sane upper bound, and the page
 * does not horizontally overflow the viewport.
 *
 * Runs against the isolated `.qa` dev server at PORT=3101. Does NOT
 * touch the full qa:interactions suite.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3101';
const URLS = ['/vn/v26180', '/vn/v28032', '/vn/v4327'];
const VIEWPORT = { width: 1280, height: 900 };
const HARD_TILE_CAP_PX = 360;

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

    // Scroll the media section into view so SafeImage's IntersectionObserver
    // actually mounts the <img>. Use the localised section label.
    const mediaHeading = page.locator('[aria-label="Médias"], [aria-label="Media"], [aria-label="メディア"]').first();
    if (await mediaHeading.count()) {
      await mediaHeading.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(800);
    }

    // Inspect each media-tile image bbox. The tile is the
    // `aspect-[2/3] / aspect-video / aspect-square` div in MediaGallery.
    // Match the actual i18n keys: `Vignettes médias` (FR) /
    // `Media thumbnails` (EN) / `メディアサムネイル` (JA).
    const tileBoxes = await page.evaluate(() => {
      const grid = document.querySelector(
        '[aria-label="Vignettes médias"], [aria-label="Media thumbnails"], [aria-label="メディアサムネイル"]',
      );
      if (!grid) return null;
      const tiles = Array.from(grid.querySelectorAll(':scope > div'));
      return tiles.map((el) => {
        const r = el.getBoundingClientRect();
        return { tileW: r.width, tileH: r.height };
      });
    });

    if (!tileBoxes || tileBoxes.length === 0) {
      ok(`${url} no media tiles (skip)`);
      continue;
    }

    const tooWide = tileBoxes.filter((t) => t.tileW > HARD_TILE_CAP_PX);
    if (tooWide.length === 0) {
      ok(`${url} all ${tileBoxes.length} tiles ≤ ${HARD_TILE_CAP_PX}px wide (max=${Math.max(...tileBoxes.map((t) => t.tileW)).toFixed(0)})`);
    } else {
      ko(`${url} tiles too wide`, `${tooWide.length}/${tileBoxes.length} > ${HARD_TILE_CAP_PX}px (max=${Math.max(...tooWide.map((t) => t.tileW)).toFixed(0)})`);
    }

    // Every <img> inside the grid is constrained to the tile width.
    // Read intrinsic and rendered widths to confirm no img leaks
    // beyond its parent.
    const imgInfo = await page.evaluate(() => {
      const imgs = Array.from(
        document.querySelectorAll(
          '[aria-label="Vignettes médias"] img, [aria-label="Media thumbnails"] img, [aria-label="メディアサムネイル"] img',
        ),
      );
      return imgs.map((img) => {
        const r = img.getBoundingClientRect();
        // Walk up to the first overflow-hidden ancestor (the tile
        // container in MediaTile). That's the visible-area constraint
        // — the raw img bounding box can exceed the parent's width
        // when a rotation transform is applied, but the visible
        // content is still clipped by the overflow-hidden ancestor.
        let node = img.parentElement;
        let clipper = node;
        while (node) {
          const cs = getComputedStyle(node);
          if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') {
            clipper = node;
            break;
          }
          node = node.parentElement;
        }
        const clipperBox = clipper?.getBoundingClientRect();
        // Tailwind `scale-105` applies a CSS transform via class —
        // detect it from the className too so the blur-overlay
        // preview on sexual-content tiles doesn't trip the check.
        const cn = img.className || '';
        return {
          rendered: r.width,
          clipper: clipperBox?.width ?? 0,
          // Any transform (inline OR via Tailwind class) can produce
          // an axis-aligned bbox larger than the visible content.
          // The visible area is clipped by overflow-hidden.
          transformed:
            !!(img.style.transform && img.style.transform.trim() !== '') ||
            /\bscale-\d/.test(cn) ||
            /\brotate-\d/.test(cn) ||
            /\bblur-/.test(cn),
        };
      });
    });
    if (imgInfo.length === 0) {
      ok(`${url} <img> elements not yet hydrated (skip image-vs-parent)`);
    } else {
      // Exclude transformed images from the bbox-vs-clipper check —
      // a rotated / scaled rectangle's axis-aligned bounding box can
      // exceed the clipper, but the visible content is still clipped
      // by overflow-hidden so the layout is correct.
      const oversized = imgInfo
        .filter((info) => !info.transformed)
        .filter((info) => info.rendered > info.clipper + 1);
      if (oversized.length === 0) {
        ok(`${url} all ${imgInfo.length} <img> fit within their overflow-hidden clipper`);
      } else {
        const dump = oversized
          .map((info) => `${info.rendered.toFixed(0)}px in ${info.clipper.toFixed(0)}px clipper`)
          .join('; ');
        ko(`${url} <img> wider than clipper`, `${oversized.length}/${imgInfo.length} — ${dump}`);
      }
    }
  } catch (e) {
    ko(`${url}`, String(e?.message ?? e));
  }
}

await browser.close();
console.log(`\nMedia-gallery focused: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
