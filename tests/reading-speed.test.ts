/**
 * TCO-012 — unit tests for getReadingSpeedProfile() and predictReadingMinutes().
 *
 * The module is pure computation on top of a single SQL query; we mock
 * `@/lib/db` so tests run without a real SQLite file and are fully
 * deterministic regardless of the test-worker temp DB state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAll, mockPrepare } = vi.hoisted(() => {
  const mockAll = vi.fn(() => [] as { playtime: number; vndb: number | null; egs: number | null }[]);
  const mockPrepare = vi.fn(() => ({ all: mockAll }));
  return { mockAll, mockPrepare };
});

vi.mock('@/lib/db', () => ({
  db: { prepare: mockPrepare },
}));

import { getReadingSpeedProfile, predictReadingMinutes } from '@/lib/reading-speed';

beforeEach(() => {
  mockAll.mockReset();
  mockAll.mockReturnValue([]);
  mockPrepare.mockClear();
});

describe('getReadingSpeedProfile()', () => {
  it('returns null multipliers when there are fewer than 3 samples', () => {
    mockAll.mockReturnValue([
      { playtime: 600, vndb: 1200, egs: null },
      { playtime: 900, vndb: 1500, egs: null },
    ]);

    const profile = getReadingSpeedProfile();

    expect(profile.sampleSize).toBe(2);
    expect(profile.multiplierVsVndb).toBeNull();
    expect(profile.multiplierVsEgs).toBeNull();
  });

  it('returns null multipliers when there are 0 samples', () => {
    mockAll.mockReturnValue([]);

    const profile = getReadingSpeedProfile();

    expect(profile.sampleSize).toBe(0);
    expect(profile.multiplierVsVndb).toBeNull();
    expect(profile.multiplierVsEgs).toBeNull();
    expect(profile.medianMyMinutes).toBeNull();
  });

  it('returns non-null VNDB multiplier when there are 3 or more samples with VNDB references', () => {
    mockAll.mockReturnValue([
      { playtime: 600, vndb: 1200, egs: null },
      { playtime: 900, vndb: 1500, egs: null },
      { playtime: 300, vndb: 600, egs: null },
    ]);

    const profile = getReadingSpeedProfile();

    expect(profile.sampleSize).toBe(3);
    expect(profile.multiplierVsVndb).not.toBeNull();
    expect(typeof profile.multiplierVsVndb).toBe('number');
  });

  it('returns non-null EGS multiplier when there are 3 or more samples with EGS references', () => {
    mockAll.mockReturnValue([
      { playtime: 600, vndb: null, egs: 1200 },
      { playtime: 900, vndb: null, egs: 1800 },
      { playtime: 450, vndb: null, egs: 900 },
    ]);

    const profile = getReadingSpeedProfile();

    expect(profile.multiplierVsEgs).not.toBeNull();
    expect(typeof profile.multiplierVsEgs).toBe('number');
  });

  it('computes the median VNDB ratio correctly for a known 3-sample set', () => {
    mockAll.mockReturnValue([
      { playtime: 600, vndb: 1200, egs: null },
      { playtime: 900, vndb: 1500, egs: null },
      { playtime: 300, vndb: 600, egs: null },
    ]);

    const profile = getReadingSpeedProfile();

    expect(profile.multiplierVsVndb).toBeCloseTo(0.5, 5);
  });
});

describe('predictReadingMinutes()', () => {
  it('returns null when the VNDB multiplier is null and no EGS reference is provided', () => {
    const profile = {
      sampleSize: 1,
      multiplierVsVndb: null,
      multiplierVsEgs: null,
      medianMyMinutes: 600,
    };

    expect(predictReadingMinutes(1200, null, profile)).toBeNull();
  });

  it('returns null when both multipliers are null even with both reference lengths provided', () => {
    const profile = {
      sampleSize: 2,
      multiplierVsVndb: null,
      multiplierVsEgs: null,
      medianMyMinutes: null,
    };

    expect(predictReadingMinutes(1200, 1000, profile)).toBeNull();
  });

  it('returns a rounded number using the VNDB multiplier when available', () => {
    const profile = {
      sampleSize: 5,
      multiplierVsVndb: 0.5,
      multiplierVsEgs: null,
      medianMyMinutes: 600,
    };

    expect(predictReadingMinutes(1200, null, profile)).toBe(600);
  });

  it('falls back to the EGS multiplier when VNDB length is absent', () => {
    const profile = {
      sampleSize: 4,
      multiplierVsVndb: null,
      multiplierVsEgs: 0.75,
      medianMyMinutes: 450,
    };

    expect(predictReadingMinutes(null, 800, profile)).toBe(600);
  });

  it('prefers the VNDB multiplier over EGS when both are available', () => {
    const profile = {
      sampleSize: 6,
      multiplierVsVndb: 0.5,
      multiplierVsEgs: 2.0,
      medianMyMinutes: 600,
    };

    expect(predictReadingMinutes(1000, 1000, profile)).toBe(500);
  });
});
