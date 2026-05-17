/**
 * Pin the filter / URL-state contract for `/characters` browsing.
 *
 * The page wires `parseCharacterBrowseParams` to `useSearchParams()`,
 * `filterCharacters` to the resolved list, and `characterBrowseHref`
 * to each chip click. The unit test asserts:
 *
 *  - chip parsing accepts only canonical values and rejects garbage,
 *  - filterCharacters cascades sex / role / blood / has-image,
 *  - characterBrowseHref clears the param when the patch value is `null`,
 *  - default `tab=local` and `sort=name` are dropped from the URL.
 */
import { describe, expect, it } from 'vitest';
import {
  characterBrowseHref,
  filterCharacters,
  hasActiveCharacterFilter,
  parseCharacterBrowseParams,
} from '@/lib/character-browse';
import type { BrowsableCharacter as VndbCharacter } from '@/lib/character-browse';

function char(id: string, overrides: Partial<VndbCharacter> = {}): VndbCharacter {
  return {
    id,
    name: id,
    original: null,
    image: null,
    blood_type: null,
    height: null,
    age: null,
    birthday: null,
    sex: null,
    vns: [],
    ...overrides,
  };
}

describe('parseCharacterBrowseParams', () => {
  it('defaults to tab=local + sort=name + no filters', () => {
    const r = parseCharacterBrowseParams({});
    expect(r.tab).toBe('local');
    expect(r.sort).toBe('name');
    expect(r.reverse).toBe(false);
    expect(r.sex).toBeNull();
    expect(r.role).toBeNull();
    expect(r.blood).toBeNull();
    expect(r.groupBy).toBe('');
    expect(r.hasVoice).toBeNull();
    expect(r.hasImage).toBeNull();
  });

  it('accepts every documented chip value', () => {
    const r = parseCharacterBrowseParams({
      tab: 'combined',
      sex: 'f',
      role: 'main',
      blood: 'ab',
      vaLang: 'ja',
      hasVoice: '1',
      hasImage: '0',
      sort: 'height',
      reverse: '1',
      groupBy: 'birthMonth',
    });
    expect(r.tab).toBe('combined');
    expect(r.sex).toBe('f');
    expect(r.role).toBe('main');
    expect(r.blood).toBe('ab');
    expect(r.vaLang).toBe('ja');
    expect(r.hasVoice).toBe(true);
    expect(r.hasImage).toBe(false);
    expect(r.sort).toBe('height');
    expect(r.reverse).toBe(true);
    expect(r.groupBy).toBe('birthMonth');
  });

  it('rejects tampered values', () => {
    const r = parseCharacterBrowseParams({
      sex: 'q',
      role: 'protagonist',
      blood: 'z',
      vaLang: '<script>',
      sort: 'bogus',
      groupBy: 'bogus',
    });
    expect(r.sex).toBeNull();
    expect(r.role).toBeNull();
    expect(r.blood).toBeNull();
    expect(r.vaLang).toBeNull();
    expect(r.sort).toBe('name');
    expect(r.groupBy).toBe('');
  });

  it('lowercases the blood type', () => {
    expect(parseCharacterBrowseParams({ blood: 'AB' }).blood).toBe('ab');
  });

  it('accepts the canonical bloodType alias and prefers it over the legacy key', () => {
    expect(parseCharacterBrowseParams({ bloodType: 'O' }).blood).toBe('o');
    // Canonical wins when both are present.
    expect(parseCharacterBrowseParams({ bloodType: 'ab', blood: 'a' }).blood).toBe('ab');
  });

  it('parses birthMonth and clamps to [1..12]', () => {
    expect(parseCharacterBrowseParams({ birthMonth: '3' }).birthMonth).toBe(3);
    expect(parseCharacterBrowseParams({ birthMonth: '0' }).birthMonth).toBeNull();
    expect(parseCharacterBrowseParams({ birthMonth: '13' }).birthMonth).toBeNull();
    expect(parseCharacterBrowseParams({ birthMonth: 'feb' }).birthMonth).toBeNull();
  });
});

describe('filterCharacters', () => {
  const list: VndbCharacter[] = [
    char('c1', { sex: ['f', null], blood_type: 'a', vns: [{ id: 'v1', role: 'main', spoiler: 0 }] }),
    char('c2', { sex: ['m', null], blood_type: 'b', vns: [{ id: 'v2', role: 'side', spoiler: 0 }] }),
    char('c3', { sex: ['f', null], blood_type: 'o', image: { url: 'https://example.test/x.jpg' }, vns: [{ id: 'v3', role: 'primary', spoiler: 0 }] }),
  ];

  it('returns everything when no filter is set', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({}));
    expect(r.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('cascades sex + role', () => {
    const r = filterCharacters(
      list,
      parseCharacterBrowseParams({ sex: 'f', role: 'primary' }),
    );
    expect(r.map((c) => c.id)).toEqual(['c3']);
  });

  it('filters by blood type', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({ blood: 'b' }));
    expect(r.map((c) => c.id)).toEqual(['c2']);
  });

  it('hasImage=1 keeps only characters with an image url', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({ hasImage: '1' }));
    expect(r.map((c) => c.id)).toEqual(['c3']);
  });

  it('hasImage=0 drops characters with an image url', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({ hasImage: '0' }));
    expect(r.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('cascades ageMin / ageMax (inclusive) and drops null-age rows', () => {
    const rangeList: VndbCharacter[] = [
      char('c10', { age: 15 }),
      char('c11', { age: 18 }),
      char('c12', { age: 22 }),
      char('c13', { age: 30 }),
      char('c14', { age: null }),
    ];
    const r = filterCharacters(rangeList, parseCharacterBrowseParams({ ageMin: '18', ageMax: '25' }));
    expect(r.map((c) => c.id)).toEqual(['c11', 'c12']);
    // null age is dropped by either bound being set.
    expect(filterCharacters(rangeList, parseCharacterBrowseParams({ ageMin: '0' })).map((c) => c.id)).toEqual(['c10', 'c11', 'c12', 'c13']);
  });

  it('cascades heightMin / heightMax', () => {
    const heightList: VndbCharacter[] = [
      char('c20', { height: 145 }),
      char('c21', { height: 160 }),
      char('c22', { height: 175 }),
      char('c23', { height: null }),
    ];
    const r = filterCharacters(heightList, parseCharacterBrowseParams({ heightMin: '150', heightMax: '170' }));
    expect(r.map((c) => c.id)).toEqual(['c21']);
  });
});

describe('parseCharacterBrowseParams (ranges)', () => {
  it('reads ageMin / ageMax / heightMin / heightMax as integers', () => {
    const r = parseCharacterBrowseParams({ ageMin: '18', ageMax: '30', heightMin: '150', heightMax: '180' });
    expect(r.ageMin).toBe(18);
    expect(r.ageMax).toBe(30);
    expect(r.heightMin).toBe(150);
    expect(r.heightMax).toBe(180);
  });

  it('rejects malformed range inputs', () => {
    const r = parseCharacterBrowseParams({ ageMin: 'eighteen', heightMax: '-5' });
    expect(r.ageMin).toBeNull();
    expect(r.heightMax).toBeNull();
  });

  it('rejects ranges past the hard ceiling', () => {
    const r = parseCharacterBrowseParams({ ageMin: '9999', heightMin: '99999' });
    expect(r.ageMin).toBeNull();
    expect(r.heightMin).toBeNull();
  });
});

describe('hasActiveCharacterFilter', () => {
  it('returns false for a fresh params object', () => {
    expect(hasActiveCharacterFilter(parseCharacterBrowseParams({}))).toBe(false);
  });

  it.each([
    ['sex', { sex: 'f' }],
    ['role', { role: 'main' }],
    ['blood', { blood: 'ab' }],
    ['hasVoice', { hasVoice: '1' }],
    ['hasImage', { hasImage: '0' }],
    ['vaLang', { vaLang: 'ja' }],
    ['birthMonth', { birthMonth: '4' }],
    ['ageMin', { ageMin: '18' }],
    ['heightMax', { heightMax: '160' }],
  ])('flags %s as an active filter', (_label, patch) => {
    expect(hasActiveCharacterFilter(parseCharacterBrowseParams(patch as Record<string, string>))).toBe(true);
  });
});

describe('characterBrowseHref', () => {
  it('omits defaults from the URL', () => {
    const r = characterBrowseHref(parseCharacterBrowseParams({}), {});
    expect(r).toBe('/characters');
  });

  it('emits sex=f and clears via null', () => {
    const base = parseCharacterBrowseParams({ sex: 'f' });
    expect(characterBrowseHref(base, {})).toBe('/characters?sex=f');
    expect(characterBrowseHref(base, { sex: null })).toBe('/characters');
  });

  it('round-trips range params through the URL', () => {
    const r = characterBrowseHref(
      parseCharacterBrowseParams({ ageMin: '18', ageMax: '30', heightMin: '150' }),
      {},
    );
    expect(r).toContain('ageMin=18');
    expect(r).toContain('ageMax=30');
    expect(r).toContain('heightMin=150');
    expect(r).not.toContain('heightMax');
  });

  it('emits sort + reverse together', () => {
    const r = characterBrowseHref(
      parseCharacterBrowseParams({ sort: 'height', reverse: '1' }),
      {},
    );
    expect(r).toContain('sort=height');
    expect(r).toContain('reverse=1');
  });

  it('preserves the active query when toggling a chip', () => {
    const base = parseCharacterBrowseParams({ q: 'placeholder', sex: 'f' });
    expect(characterBrowseHref(base, { sex: null })).toBe('/characters?q=placeholder');
  });
});
