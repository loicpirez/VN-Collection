/**
 * R5-221 pin: the VN media gallery grid must not allow a single tile
 * to balloon to the full container width.
 *
 * Source-pin only — Playwright covers the runtime bounding-box check
 * in `scripts/media-gallery-focused.mjs`.
 *
 * The previous CSS used `minmax(min(100%, calc(...)), 1fr)` which let
 * `1fr` expand each tile to fill the row when there were fewer tiles
 * than columns. The user saw one screenshot rendered at native
 * resolution because the only tile in its row stretched to ~1280px.
 *
 * The fix clamps the upper bound of `minmax(...)` to a multiple of
 * `--card-density-px` so tiles stay close to the density slider's
 * target width regardless of how many siblings they have.
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

  it('clamps the upper minmax bound (no unbounded 1fr)', () => {
    // The single failure mode that produced full-resolution images:
    // a `minmax(X, 1fr)` grid track that lets a lone tile expand to
    // the entire row width. Forbid the literal `1fr` in the inline
    // grid template.
    const gridSection = SOURCE.split('gridTemplateColumns:')[1] ?? '';
    const upTo = gridSection.split('}')[0] ?? '';
    expect(upTo, 'no unbounded 1fr in the media-gallery grid template').not.toMatch(/\b1fr\b/);
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
