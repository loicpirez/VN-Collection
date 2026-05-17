/**
 * Cross-scope isolation for the card-density setting.
 *
 * Each listing surface mounts `<CardDensitySlider scope=…>` against a
 * separate slot inside `DisplaySettings.density`. The contract: moving
 * the slider on `/staff/[id]` (scope: `staffWorks`) must NEVER change
 * what the Library (`library`) reads, and vice versa. The pure
 * `resolveScopedDensity` already encodes this; this test pins the
 * isolation specifically across the two scopes the spec calls out as
 * the most-frequent confusion case.
 *
 * Run together with the broader scope tests in
 * `density-scopes.test.ts`; this file narrows to the staffWorks /
 * library pair so any future shared-state regression fails fast with
 * a focused, non-noisy diagnostic.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_DENSITY_DEFAULT,
  resolveScopedDensity,
  type DisplaySettings,
} from '@/lib/settings/client';

function fixture(overrides: Partial<DisplaySettings> = {}): Pick<DisplaySettings, 'density' | 'cardDensityPx'> {
  return {
    cardDensityPx: CARD_DENSITY_DEFAULT,
    density: {},
    ...overrides,
  };
}

describe('density.staffWorks is independent from density.library', () => {
  it('setting density.staffWorks does not change density.library readback', () => {
    const settings = fixture({
      cardDensityPx: 220,
      density: { staffWorks: 360 },
    });
    expect(resolveScopedDensity(settings, 'staffWorks')).toBe(360);
    // Library should still read the global fallback — NOT 360.
    expect(resolveScopedDensity(settings, 'library')).toBe(220);
  });

  it('setting density.library does not change density.staffWorks readback', () => {
    const settings = fixture({
      cardDensityPx: 220,
      density: { library: 320 },
    });
    expect(resolveScopedDensity(settings, 'library')).toBe(320);
    expect(resolveScopedDensity(settings, 'staffWorks')).toBe(220);
  });

  it('both scopes can carry distinct values simultaneously', () => {
    const settings = fixture({
      cardDensityPx: 240,
      density: { library: 320, staffWorks: 180 },
    });
    expect(resolveScopedDensity(settings, 'library')).toBe(320);
    expect(resolveScopedDensity(settings, 'staffWorks')).toBe(180);
  });

  it('clearing one scope leaves the other untouched', () => {
    const before = fixture({
      cardDensityPx: 240,
      density: { library: 320, staffWorks: 180 },
    });
    const after = { ...before, density: { library: 320 } };
    expect(resolveScopedDensity(after, 'staffWorks')).toBe(240); // back to fallback
    expect(resolveScopedDensity(after, 'library')).toBe(320); // unchanged
  });
});
