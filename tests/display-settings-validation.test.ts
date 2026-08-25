import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  migrateLegacyCardDensity,
  sanitizeDisplaySettings,
} from '@/lib/settings/client';

describe('sanitizeDisplaySettings', () => {
  it('keeps supported fields and clamps persisted numeric values', () => {
    expect(sanitizeDisplaySettings({
      hideImages: true,
      blurR18: false,
      wishlistHideOwned: false,
      showVnMobileLibraryLink: false,
      nsfwThreshold: 99,
      cardDensityPx: 10,
      density: { library: 999, wishlist: 10, injected: 200 },
      pageSpace: { vn: 'compact', shelf: 'canvas', injected: 'wide' },
      spoilerLevel: 2,
      globalPageSpace: 'wide',
    })).toEqual({
      hideImages: true,
      blurR18: false,
      wishlistHideOwned: false,
      showVnMobileLibraryLink: false,
      nsfwThreshold: 2,
      cardDensityPx: CARD_DENSITY_MIN,
      density: { library: CARD_DENSITY_MAX, wishlist: CARD_DENSITY_MIN },
      pageSpace: { vn: 'compact', shelf: 'canvas' },
      spoilerLevel: 2,
      globalPageSpace: 'wide',
    });
  });

  it('drops invalid persisted fields instead of coercing them', () => {
    expect(sanitizeDisplaySettings({
      hideImages: 'true',
      nsfwThreshold: Number.NaN,
      cardDensityPx: '220',
      density: { library: '180' },
      pageSpace: { vn: 'fluid' },
      spoilerLevel: 3,
      globalPageSpace: 'fluid',
    })).toEqual({ density: {}, pageSpace: {} });
    expect(sanitizeDisplaySettings(null)).toEqual({});
    expect(sanitizeDisplaySettings([])).toEqual({});
  });

  it('sanitizes legacy density payloads before migration', () => {
    const { settings, migrated } = migrateLegacyCardDensity({
      cardDensityPx: 999,
      density: { wishlist: Number.POSITIVE_INFINITY },
      pageSpace: { vn: 'wide', shelf: 'invalid' as never },
    }, false);
    expect(migrated).toBe(true);
    expect(settings.cardDensityPx).toBe(CARD_DENSITY_MAX);
    expect(settings.density).toEqual({ library: CARD_DENSITY_MAX });
    expect(settings.pageSpace).toEqual({ vn: 'wide' });
  });
});

describe('display-settings persistence boundaries', () => {
  it('uses the shared sanitizer for cookie and local-storage payloads', () => {
    expect(readFileSync('src/app/layout.tsx', 'utf8')).toContain('sanitizeDisplaySettings(JSON.parse(decodeURIComponent(raw)))');
    expect(readFileSync('src/lib/settings/client.tsx', 'utf8')).toContain('sanitizeDisplaySettings(JSON.parse(raw))');
  });

  it('uses one root visibility state for the VN mobile return and its loader', () => {
    const page = readFileSync('src/app/vn/[id]/page.tsx', 'utf8');
    const loading = readFileSync('src/app/vn/[id]/loading.tsx', 'utf8');
    const styles = readFileSync('src/app/globals.css', 'utf8');
    expect(page.match(/vn-mobile-library-return/g)).toHaveLength(2);
    expect(loading).toContain('vn-mobile-library-return h-11 w-24 md:hidden');
    expect(styles).toContain("html[data-vn-mobile-library-return='hidden'] .vn-mobile-library-return");
  });

  it('constructs proxy agents without an unknown bridge cast', () => {
    const source = readFileSync('src/lib/proxy-fetch.ts', 'utf8');
    expect(source).toContain("import { type Agent } from 'node:http'");
    expect(source).not.toContain('as unknown as Agent');
  });
});
