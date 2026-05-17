/**
 * Pin that every shelf-view-prefs CSS variable produced by
 * `buildShelfViewPrefsStyle` is actually consumed by the renderer
 * (`ShelfSpatialView` and the layout editor surface). Without this
 * source-pin, a refactor that drops a `var(--shelf-…)` reference
 * silently leaves an exposed slider doing nothing — exactly the
 * regression the operator reported (`Espace des sections` and
 * `Taille face visible` looked broken).
 *
 * Source-pin only: vitest runs in `environment: 'node'` so we don't
 * mount React. Browser QA exercises the live wiring.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFS = readFileSync(
  join(__dirname, '..', 'src/lib/shelf-view-prefs.ts'),
  'utf8',
);
const SPATIAL = readFileSync(
  join(__dirname, '..', 'src/components/ShelfSpatialView.tsx'),
  'utf8',
);
const READONLY = readFileSync(
  join(__dirname, '..', 'src/components/ShelfReadOnlyControls.tsx'),
  'utf8',
);

/**
 * Variables that BOTH the prefs builder must emit AND the read-only
 * spatial view must consume. These are the ones tied to a visible
 * slider in `ShelfReadOnlyControls`. The layout-editor surface uses
 * a subset (`--shelf-row-gap-px`, `--shelf-cell-w-px`) — it is
 * intentionally simpler because drag-reorder layout has its own
 * placement geometry, so we don't require it to consume every var.
 */
const VAR_TOKENS = [
  '--shelf-cover-scale',
  '--shelf-row-gap-px',
  '--shelf-section-gap-px',
  '--shelf-front-size-px',
  '--shelf-cell-w-px',
  '--shelf-cell-h-px',
] as const;

describe('shelf-view-prefs CSS variables are produced AND consumed', () => {
  for (const token of VAR_TOKENS) {
    it(`${token} is emitted by the prefs style builder`, () => {
      expect(PREFS).toMatch(new RegExp(token.replace(/-/g, '\\-')));
    });

    it(`${token} is referenced by ShelfSpatialView`, () => {
      expect(SPATIAL).toMatch(new RegExp(token.replace(/-/g, '\\-')));
    });
  }

  it('ShelfReadOnlyControls renders a slider for every range-numeric prefs field', () => {
    // Each numeric pref name should appear in the controls component.
    const NUMERIC_PREFS = [
      'cellSizePx',
      'coverScale',
      'gapPx',
      'rowGapPx',
      'sectionGapPx',
      'frontDisplaySizePx',
    ];
    for (const key of NUMERIC_PREFS) {
      expect(READONLY).toContain(key);
    }
  });
});
