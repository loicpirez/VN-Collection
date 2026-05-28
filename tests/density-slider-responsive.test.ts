/**
 * Regression pin: `<CardDensitySlider>` and `<GlobalCardDensitySlider>`
 * must shrink gracefully on narrow viewports.
 *
 * slider row used `inline-flex` with a hard-coded `w-28` range input
 * (~112 px) + four 44 px tap-target buttons + a value badge — the row's
 * natural width pushed past a 360 px viewport, forcing a horizontal
 * scrollbar on every detail page that mounted the slider.
 *
 * The fix wraps the container in `flex max-w-full` and makes the range
 * input `min-w-0 flex-1` below `sm:`, plus the buttons and badge are
 * `shrink-0` so the range absorbs the squeeze.
 *
 * These source-pin assertions ensure the responsive treatment is not
 * accidentally reverted to `inline-flex` + fixed-width children in a
 * future refactor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/CardDensitySlider.tsx'),
  'utf8',
);

describe('CardDensitySlider responsive shrink', () => {
  it('uses `flex max-w-full` on both slider containers (not the old inline-flex)', () => {
    // Both `CardDensitySlider` and `GlobalCardDensitySlider` share the
    // same container shape. We count two distinct `flex max-w-full`
    // openings, one per export.
    const matches = SOURCE.match(/flex max-w-full items-center/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('range input is `min-w-0 flex-1` so it absorbs shrink', () => {
    // Without `min-w-0`, a flex item's intrinsic min-width keeps the row
    // wider than the viewport. `flex-1` lets the slider claim leftover
    // horizontal space. `sm:flex-none` restores fixed width on desktop.
    const rangeBlock = SOURCE.match(/type="range"[\s\S]+?className="[^"]+"/g) ?? [];
    expect(rangeBlock.length).toBeGreaterThanOrEqual(2);
    for (const block of rangeBlock) {
      expect(block, `range block missing responsive classes: ${block}`).toMatch(
        /min-w-0 flex-1.*sm:flex-none/s,
      );
    }
  });

  it('range input width scales: w-20 below sm, w-28 at sm+', () => {
    const rangeBlock = SOURCE.match(/type="range"[\s\S]+?className="[^"]+"/g) ?? [];
    for (const block of rangeBlock) {
      expect(block).toMatch(/w-20/);
      expect(block).toMatch(/sm:w-28/);
    }
  });

  it('buttons keep their 44×44 tap target AND become shrink-0 so the row collapses cleanly', () => {
    // `min-h-[44px] min-w-[44px]` is the WCAG 2.5.5 floor; the new
    // `shrink-0` modifier ensures the buttons don't compete with the
    // range input for shrink space.
    const buttonClassMatches = SOURCE.match(/min-h-\[44px\] min-w-\[44px\] shrink-0/g) ?? [];
    // Two slider exports × 3 buttons each = 6 minimum.
    expect(buttonClassMatches.length).toBeGreaterThanOrEqual(6);
  });

  it('label text is hidden below sm so the row fits on tiny phones', () => {
    // The "Densité / Density / 密度" label collapses on mobile (icon
    // alone is still informative + `aria-label` is preserved).
    const labelMatches = SOURCE.match(/<span className="hidden sm:inline">\{t\.cardDensity\.label\}<\/span>/g) ?? [];
    expect(labelMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('px value badge is hidden below sm', () => {
    // The numeric value badge is the easiest thing to drop on a 360px
    // viewport — the slider thumb position already communicates the
    // size visually.
    const pxValueMatches = SOURCE.match(/hidden w-9 shrink-0 text-right text-\[10px\] tabular-nums text-muted sm:inline/g) ?? [];
    expect(pxValueMatches.length).toBeGreaterThanOrEqual(2);
  });
});
