import { describe, expect, it } from 'vitest';
import { decodeVndbCharacter } from '@/lib/vndb-character-row-shape';

const CHARACTER = {
  id: 'C90091',
  name: 'Heroine',
  original: null,
  aliases: ['Alias'],
  description: null,
  image: {
    id: 'ch90091',
    url: 'https://example.invalid/character.jpg',
    dims: [600, 900],
    sexual: 0,
    violence: 0,
    votecount: 2,
  },
  blood_type: null,
  height: 160,
  weight: null,
  bust: null,
  waist: null,
  hips: null,
  cup: null,
  age: null,
  birthday: [4, 12],
  sex: ['f', null],
  gender: ['f', null],
  vns: [{
    id: 'V90091',
    role: 'main',
    spoiler: 0,
    title: 'Fixture',
    alttitle: null,
    released: '2026-01-01',
    olang: 'ja',
    languages: ['ja'],
    platforms: ['win'],
    length_minutes: 1200,
    rating: 80,
    votecount: 10,
    image: null,
    developers: [{ id: 'P90091', name: 'Studio' }],
    release: {
      id: 'R90091',
      title: 'Fixture release',
      alttitle: null,
      released: '2026-01-01',
      minage: 18,
      official: true,
      patch: false,
      freeware: false,
      has_ero: true,
      languages: [{ lang: 'ja', title: null, latin: null, mtl: false, main: true }],
      platforms: ['win'],
    },
  }],
  traits: [{
    id: 'I90091',
    spoiler: 0,
    lie: false,
    name: 'Trait',
    aliases: [],
    description: null,
    searchable: true,
    applicable: true,
    sexual: false,
    group_id: 'I90092',
    group_name: 'Group',
    char_count: 1,
  }],
};

describe('VNDB character row decoder', () => {
  it('normalizes nested ids and preserves selected metadata', () => {
    expect(decodeVndbCharacter(CHARACTER)).toMatchObject({
      id: 'c90091',
      vns: [{
        id: 'v90091',
        developers: [{ id: 'p90091' }],
        release: { id: 'r90091' },
      }],
      traits: [{ id: 'i90091', group_id: 'i90092' }],
    });
  });

  it('accepts nullable character metadata', () => {
    expect(decodeVndbCharacter({
      ...CHARACTER,
      image: null,
      birthday: null,
      sex: null,
      gender: null,
      vns: [],
      traits: [],
    })).toMatchObject({
      image: null,
      birthday: null,
      sex: null,
      gender: null,
    });
  });

  it('rejects malformed nested rows before they reach consumers', () => {
    expect(decodeVndbCharacter({ ...CHARACTER, id: 'bad' })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, birthday: [4] })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, vns: [{ ...CHARACTER.vns[0], developers: [{ id: 'bad', name: 'Studio' }] }] })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, traits: [{ ...CHARACTER.traits[0], group_id: 'bad' }] })).toBeNull();
  });
});
