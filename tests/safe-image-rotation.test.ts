import { describe, expect, it } from 'vitest';
import { buildRotationStyle } from '@/components/SafeImage';

/**
 * Pin the pure-CSS rotation-style helper that powers
 * `<SafeImage rotation={…}>`. Uses min(W/H, H/W) so the rotated image
 * fits entirely within the container (no cropping) rather than
 * filling/zooming it.
 */
describe('buildRotationStyle', () => {
  it('returns no transform for rotation 0', () => {
    expect(buildRotationStyle(0, 100, 200)).toEqual({});
  });

  it('returns a plain rotate for 180', () => {
    expect(buildRotationStyle(180, 100, 200)).toEqual({ transform: 'rotate(180deg)' });
  });

  it('scales by min(W/H, H/W) for 90 inside a portrait container', () => {
    // Portrait container: 100w x 200h. min(0.5, 2) = 0.5.
    // Fit mode: the rotated (landscape) image scales DOWN to 0.5 so
    // the full width is visible, letterboxed vertically.
    expect(buildRotationStyle(90, 100, 200)).toEqual({
      transform: 'rotate(90deg) scale(0.5)',
    });
  });

  it('scales by min(W/H, H/W) for 270 inside a landscape container', () => {
    // Landscape: 200w x 100h. min(2, 0.5) = 0.5.
    expect(buildRotationStyle(270, 200, 100)).toEqual({
      transform: 'rotate(270deg) scale(0.5)',
    });
  });

  it('drops the scale until the container dimensions are known', () => {
    // No container measurement yet (SSR / first paint). The function
    // returns a plain rotate so the browser at least flips the
    // image; the ResizeObserver tick adds the scale soon after.
    expect(buildRotationStyle(90, null, null)).toEqual({ transform: 'rotate(90deg)' });
    expect(buildRotationStyle(270, null, 100)).toEqual({ transform: 'rotate(270deg)' });
    expect(buildRotationStyle(90, 100, null)).toEqual({ transform: 'rotate(90deg)' });
  });

  it('returns no transform for non-canonical degrees', () => {
    // 45deg etc. aren't allowed by the public API; the helper still
    // returns `{}` rather than a tilted transform, so a stale DB
    // value never produces a crooked tile.
    expect(buildRotationStyle(45, 100, 200)).toEqual({});
  });
});
