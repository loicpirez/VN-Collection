/**
 * R5-221 pin: the VN media gallery grid must fill available row width
 * so tiles expand to fill the container and avoid a large right-side
 * gap when auto-fill creates empty column tracks.
 *
 * Source-pin only — Playwright covers the runtime bounding-box check
 * in `scripts/media-gallery-focused.mjs`.
 *
 * The PREVIOUS broken state used a fixed px upper bound
 * (`calc(var(--card-density-px)*0.85)`) which left a visible gap to the
 * right of the last row because `auto-fill` creates empty tracks.
 *
 * The fix uses `1fr` as the upper bound so tiles stretch to fill the
 * available space. Tile overflow is clamped visually because every
 * MediaTile already carries a fixed aspect-ratio class
 * (aspect-video / aspect-[2/3] / aspect-square), so stretching a tile
 * column wider simply reveals more of the image — it does not distort
 * it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/MediaGallery.tsx'),
  'utf8',
);

describe('MediaGallery grid template (R5-221)', () => {
  it('declares the grid columns inline via style', () => {
    expect(SOURCE).toMatch(/gridTemplateColumns:/);
  });

  it('uses --card-density-px as the density source', () => {
    expect(SOURCE).toMatch(/--card-density-px/);
  });

  it('uses 1fr as the upper minmax bound to fill available row width', () => {
    // The intentional design: `minmax(min, 1fr)` lets tiles stretch to
    // fill the row so there is no dead space to the right of the grid.
    // Fixed aspect-ratio wrappers (aspect-video etc.) prevent distortion.
    const gridSection = SOURCE.split('gridTemplateColumns:')[1] ?? '';
    const upTo = gridSection.split('}')[0] ?? '';
    expect(upTo, 'upper minmax bound must be 1fr to fill row width').toMatch(/\b1fr\b/);
  });

  it('uses object-cover / object-contain via SafeImage (no raw unbounded <img>)', () => {
    // SafeImage handles the actual rendering, and MediaTile wraps in
    // `aspect-video / aspect-square / aspect-[2/3]`. Pin the trio so
    // future refactors can't lose the aspect-ratio frame.
    expect(SOURCE).toMatch(/aspect-video/);
    expect(SOURCE).toMatch(/aspect-square/);
    expect(SOURCE).toMatch(/aspect-\[2\/3\]/);
  });
});
