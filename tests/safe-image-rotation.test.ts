import { describe, expect, it } from 'vitest';
import { buildRotationStyle } from '@/components/SafeImage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pin the pure-CSS rotation-style helper that powers
 * `<SafeImage rotation={…}>`. Cover mode fills the container while
 * contain mode preserves the complete image.
 */
describe('buildRotationStyle', () => {
  it('returns no transform for rotation 0', () => {
    expect(buildRotationStyle(0, 100, 200)).toEqual({});
  });

  it('returns a plain rotate for 180', () => {
    expect(buildRotationStyle(180, 100, 200)).toEqual({ transform: 'rotate(180deg)' });
  });

  it('scales by max(W/H, H/W) in cover mode', () => {
    expect(buildRotationStyle(90, 100, 200)).toEqual({
      transform: 'rotate(90deg) scale(2)',
    });
  });

  it('scales by min(W/H, H/W) in contain mode', () => {
    expect(buildRotationStyle(270, 200, 100, 'contain')).toEqual({
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

describe('SafeImage loading skeleton', () => {
  const source = readFileSync(join(__dirname, '..', 'src/components/SafeImage.tsx'), 'utf8');

  it('keeps a skeleton visible until the image load event fires', () => {
    expect(source).toContain('const [loaded, setLoaded] = useState(false)');
    expect(source).toContain('data-safe-image-skeleton');
    expect(source).toContain('const loadingSkeleton = !loaded ? (');
    expect(source).toContain('loadedUrlsRef.current.add(url)');
    expect(source).toContain('setLoaded(true)');
    expect(source).toContain("loaded ? 'opacity-100' : 'opacity-0'");
  });

  it('unmounts the pulsing skeleton after load instead of hiding an active animation', () => {
    expect(source).not.toContain("loaded ? 'opacity-0' : 'opacity-100'");
  });

  it('resets loaded state when recycled virtualized cells receive a new URL', () => {
    expect(source).toContain('setLoaded(false)');
    expect(source).toContain('setInView(!!priority)');
  });
});

describe('HeroBanner rotation layers', () => {
  const source = readFileSync(join(__dirname, '..', 'src/components/HeroBanner.tsx'), 'utf8');

  it('uses fill scaling for the background and fit scaling for the foreground', () => {
    expect(source).toContain("buildRotationStyle(rotation, containerSize?.w ?? null, containerSize?.h ?? null, 'cover')");
    expect(source).toContain("buildRotationStyle(rotation, containerSize?.w ?? null, containerSize?.h ?? null, 'contain')");
    expect(source).toContain('...coverRotatedStyle');
    expect(source).toContain('style={containRotatedStyle}');
  });
});
