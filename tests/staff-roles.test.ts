/**
 * Pins the `staff-roles` lookup contract: the role identifier
 * enumeration, the canonical render order, and the `roleLabel`
 * fallback semantics for unknown / null / undefined inputs.
 *
 * Every staff surface (StaffSection, StaffExtraCredits,
 * brand-overlap, the compare page) routes through `roleLabel`
 * so a label-drift here cascades site-wide. The lookup table is
 * tiny and pure — perfect for unit coverage.
 */
import { describe, expect, it } from 'vitest';
import { ROLE_ORDER, ROLE_KEY, roleLabel, type RoleI18nKey } from '@/lib/staff-roles';

const DICT: Record<RoleI18nKey, string> = {
  role_scenario: 'Scenario',
  role_chardesign: 'Character design',
  role_art: 'Art',
  role_music: 'Music',
  role_songs: 'Songs',
  role_director: 'Director',
  role_producer: 'Producer',
  role_staff: 'Other',
};

describe('staff-roles — ROLE_ORDER', () => {
  it('declares the eight canonical roles in render order', () => {
    expect(ROLE_ORDER).toEqual([
      'scenario',
      'chardesign',
      'art',
      'music',
      'songs',
      'director',
      'producer',
      'staff',
    ]);
  });

  it('every ROLE_ORDER entry has a matching ROLE_KEY entry', () => {
    for (const role of ROLE_ORDER) {
      expect(ROLE_KEY[role]).toBeDefined();
      expect(ROLE_KEY[role]).toBe(`role_${role}`);
    }
  });

  it('every ROLE_KEY value points to a dictionary key', () => {
    for (const role of Object.keys(ROLE_KEY)) {
      const key = ROLE_KEY[role];
      expect(DICT[key]).toBeDefined();
    }
  });
});

describe('staff-roles — roleLabel', () => {
  it('returns the localised label for every known role', () => {
    expect(roleLabel('scenario', DICT)).toBe('Scenario');
    expect(roleLabel('chardesign', DICT)).toBe('Character design');
    expect(roleLabel('art', DICT)).toBe('Art');
    expect(roleLabel('music', DICT)).toBe('Music');
    expect(roleLabel('songs', DICT)).toBe('Songs');
    expect(roleLabel('director', DICT)).toBe('Director');
    expect(roleLabel('producer', DICT)).toBe('Producer');
    expect(roleLabel('staff', DICT)).toBe('Other');
  });

  it('returns the raw role identifier for unknown VNDB roles', () => {
    // A freshly-added VNDB role should appear unmapped, not blank.
    expect(roleLabel('translator', DICT)).toBe('translator');
    expect(roleLabel('qa', DICT)).toBe('qa');
  });

  it('returns an empty string when role is null / undefined', () => {
    expect(roleLabel(null, DICT)).toBe('');
    expect(roleLabel(undefined, DICT)).toBe('');
  });

  it('returns an empty string for an empty role string', () => {
    // Empty string is falsy so we hit the `if (role)` branch first.
    expect(roleLabel('', DICT)).toBe('');
  });

  it('is case-sensitive — uppercase variant falls through to the fallback', () => {
    // ROLE_KEY is keyed lowercase. Future VNDB changes that flip
    // role casing would surface here as a regression.
    expect(roleLabel('Scenario', DICT)).toBe('Scenario');
    expect(roleLabel('SCENARIO', DICT)).toBe('SCENARIO');
  });

  it('never mutates the dictionary passed in', () => {
    const frozen = Object.freeze({ ...DICT });
    expect(() => roleLabel('scenario', frozen)).not.toThrow();
    expect(frozen).toEqual(DICT);
  });
});
