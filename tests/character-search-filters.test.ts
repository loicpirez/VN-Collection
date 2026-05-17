/**
 * Pure-helper coverage for the `/characters` search filter contract.
 * Mocks nothing — the helpers under test do not hit VNDB or the DB.
 *
 * The /characters page wires these helpers to `useSearchParams()` and
 * renders the resolved filter object directly; pinning the parsing
 * here guarantees the URL stays shareable and that a tampered param
 * cannot leak through to a VNDB query.
 */
import { describe, expect, it } from 'vitest';
import {
  characterSearchFilters,
  parseCharacterSearchParams,
} from '@/lib/char-staff-search-filters';

describe('parseCharacterSearchParams', () => {
  it('defaults to the Local tab + empty query', () => {
    const r = parseCharacterSearchParams({});
    expect(r.tab).toBe('local');
    expect(r.q).toBe('');
    expect(r.role).toBeNull();
    expect(r.sex).toBeNull();
    expect(r.spoiler).toBe(0);
    expect(r.vn).toBeNull();
  });

  it('reads tab=vndb and trims the query', () => {
    const r = parseCharacterSearchParams({ tab: 'vndb', q: '  placeholder-name  ' });
    expect(r.tab).toBe('vndb');
    expect(r.q).toBe('placeholder-name');
  });

  it('accepts only the four VNDB roles, falls back to null otherwise', () => {
    for (const role of ['main', 'primary', 'side', 'appears'] as const) {
      const r = parseCharacterSearchParams({ role });
      expect(r.role).toBe(role);
    }
    expect(parseCharacterSearchParams({ role: 'protagonist' }).role).toBeNull();
    expect(parseCharacterSearchParams({ role: undefined }).role).toBeNull();
  });

  it('accepts only the four VNDB sex codes', () => {
    for (const sex of ['m', 'f', 'b', 'n'] as const) {
      expect(parseCharacterSearchParams({ sex }).sex).toBe(sex);
    }
    expect(parseCharacterSearchParams({ sex: 'q' }).sex).toBeNull();
  });

  it('clamps the spoiler level to 0..2', () => {
    expect(parseCharacterSearchParams({ spoiler: '0' }).spoiler).toBe(0);
    expect(parseCharacterSearchParams({ spoiler: '1' }).spoiler).toBe(1);
    expect(parseCharacterSearchParams({ spoiler: '2' }).spoiler).toBe(2);
    expect(parseCharacterSearchParams({ spoiler: '99' }).spoiler).toBe(0);
  });

  it('only accepts canonical VNDB vn ids for the appearance filter', () => {
    expect(parseCharacterSearchParams({ vn: 'v17' }).vn).toBe('v17');
    expect(parseCharacterSearchParams({ vn: 'V18' }).vn).toBe('v18');
    expect(parseCharacterSearchParams({ vn: 'egs_42' }).vn).toBeNull();
    expect(parseCharacterSearchParams({ vn: '<script>' }).vn).toBeNull();
  });
});

describe('characterSearchFilters', () => {
  it('builds an empty filter array when no filter is active', () => {
    expect(characterSearchFilters({ role: null, sex: null, vn: null })).toEqual([]);
  });

  it('emits role / sex / vn predicates in the VNDB filter shape', () => {
    const f = characterSearchFilters({ role: 'main', sex: 'f', vn: 'v17' });
    expect(f).toContainEqual(['role', '=', 'main']);
    expect(f).toContainEqual(['sex', '=', 'f']);
    expect(f).toContainEqual(['vn', '=', ['id', '=', 'v17']]);
    expect(f.length).toBe(3);
  });
});
