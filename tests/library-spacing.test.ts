/**
 * Library / listing-grid spacing regression. The previous comfortable
 * mode used `gap-5` which felt loose against the rest of the site
 * (every other listing page used `gap-3`). The audit pinned a 3px /
 * 4px scale: comfortable = `gap-3`, dense = `gap-4`.
 *
 * RTL / SSR rendering is not wired in the repo, so this test does a
 * static grep over the relevant source files — same approach as
 * `tests/vn-detail-collection-gating.test.ts`. The patterns are
 * load-bearing strings inside the Tailwind class list, which JIT
 * resolves at build time; if the class string drifts the regression
 * is visible on the rendered page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('LibraryClient grid spacing', () => {
  const src = read('src/components/LibraryClient.tsx');

  it('comfortable mode uses gap-3 (consistent with every other listing grid)', () => {
    // The ternary in `<ListingGrid>` keys on `dense`; the comfortable
    // branch is the second arm.
    expect(src).toMatch(/dense \? 'grid gap-4' : 'grid gap-3'/);
  });

  it('does not regress to the old gap-5 / gap-3 split', () => {
    expect(src).not.toMatch(/dense \? 'grid gap-3' : 'grid gap-5'/);
  });
});

describe('RecentlyViewedStrip overflow + snap', () => {
  const src = read('src/components/RecentlyViewedStrip.tsx');

  it('declares overflow-x-auto so the strip pans on narrow viewports', () => {
    expect(src).toMatch(/overflow-x-auto/);
  });

  it('opts into scroll-snap-x so each tile snaps cleanly', () => {
    expect(src).toMatch(/snap-x/);
    expect(src).toMatch(/snap-start/);
  });

  it('each tile width scales via the card-density CSS variable, not a hardcoded w-24', () => {
    expect(src).toMatch(/--card-density-px/);
    // Defensive — the legacy fixed width is gone from the rendered
    // class strings (we still mention it in a comment, hence the
    // ` w-24` lookbehind: classes are space-separated in JSX).
    expect(src).not.toMatch(/className=[^"]*\bw-24\b/);
  });
});

describe('MediaGallery thumbnails are density-aware', () => {
  const src = read('src/components/MediaGallery.tsx');

  it('uses the card-density CSS variable for the thumbnail grid floor', () => {
    expect(src).toMatch(/--card-density-px/);
  });

  it('no longer pins minmax(140px, 1fr) (legacy fixed value)', () => {
    expect(src).not.toMatch(/minmax\(140px,/);
  });
});

describe('Dumped progress bar is clamped', () => {
  const src = read('src/app/dumped/page.tsx');

  it('clamps the percentage to [0, 100] so the bar never overflows its track', () => {
    // The clamp pattern below is the contract — Math.max(0, Math.min(100, …)).
    expect(src).toMatch(/Math\.max\(0, Math\.min\(100, rawPct\)\)/);
  });
});
