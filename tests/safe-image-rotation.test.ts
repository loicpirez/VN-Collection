import { describe, expect, it } from 'vitest';
import { buildRotationStyle } from '@/components/SafeImage';

/**
 * Pin the pure-CSS rotation-style helper that powers
 * `<SafeImage rotation={…}>`. The component itself can't be
 * rendered here (Vitest env: node — no DOM, no React DOM), but the
 * style math is the load-bearing part: a 90/270 rotation inside a
 * fixed-aspect container needs to scale up to fill the rotated
 * dimensions, otherwise the rotated image leaves a black strip.
 */
describe('buildRotationStyle', () => {
  it('returns no transform for rotation 0', () => {
    expect(buildRotationStyle(0, 100, 200)).toEqual({});
  });

  it('returns a plain rotate for 180', () => {
    expect(buildRotationStyle(180, 100, 200)).toEqual({ transform: 'rotate(180deg)' });
  });

  it('scales by max(W/H, H/W) for 90 inside a portrait container', () => {
    // Portrait container: 100w x 200h.  H/W = 2, W/H = 0.5.
    // Rotating an image 90deg in this box needs scale(2) to fill.
    expect(buildRotationStyle(90, 100, 200)).toEqual({
      transform: 'rotate(90deg) scale(2)',
    });
  });

  it('scales by max(W/H, H/W) for 270 inside a landscape container', () => {
    // Landscape: 200w x 100h. W/H = 2.
    expect(buildRotationStyle(270, 200, 100)).toEqual({
      transform: 'rotate(270deg) scale(2)',
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
