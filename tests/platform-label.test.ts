/**
 * Pin the human-readable platform-label mapping. The earlier
 * surfaces rendered raw VNDB codes ("WIN", "PS4", "SWI") and were
 * flagged as opaque. `platformLabel` centralises the mapping so
 * every consumer (VN detail, releases, owned editions, shelf, stats)
 * stays consistent. URL params and DB rows keep the raw code — only
 * the user-facing label widens.
 */
import { describe, expect, it } from 'vitest';
import { platformLabel, PLATFORM_LABELS } from '@/lib/platform-label';

describe('platformLabel', () => {
  it('returns the friendly name for known codes', () => {
    expect(platformLabel('win')).toBe('Windows');
    expect(platformLabel('mac')).toBe('macOS');
    expect(platformLabel('lin')).toBe('Linux');
    expect(platformLabel('swi')).toBe('Nintendo Switch');
    expect(platformLabel('ps4')).toBe('PlayStation 4');
    expect(platformLabel('psv')).toBe('PlayStation Vita');
    expect(platformLabel('xxs')).toBe('Xbox Series X/S');
    expect(platformLabel('3ds')).toBe('Nintendo 3DS');
  });

  it('VNDB-real codes seen in local data resolve to their full names', () => {
    // The operator flagged "N3D" rendering raw in some VN cards.
    // VNDB's `release.platforms` enum uses `n3d` (lowercase) — NOT
    // `3ds`. Both alias to the same label.
    expect(platformLabel('n3d')).toBe('Nintendo 3DS');
    expect(platformLabel('N3D')).toBe('Nintendo 3DS');
    // Other codes the operator's DB carries that didn't have a
    // friendly label before:
    expect(platformLabel('dos')).toBe('MS-DOS');
    expect(platformLabel('mob')).toBe('Mobile');
    expect(platformLabel('x68')).toBe('X68000');
    expect(platformLabel('xb3')).toBe('Xbox 360');
  });

  it('"oth" maps to "Other" via the explicit fallback entry', () => {
    expect(platformLabel('oth')).toBe('Other');
    expect(PLATFORM_LABELS.oth).toBe('Other');
  });

  it('unknown codes fall back to UPPERCASE so the chip is never blank', () => {
    expect(platformLabel('zzz')).toBe('ZZZ');
    expect(platformLabel('foo')).toBe('FOO');
  });

  it('lookup is case-insensitive (matches VNDB lowercase + EGS variants)', () => {
    expect(platformLabel('WIN')).toBe('Windows');
    expect(platformLabel('Win')).toBe('Windows');
    expect(platformLabel('SWI')).toBe('Nintendo Switch');
  });

  it('empty string round-trips unchanged so the caller can decide', () => {
    expect(platformLabel('')).toBe('');
  });

  it('every entry in PLATFORM_LABELS has a non-empty value', () => {
    for (const [code, label] of Object.entries(PLATFORM_LABELS)) {
      expect(code.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
