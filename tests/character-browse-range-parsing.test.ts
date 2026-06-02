/**
 * Strict numeric range-parsing coverage for src/lib/character-browse.ts.
 *
 * `parsePositiveInt` gates the age / height / bust / waist / hips bounds
 * with `/^\d+$/`, so any value carrying a non-digit suffix, decimal point,
 * exponent, sign, or whitespace must be rejected (→ `null`) rather than
 * coerced. This file pins:
 *   - the accepted integer path for every range field,
 *   - the rejected-suffix / malformed branches,
 *   - the per-field hard ceiling,
 *   - the array-valued param branch in `pickFirst`,
 *   - birthMonth's separate `Number.parseInt` + [1..12] clamp,
 *   - the sort comparator (incl. nulls-last) and group-by buckets,
 *   - `characterBrowseHref` emission of the bust/waist/hips params.
 *
 * Pure functions — no DB, no network, no timers.
 */
import { describe, expect, it } from 'vitest';
import {
  characterBrowseHref,
  filterCharacters,
  groupCharacters,
  parseCharacterBrowseParams,
  sortCharacters,
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

describe('parseCharacterBrowseParams — strict integer ranges (accepted)', () => {
  it('reads every range field as an integer', () => {
    const r = parseCharacterBrowseParams({
      ageMin: '18',
      ageMax: '30',
      heightMin: '150',
      heightMax: '180',
      bustMin: '80',
      bustMax: '95',
      waistMin: '55',
      waistMax: '62',
      hipsMin: '85',
      hipsMax: '98',
    });
    expect(r.ageMin).toBe(18);
    expect(r.ageMax).toBe(30);
    expect(r.heightMin).toBe(150);
    expect(r.heightMax).toBe(180);
    expect(r.bustMin).toBe(80);
    expect(r.bustMax).toBe(95);
    expect(r.waistMin).toBe(55);
    expect(r.waistMax).toBe(62);
    expect(r.hipsMin).toBe(85);
    expect(r.hipsMax).toBe(98);
  });

  it('accepts zero as a lower bound', () => {
    expect(parseCharacterBrowseParams({ ageMin: '0' }).ageMin).toBe(0);
  });
});

describe('parseCharacterBrowseParams — strict integer ranges (rejected)', () => {
  it.each([
    ['trailing non-digit suffix', '18x'],
    ['decimal point', '18.5'],
    ['scientific notation', '1e3'],
    ['leading plus sign', '+18'],
    ['negative sign', '-5'],
    ['leading whitespace', ' 18'],
    ['trailing whitespace', '18 '],
    ['hex literal', '0x12'],
    ['empty string', ''],
    ['pure alpha', 'eighteen'],
    ['comma thousands', '1,8'],
  ])('rejects ageMin with %s', (_label, raw) => {
    expect(parseCharacterBrowseParams({ ageMin: raw }).ageMin).toBeNull();
  });

  it('rejects each range field independently when malformed', () => {
    const r = parseCharacterBrowseParams({
      ageMax: '30y',
      heightMin: '150cm',
      heightMax: '5.9',
      bustMin: '80!',
      bustMax: 'NaN',
      waistMin: '0b101',
      waistMax: '6e1',
      hipsMin: 'Infinity',
      hipsMax: '98.0',
    });
    expect(r.ageMax).toBeNull();
    expect(r.heightMin).toBeNull();
    expect(r.heightMax).toBeNull();
    expect(r.bustMin).toBeNull();
    expect(r.bustMax).toBeNull();
    expect(r.waistMin).toBeNull();
    expect(r.waistMax).toBeNull();
    expect(r.hipsMin).toBeNull();
    expect(r.hipsMax).toBeNull();
  });

  it('rejects values above the per-field hard ceiling', () => {
    // age/bust/waist/hips ceil at 200; height ceils at 300.
    expect(parseCharacterBrowseParams({ ageMax: '201' }).ageMax).toBeNull();
    expect(parseCharacterBrowseParams({ ageMax: '200' }).ageMax).toBe(200);
    expect(parseCharacterBrowseParams({ heightMax: '301' }).heightMax).toBeNull();
    expect(parseCharacterBrowseParams({ heightMax: '300' }).heightMax).toBe(300);
    expect(parseCharacterBrowseParams({ bustMax: '201' }).bustMax).toBeNull();
    expect(parseCharacterBrowseParams({ hipsMin: '201' }).hipsMin).toBeNull();
    expect(parseCharacterBrowseParams({ waistMin: '201' }).waistMin).toBeNull();
  });

  it('rejects a digit-only value too large for a finite JavaScript number', () => {
    expect(parseCharacterBrowseParams({ ageMin: '9'.repeat(400) }).ageMin).toBeNull();
  });

  it('reads the first entry when a range param is array-valued', () => {
    expect(parseCharacterBrowseParams({ ageMin: ['25', '99'] }).ageMin).toBe(25);
    // First entry malformed → rejected even if a later entry would parse.
    expect(parseCharacterBrowseParams({ heightMin: ['x', '150'] }).heightMin).toBeNull();
  });
});

describe('parseCharacterBrowseParams — birthMonth clamp', () => {
  it('accepts 1..12 and clamps out-of-range to null', () => {
    expect(parseCharacterBrowseParams({ birthMonth: '1' }).birthMonth).toBe(1);
    expect(parseCharacterBrowseParams({ birthMonth: '12' }).birthMonth).toBe(12);
    expect(parseCharacterBrowseParams({ birthMonth: '0' }).birthMonth).toBeNull();
    expect(parseCharacterBrowseParams({ birthMonth: '13' }).birthMonth).toBeNull();
  });

  it('rejects a non-numeric birthMonth', () => {
    expect(parseCharacterBrowseParams({ birthMonth: 'march' }).birthMonth).toBeNull();
  });

  it('accepts the seiyuu language with a region subtag and rejects garbage', () => {
    expect(parseCharacterBrowseParams({ vaLang: 'ja' }).vaLang).toBe('ja');
    expect(parseCharacterBrowseParams({ vaLang: 'pt-BR' }).vaLang).toBe('pt-BR');
    expect(parseCharacterBrowseParams({ vaLang: 'toolong' }).vaLang).toBeNull();
    expect(parseCharacterBrowseParams({ vaLang: '<script>' }).vaLang).toBeNull();
  });
});

describe('filterCharacters — bust / waist / hips ranges', () => {
  const list: VndbCharacter[] = [
    char('c90001', { bust: 70, waist: 50, hips: 80 }),
    char('c90002', { bust: 85, waist: 58, hips: 90 }),
    char('c90003', { bust: 100, waist: 70, hips: 105 }),
    char('c90004', { bust: null, waist: null, hips: null }),
  ];

  it('keeps only rows inside the inclusive bust bounds and drops null bust', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({ bustMin: '80', bustMax: '95' }));
    expect(r.map((c) => c.id)).toEqual(['c90002']);
  });

  it('applies the waist bounds independently', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({ waistMin: '55' }));
    expect(r.map((c) => c.id)).toEqual(['c90002', 'c90003']);
  });

  it('applies the hips bounds independently', () => {
    const r = filterCharacters(list, parseCharacterBrowseParams({ hipsMax: '90' }));
    expect(r.map((c) => c.id)).toEqual(['c90001', 'c90002']);
  });
});

describe('sortCharacters', () => {
  const list: VndbCharacter[] = [
    char('c90011', { name: 'Bravo', height: 160, age: 20, birthday: [6, 1] }),
    char('c90012', { name: 'Alpha', height: 150, age: null, birthday: [2, 1] }),
    char('c90013', { name: 'Charlie', height: null, age: 18, birthday: null }),
  ];

  it('sorts by name ascending and reverses on demand', () => {
    expect(sortCharacters(list, { sort: 'name', reverse: false }).map((c) => c.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(sortCharacters(list, { sort: 'name', reverse: true }).map((c) => c.name)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });

  it('sorts by height ascending with the null-height row last', () => {
    expect(sortCharacters(list, { sort: 'height', reverse: false }).map((c) => c.id)).toEqual([
      'c90012',
      'c90011',
      'c90013',
    ]);
  });

  it('negates the whole comparison under reverse (the null sentinel flips too)', () => {
    expect(sortCharacters(list, { sort: 'height', reverse: true }).map((c) => c.id)).toEqual([
      'c90013',
      'c90011',
      'c90012',
    ]);
  });

  it('sorts by age and by birthday month', () => {
    expect(sortCharacters(list, { sort: 'age', reverse: false }).map((c) => c.id)).toEqual([
      'c90013',
      'c90011',
      'c90012',
    ]);
    expect(sortCharacters(list, { sort: 'birthday', reverse: false }).map((c) => c.id)).toEqual([
      'c90012',
      'c90011',
      'c90013',
    ]);
  });

  it('breaks ties on the character id', () => {
    const tied = [char('c90022', { name: 'Same' }), char('c90021', { name: 'Same' })];
    expect(sortCharacters(tied, { sort: 'name', reverse: false }).map((c) => c.id)).toEqual([
      'c90021',
      'c90022',
    ]);
  });

  it('breaks ties on the character id when both numeric values are null', () => {
    const tied = [char('c90024', { height: null }), char('c90023', { height: null })];
    expect(sortCharacters(tied, { sort: 'height', reverse: false }).map((c) => c.id)).toEqual([
      'c90023',
      'c90024',
    ]);
  });
});

describe('groupCharacters', () => {
  const list: VndbCharacter[] = [
    char('c90031', { blood_type: 'A', sex: ['f', null], birthday: [3, 1], vns: [{ id: 'v90031', role: 'main', spoiler: 0 }] }),
    char('c90032', { blood_type: null, sex: null, birthday: null, vns: [] }),
  ];

  it('returns a single empty-key bucket when groupBy is unset', () => {
    const r = groupCharacters(list, '');
    expect(r).toHaveLength(1);
    expect(r[0].key).toBe('');
    expect(r[0].items).toHaveLength(2);
  });

  it('buckets by blood type (lowercased) with an unknown fallback', () => {
    const r = groupCharacters(list, 'blood');
    expect(r.map((g) => g.key).sort()).toEqual(['a', 'unknown']);
  });

  it('buckets by sex, birthMonth, and role with unknown fallbacks', () => {
    expect(groupCharacters(list, 'sex').map((g) => g.key).sort()).toEqual(['f', 'unknown']);
    expect(groupCharacters(list, 'birthMonth').map((g) => g.key).sort()).toEqual(['3', 'unknown']);
    expect(groupCharacters(list, 'role').map((g) => g.key).sort()).toEqual(['main', 'unknown']);
  });
});

describe('characterBrowseHref — measurement params', () => {
  it('emits the bust / waist / hips params and clears them via null patch', () => {
    const base = parseCharacterBrowseParams({ bustMin: '80', waistMax: '60', hipsMin: '90' });
    const href = characterBrowseHref(base, {});
    expect(href).toContain('bustMin=80');
    expect(href).toContain('waistMax=60');
    expect(href).toContain('hipsMin=90');
    expect(characterBrowseHref(base, { bustMin: null })).not.toContain('bustMin');
  });

  it('drops a patched param set to an empty string', () => {
    const base = parseCharacterBrowseParams({ sex: 'f' });
    expect(characterBrowseHref(base, { sex: '' })).toBe('/characters');
  });

  it('emits boolean current toggles as 1/0 in the URL', () => {
    const base = parseCharacterBrowseParams({ hasVoice: '1', hasImage: '0' });
    const href = characterBrowseHref(base, {});
    expect(href).toContain('hasVoice=1');
    expect(href).toContain('hasImage=0');
  });

  it('applies a boolean patch value (true → 1, false → 0)', () => {
    const base = parseCharacterBrowseParams({});
    expect(characterBrowseHref(base, { hasVoice: true })).toContain('hasVoice=1');
    expect(characterBrowseHref(base, { hasImage: false })).toContain('hasImage=0');
  });
});
