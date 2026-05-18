/**
 * R5-219 pin: `/upcoming` grid keeps cards readable across all
 * `--card-density-px` values.
 *
 * The previous template was
 *   `minmax(min(100%, var(--card-density-px, 240px)), 1fr)`.
 * Two failure modes:
 *   1. At low density (slider → 120) cards collapse to ~120px wide,
 *      crushing the metadata column next to the 72px cover.
 *   2. `1fr` upper bound lets a sparse row expand each card to fill
 *      the viewport (same regression as MediaGallery R5-221).
 *
 * Fix: floor the lower bound to 280px (sane horizontal-card minimum)
 * and clamp the upper bound to a multiple of the density variable.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/app/upcoming/page.tsx'),
  'utf8',
);

describe('Upcoming grid templates (R5-219)', () => {
  it('floors the column lower bound to a horizontal-card minimum (≥280px)', () => {
    // Both grids must use `max(280px, var(--card-density-px, ...))`
    // as the minmax lower bound so the slider cannot collapse the
    // card width below 280px.
    const matches = SOURCE.match(/max\(280px,\s*var\(--card-density-px,\s*\d+px\)\)/g) ?? [];
    expect(matches.length, 'each upcoming grid must floor to 280px').toBeGreaterThanOrEqual(2);
  });

  it('clamps the column upper bound (no unbounded 1fr)', () => {
    // Capture each `gridTemplateColumns:` value up to the next
    // closing `}` (handles both single-line and multi-line property
    // formatting).
    const gridSections = SOURCE.match(/gridTemplateColumns:[\s\S]*?(?=\}|$)/g) ?? [];
    expect(gridSections.length).toBeGreaterThanOrEqual(2);
    for (const section of gridSections) {
      expect(section, `no unbounded 1fr in upcoming grid: ${section}`).not.toMatch(/\b1fr\b/);
    }
  });

  it('uses the --card-density-px variable as the density source', () => {
    expect(SOURCE).toMatch(/--card-density-px/);
  });
});
