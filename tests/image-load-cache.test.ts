import { describe, expect, it } from 'vitest';
import { cacheLoadedImage, isImageLoadCached } from '@/lib/image-load-cache';

describe('image load cache', () => {
  it('remembers completed images and refreshes an existing entry', () => {
    cacheLoadedImage('/cache/refresh-a.jpg');
    cacheLoadedImage('/cache/refresh-b.jpg');
    cacheLoadedImage('/cache/refresh-a.jpg');

    expect(isImageLoadCached('/cache/refresh-a.jpg')).toBe(true);
    expect(isImageLoadCached('/cache/refresh-b.jpg')).toBe(true);
  });

  it('evicts the oldest completed image after reaching the session limit', () => {
    for (let index = 0; index <= 500; index += 1) {
      cacheLoadedImage(`/cache/bounded-${index}.jpg`);
    }

    expect(isImageLoadCached('/cache/bounded-0.jpg')).toBe(false);
    expect(isImageLoadCached('/cache/bounded-500.jpg')).toBe(true);
  });
});
