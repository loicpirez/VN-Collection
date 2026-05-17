/**
 * Pure-helper coverage for the `/staff` search filter contract.
 * Mocks nothing — the helpers under test do not hit VNDB or the DB.
 */
import { describe, expect, it } from 'vitest';
import {
  parseStaffSearchParams,
  staffSearchFilters,
} from '@/lib/char-staff-search-filters';

describe('parseStaffSearchParams', () => {
  it('defaults to the Local tab + empty query', () => {
    const r = parseStaffSearchParams({});
    expect(r.tab).toBe('local');
    expect(r.q).toBe('');
    expect(r.role).toBeNull();
    expect(r.lang).toBeNull();
    expect(r.vn).toBeNull();
  });

  it('reads tab=vndb', () => {
    expect(parseStaffSearchParams({ tab: 'vndb' }).tab).toBe('vndb');
    expect(parseStaffSearchParams({ tab: 'unknown' }).tab).toBe('local');
  });

  it('accepts only the canonical staff roles', () => {
    for (const role of ['scenario', 'art', 'music', 'songs', 'director', 'translator']) {
      expect(parseStaffSearchParams({ role }).role).toBe(role);
    }
    expect(parseStaffSearchParams({ role: 'voice' }).role).toBeNull();
    expect(parseStaffSearchParams({ role: '<script>' }).role).toBeNull();
  });

  it('accepts language codes including BCP-47 variants', () => {
    expect(parseStaffSearchParams({ lang: 'ja' }).lang).toBe('ja');
    expect(parseStaffSearchParams({ lang: 'en' }).lang).toBe('en');
    expect(parseStaffSearchParams({ lang: 'zh-Hans' }).lang).toBe('zh-Hans');
    expect(parseStaffSearchParams({ lang: 'invalid lang' }).lang).toBeNull();
  });

  it('only accepts canonical VNDB vn ids for the credited-VN filter', () => {
    expect(parseStaffSearchParams({ vn: 'v90017' }).vn).toBe('v90017');
    expect(parseStaffSearchParams({ vn: 'V18' }).vn).toBe('v18');
    expect(parseStaffSearchParams({ vn: 'egs_42' }).vn).toBeNull();
  });
});

describe('staffSearchFilters', () => {
  it('builds an empty filter array when no filter is active', () => {
    expect(staffSearchFilters({ role: null, lang: null, vn: null })).toEqual([]);
  });

  it('emits role / lang / vn predicates in the VNDB filter shape', () => {
    const f = staffSearchFilters({ role: 'scenario', lang: 'ja', vn: 'v90017' });
    expect(f).toContainEqual(['role', '=', 'scenario']);
    expect(f).toContainEqual(['lang', '=', 'ja']);
    expect(f).toContainEqual(['vn', '=', ['id', '=', 'v90017']]);
    expect(f.length).toBe(3);
  });
});
