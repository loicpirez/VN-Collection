/**
 * Pin the sort + group-by contract for `/characters` browsing.
 *
 * Sorts must:
 *  - be stable on ties via the character id,
 *  - place nulls (missing height/age) last regardless of direction,
 *  - support name (lexicographic), height (numeric), age (numeric),
 *    and birthday-month (numeric).
 *
 * Group-by must bucket by the requested field with an `unknown`
 * bucket for missing values.
 */
import { describe, expect, it } from 'vitest';
import { groupCharacters, sortCharacters } from '@/lib/character-browse';
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

describe('sortCharacters', () => {
  it('sorts by name ascending by default', () => {
    const list = [char('c2', { name: 'Bravo' }), char('c1', { name: 'Alpha' }), char('c3', { name: 'Charlie' })];
    const r = sortCharacters(list, { sort: 'name', reverse: false });
    expect(r.map((c) => c.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('reverses on `reverse=true`', () => {
    const list = [char('c1', { name: 'Alpha' }), char('c2', { name: 'Bravo' })];
    const r = sortCharacters(list, { sort: 'name', reverse: true });
    expect(r.map((c) => c.name)).toEqual(['Bravo', 'Alpha']);
  });

  it('sorts by height numeric, nulls last', () => {
    const list = [
      char('c1', { height: 170 }),
      char('c2', { height: null }),
      char('c3', { height: 150 }),
    ];
    const r = sortCharacters(list, { sort: 'height', reverse: false });
    expect(r.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
  });

  it('sorts by birthday month, nulls last', () => {
    const list = [
      char('c1', { birthday: [11, 5] }),
      char('c2', { birthday: null }),
      char('c3', { birthday: [3, 20] }),
    ];
    const r = sortCharacters(list, { sort: 'birthday', reverse: false });
    expect(r.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
  });

  it('breaks ties with the character id so the sort is deterministic', () => {
    const list = [
      char('c20', { height: 160 }),
      char('c10', { height: 160 }),
      char('c30', { height: 160 }),
    ];
    const r = sortCharacters(list, { sort: 'height', reverse: false });
    expect(r.map((c) => c.id)).toEqual(['c10', 'c20', 'c30']);
  });
});

describe('groupCharacters', () => {
  it('returns a single bucket when groupBy is empty', () => {
    const list = [char('c1'), char('c2')];
    const g = groupCharacters(list, '');
    expect(g).toHaveLength(1);
    expect(g[0]?.items.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('buckets by blood type with an `unknown` bin for missing values', () => {
    const list = [
      char('c1', { blood_type: 'a' }),
      char('c2', { blood_type: 'a' }),
      char('c3', { blood_type: null }),
    ];
    const g = groupCharacters(list, 'blood');
    const keys = g.map((b) => b.key).sort();
    expect(keys).toEqual(['a', 'unknown']);
    const a = g.find((b) => b.key === 'a');
    expect(a?.items.length).toBe(2);
  });

  it('buckets by birthday month', () => {
    const list = [
      char('c1', { birthday: [3, 1] }),
      char('c2', { birthday: [3, 22] }),
      char('c3', { birthday: [7, 4] }),
      char('c4', { birthday: null }),
    ];
    const g = groupCharacters(list, 'birthMonth');
    expect(g.map((b) => b.key).sort()).toEqual(['3', '7', 'unknown']);
  });

  it('buckets by sex with `unknown` for the missing first-element entries', () => {
    const list = [
      char('c1', { sex: ['f', null] }),
      char('c2', { sex: ['m', null] }),
      char('c3', { sex: null }),
    ];
    const g = groupCharacters(list, 'sex');
    expect(g.map((b) => b.key).sort()).toEqual(['f', 'm', 'unknown']);
  });
});
