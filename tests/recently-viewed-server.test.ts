import { describe, expect, it } from 'vitest';
import { clearRecentlyViewed, recordRecentlyViewed } from '@/lib/recentlyViewed';

describe('recentlyViewed server guards', () => {
  it('does not access browser storage from exported server-side calls', () => {
    expect(() => {
      recordRecentlyViewed({ id: 'v90059', title: 'Server', poster: null, localPoster: null, sexual: 0 });
      clearRecentlyViewed();
    }).not.toThrow();
  });
});
