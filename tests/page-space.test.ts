import { describe, expect, it } from 'vitest';
import {
  PAGE_SPACE_PRESET_IDS,
  PAGE_SPACE_SCOPES,
  PAGE_SPACE_SCOPE_DEFAULTS,
  clearPageSpaceOverrides,
  hasPageSpaceOverride,
  isPageSpacePreset,
  pageSpaceStyle,
  resolvePageSpacePreset,
  resolvePageSpaceScope,
  type PageSpaceSettings,
} from '@/lib/page-space';

function settings(pageSpace: PageSpaceSettings['pageSpace'] = {}): PageSpaceSettings {
  return { pageSpace };
}

describe('page-space presets', () => {
  it('exposes a fixed preset order for button controls', () => {
    expect(PAGE_SPACE_PRESET_IDS).toEqual(['compact', 'standard', 'wide', 'canvas']);
  });

  it('validates persisted preset ids', () => {
    expect(isPageSpacePreset('compact')).toBe(true);
    expect(isPageSpacePreset('standard')).toBe(true);
    expect(isPageSpacePreset('wide')).toBe(true);
    expect(isPageSpacePreset('canvas')).toBe(true);
    expect(isPageSpacePreset('fluid')).toBe(false);
    expect(isPageSpacePreset(null)).toBe(false);
  });

  it('falls back to the route-group default without an override', () => {
    expect(resolvePageSpacePreset(settings(), 'vn')).toBe(PAGE_SPACE_SCOPE_DEFAULTS.vn);
    expect(resolvePageSpacePreset(settings(), 'shelf')).toBe(PAGE_SPACE_SCOPE_DEFAULTS.shelf);
  });

  it('uses a valid scope override without leaking to other groups', () => {
    const configured = settings({ vn: 'compact', shelf: 'canvas' });
    expect(resolvePageSpacePreset(configured, 'vn')).toBe('compact');
    expect(resolvePageSpacePreset(configured, 'shelf')).toBe('canvas');
    expect(resolvePageSpacePreset(configured, 'wishlist')).toBe(PAGE_SPACE_SCOPE_DEFAULTS.wishlist);
  });

  it('reports and clears explicit overrides', () => {
    const configured = settings({ compare: 'wide' });
    expect(hasPageSpaceOverride(configured, 'compare')).toBe(true);
    expect(hasPageSpaceOverride(configured, 'wishlist')).toBe(false);
    expect(clearPageSpaceOverrides()).toEqual({});
  });

  it('emits CSS variables for the spacing frame', () => {
    expect(pageSpaceStyle('standard')).toMatchObject({
      '--page-space-max-width': '80rem',
      '--page-space-gutter-base': '0.75rem',
      '--page-space-gutter-sm': '1.5rem',
      '--page-space-gutter-lg': '2rem',
    });
  });

  it('keeps every page-space scope backed by a default', () => {
    for (const scope of PAGE_SPACE_SCOPES) {
      expect(isPageSpacePreset(PAGE_SPACE_SCOPE_DEFAULTS[scope])).toBe(true);
    }
  });
});

describe('resolvePageSpaceScope', () => {
  it.each([
    ['/', 'library'],
    ['/wishlist', 'wishlist'],
    ['/search', 'search'],
    ['/vn/v1', 'vn'],
    ['/release/r1', 'release'],
    ['/staff/s1', 'staff'],
    ['/characters', 'character'],
    ['/character/ch1', 'character'],
    ['/producers', 'producer'],
    ['/producer/p1', 'producer'],
    ['/series/s1', 'series'],
    ['/lists/abc', 'lists'],
    ['/shelf', 'shelf'],
    ['/compare', 'compare'],
    ['/recommendations', 'recommendations'],
    ['/top-ranked', 'topRanked'],
    ['/upcoming', 'upcoming'],
    ['/similar', 'similar'],
    ['/tags', 'tags'],
    ['/tag/g23', 'tags'],
    ['/traits', 'tags'],
    ['/trait/i44', 'tags'],
    ['/data', 'data'],
    ['/schema', 'data'],
    ['/brand-overlap', 'brandOverlap'],
    ['/activity', 'activity'],
    ['/dumped', 'dumped'],
    ['/stats', 'stats'],
    ['/year', 'stats'],
    ['/quotes', 'quotes'],
    ['/steam', 'steam'],
    ['/egs', 'egs'],
    ['/labels', 'labels'],
    ['/unknown', 'library'],
  ] as const)('maps %s to %s', (pathname, scope) => {
    expect(resolvePageSpaceScope(pathname)).toBe(scope);
  });
});
