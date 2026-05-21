/**
 * Settings → Display panel — pure-helper coverage for the per-scope
 * density management UI introduced when the single global slider
 * became misleading (scoped overrides per page).
 *
 * The Settings modal mounts the live React panel; here we pin the
 * three pure helpers it depends on so future refactors can't silently
 * break the "follows default" / "reset" / "legacy default preserved"
 * promises the panel makes to the operator.
 *
 *   1. `hasScopeOverride` reports per-scope override presence.
 *   2. `clearAllScopeDensities` returns an empty map (per-scope reset).
 *   3. Resetting per-scope densities must NOT clobber the legacy
 *      `cardDensityPx` — the operator manages that default separately.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_DENSITY_DEFAULT,
  DENSITY_SCOPES,
  clearAllScopeDensities,
  hasScopeOverride,
  type DensityScope,
  type DisplaySettings,
} from '@/lib/settings/client';

function baseSettings(
  overrides: Partial<DisplaySettings> = {},
): Pick<DisplaySettings, 'density' | 'cardDensityPx'> {
  return {
    cardDensityPx: CARD_DENSITY_DEFAULT,
    density: {},
    ...overrides,
  };
}

describe('hasScopeOverride', () => {
  it('returns false when no density map exists', () => {
    expect(hasScopeOverride({ density: undefined as never }, 'library')).toBe(false);
    expect(hasScopeOverride(null, 'library')).toBe(false);
    expect(hasScopeOverride(undefined, 'library')).toBe(false);
  });

  it('returns false when the scope has no override', () => {
    const s = baseSettings({ density: { wishlist: 200 } });
    expect(hasScopeOverride(s, 'library')).toBe(false);
  });

  it('returns true when the scope has a numeric override', () => {
    const s = baseSettings({ density: { library: 180 } });
    expect(hasScopeOverride(s, 'library')).toBe(true);
  });

  it('treats non-finite numbers as absent (so a corrupted blob never tags a row as customised)', () => {
    const s = baseSettings({
      density: { library: Number.NaN as unknown as number },
    });
    expect(hasScopeOverride(s, 'library')).toBe(false);
  });

  it('every canonical scope can be probed without throwing', () => {
    // Smoke test: the panel iterates `DENSITY_SCOPES` and asks the
    // helper for each; we just verify the predicate runs for every
    // known scope on a fresh settings blob.
    for (const scope of DENSITY_SCOPES as readonly DensityScope[]) {
      expect(typeof hasScopeOverride(baseSettings(), scope)).toBe('boolean');
    }
  });
});

describe('clearAllScopeDensities', () => {
  it('produces an empty density map even when input had many overrides', () => {
    const s = baseSettings({
      density: { library: 200, wishlist: 240, search: 180, staffWorks: 320 },
    });
    const cleared = clearAllScopeDensities(s);
    expect(cleared).toEqual({});
  });

  it('returns a fresh object (not aliased to the input map)', () => {
    const input = { library: 200, wishlist: 240 };
    const cleared = clearAllScopeDensities({ density: input });
    cleared.library = 999;
    expect(input.library).toBe(200);
  });

  it('is idempotent on an empty input', () => {
    expect(clearAllScopeDensities({ density: {} })).toEqual({});
    expect(clearAllScopeDensities(null)).toEqual({});
  });
});

describe('per-scope reset never clobbers the legacy default', () => {
  it("clearing density.* keeps `cardDensityPx` untouched (manages the user's preferred default)", () => {
    // Simulate the Settings panel's "Reset all per-page" handler.
    const before: DisplaySettings = {
      hideImages: false,
      blurR18: false,
      nsfwThreshold: 1.5,
      preferLocalImages: true,
      preferNativeTitle: false,
      hideSexual: false,
      denseLibrary: false,
      cardDensityPx: 320,
      density: { library: 200, wishlist: 240 },
      spoilerLevel: 0,
      showSexualTraits: false,
    };
    const after: DisplaySettings = {
      ...before,
      density: clearAllScopeDensities(before),
    };
    expect(after.density).toEqual({});
    // The headline assertion: the operator-chosen default survives.
    expect(after.cardDensityPx).toBe(320);
  });
});
