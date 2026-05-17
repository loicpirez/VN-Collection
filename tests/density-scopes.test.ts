/**
 * Per-surface card-density scopes — pure-helper coverage.
 *
 * Verifies the resolver precedence (URL override > scoped value >
 * global fallback > project default), the per-scope independence,
 * and the one-shot legacy migration that lifts a pre-existing
 * `cardDensityPx` into `density.library` exactly once. The slider
 * UI itself is exercised manually; here we lock the contract that
 * every page reads through.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_DENSITY_DEFAULT,
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  clampCardDensity,
  DENSITY_SCOPES,
  migrateLegacyCardDensity,
  resolveScopedDensity,
  type DisplaySettings,
} from '@/lib/settings/client';

function baseSettings(overrides: Partial<DisplaySettings> = {}): Pick<DisplaySettings, 'density' | 'cardDensityPx'> {
  return {
    cardDensityPx: CARD_DENSITY_DEFAULT,
    density: {},
    ...overrides,
  };
}

describe('resolveScopedDensity', () => {
  it('falls back to the global cardDensityPx when no scope override exists', () => {
    const settings = baseSettings({ cardDensityPx: 240 });
    expect(resolveScopedDensity(settings, 'library')).toBe(240);
    expect(resolveScopedDensity(settings, 'staffWorks')).toBe(240);
  });

  it('reads the scope-specific override when one exists', () => {
    const settings = baseSettings({
      cardDensityPx: 220,
      density: { library: 320, staffWorks: 160 },
    });
    expect(resolveScopedDensity(settings, 'library')).toBe(320);
    expect(resolveScopedDensity(settings, 'staffWorks')).toBe(160);
    // A scope without an override keeps the global fallback.
    expect(resolveScopedDensity(settings, 'recommendations')).toBe(220);
  });

  it('changing one scope does not bleed into others', () => {
    const before = baseSettings({ density: { library: 200 } });
    const after = { ...before, density: { ...before.density, library: 320 } };
    expect(resolveScopedDensity(after, 'library')).toBe(320);
    // Other scopes still resolve through the global fallback.
    expect(resolveScopedDensity(after, 'recommendations')).toBe(CARD_DENSITY_DEFAULT);
    expect(resolveScopedDensity(after, 'wishlist')).toBe(CARD_DENSITY_DEFAULT);
  });

  it('URL override beats both the scoped value and the global fallback', () => {
    const settings = baseSettings({
      cardDensityPx: 220,
      density: { library: 320 },
    });
    expect(resolveScopedDensity(settings, 'library', '180')).toBe(180);
    expect(resolveScopedDensity(settings, 'recommendations', '300')).toBe(300);
  });

  it('URL override is clamped to the supported range', () => {
    const settings = baseSettings();
    expect(resolveScopedDensity(settings, 'library', '50')).toBe(CARD_DENSITY_MIN);
    expect(resolveScopedDensity(settings, 'library', '9999')).toBe(CARD_DENSITY_MAX);
  });

  it('ignores a non-numeric URL override and falls back', () => {
    const settings = baseSettings({ cardDensityPx: 220, density: { library: 320 } });
    expect(resolveScopedDensity(settings, 'library', 'banana')).toBe(320);
    // Empty string treated as absent so a `?density=` toggle clears.
    expect(resolveScopedDensity(settings, 'library', '')).toBe(320);
    expect(resolveScopedDensity(settings, 'library', null)).toBe(320);
  });

  it('resets cleanly when the scoped override is deleted', () => {
    const settings = baseSettings({
      cardDensityPx: 220,
      density: { library: 320, staffWorks: 160 },
    });
    const cleared = { ...settings, density: { staffWorks: 160 } };
    // Library falls back to the global value …
    expect(resolveScopedDensity(cleared, 'library')).toBe(220);
    // … while the other scope is untouched.
    expect(resolveScopedDensity(cleared, 'staffWorks')).toBe(160);
  });

  it('exposes a fixed list of scopes', () => {
    // Locks the public contract — every scope used by a slider must
    // appear in DENSITY_SCOPES so the i18n parity check finds a label.
    expect(DENSITY_SCOPES).toContain('library');
    expect(DENSITY_SCOPES).toContain('wishlist');
    expect(DENSITY_SCOPES).toContain('staffWorks');
    expect(DENSITY_SCOPES.length).toBeGreaterThanOrEqual(16);
  });
});

describe('migrateLegacyCardDensity', () => {
  it('seeds density.library from a pre-existing non-default cardDensityPx', () => {
    const { settings, migrated } = migrateLegacyCardDensity(
      { cardDensityPx: 320 },
      false,
    );
    expect(migrated).toBe(true);
    expect(settings.density.library).toBe(320);
    // Global value stays as-is so future scopes still fall back to it.
    expect(settings.cardDensityPx).toBe(320);
  });

  it('does not migrate when alreadyMigrated is true', () => {
    const { settings, migrated } = migrateLegacyCardDensity(
      { cardDensityPx: 320 },
      true,
    );
    expect(migrated).toBe(false);
    expect(settings.density.library).toBeUndefined();
  });

  it('does not migrate when density.library already exists', () => {
    const { settings, migrated } = migrateLegacyCardDensity(
      { cardDensityPx: 320, density: { library: 200 } },
      false,
    );
    expect(migrated).toBe(false);
    // Pre-existing scoped value is preserved.
    expect(settings.density.library).toBe(200);
  });

  it('does not migrate when cardDensityPx matches the project default', () => {
    // Default-equal values are indistinguishable from "never customised",
    // so the migration would be a no-op anyway; the explicit check keeps
    // the storage write minimal.
    const { settings, migrated } = migrateLegacyCardDensity(
      { cardDensityPx: CARD_DENSITY_DEFAULT },
      false,
    );
    expect(migrated).toBe(false);
    expect(settings.density.library).toBeUndefined();
  });

  it('preserves other density entries when migrating', () => {
    const { settings, migrated } = migrateLegacyCardDensity(
      {
        cardDensityPx: 300,
        density: { staffWorks: 160 },
      },
      false,
    );
    expect(migrated).toBe(true);
    expect(settings.density.library).toBe(300);
    expect(settings.density.staffWorks).toBe(160);
  });

  it('produces a clean DisplaySettings even when input is sparse', () => {
    const { settings } = migrateLegacyCardDensity({}, false);
    // No accidental shape drift — defaults fill in.
    expect(settings.cardDensityPx).toBe(CARD_DENSITY_DEFAULT);
    expect(settings.density).toEqual({});
  });
});

describe('clampCardDensity', () => {
  it('clamps below CARD_DENSITY_MIN', () => {
    expect(clampCardDensity(50)).toBe(CARD_DENSITY_MIN);
  });

  it('clamps above CARD_DENSITY_MAX', () => {
    expect(clampCardDensity(9999)).toBe(CARD_DENSITY_MAX);
  });

  it('returns CARD_DENSITY_DEFAULT for NaN / Infinity', () => {
    expect(clampCardDensity(Number.NaN)).toBe(CARD_DENSITY_DEFAULT);
    expect(clampCardDensity(Number.POSITIVE_INFINITY)).toBe(CARD_DENSITY_DEFAULT);
  });

  it('rounds fractional inputs', () => {
    expect(clampCardDensity(220.4)).toBe(220);
    expect(clampCardDensity(220.6)).toBe(221);
  });
});
