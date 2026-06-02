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

  it('preserves sparse optional nested metadata', () => {
    expect(decodeVndbCharacter({
      ...CHARACTER,
      image: { url: 'https://example.invalid/character.jpg' },
      vns: [{
        id: 'v90091',
        role: 'appears',
        spoiler: 0,
        image: {
          id: 'cv90091',
          url: 'https://example.invalid/vn.jpg',
          thumbnail: 'https://example.invalid/vn-thumb.jpg',
          dims: [600, 900],
          thumbnail_dims: [200, 300],
          sexual: 0,
          violence: 0,
          votecount: 1,
        },
        release: null,
      }, {
        id: 'v90092',
        role: 'side',
        spoiler: 1,
      }, {
        id: 'v90093',
        role: 'primary',
        spoiler: 0,
        release: { id: 'r90093' },
      }],
      traits: [{
        id: 'i90091',
        spoiler: 0,
        group_id: null,
        group_name: null,
      }, {
        id: 'i90092',
        spoiler: 0,
      }],
    })).toMatchObject({
      image: { url: 'https://example.invalid/character.jpg' },
      vns: [{
        id: 'v90091',
        image: {
          id: 'cv90091',
          thumbnail: 'https://example.invalid/vn-thumb.jpg',
          thumbnail_dims: [200, 300],
        },
        release: null,
      }, {
        id: 'v90092',
      }, {
        id: 'v90093',
        release: { id: 'r90093' },
      }],
      traits: [{ group_id: null, group_name: null }, { id: 'i90092', spoiler: 0 }],
    });
  });

  it('rejects malformed top-level arrays and scalar metadata', () => {
    expect(decodeVndbCharacter({ ...CHARACTER, aliases: {} })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, aliases: [4] })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, vns: new Array(5001).fill(CHARACTER.vns[0]) })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, sex: [4, null] })).toBeNull();
    expect(decodeVndbCharacter({ ...CHARACTER, birthday: [4, Number.POSITIVE_INFINITY] })).toBeNull();
    for (const invalid of [
      { name: 4 },
      { original: 4 },
      { description: 4 },
      { blood_type: 4 },
      { height: Number.POSITIVE_INFINITY },
      { weight: Number.POSITIVE_INFINITY },
      { bust: Number.POSITIVE_INFINITY },
      { waist: Number.POSITIVE_INFINITY },
      { hips: Number.POSITIVE_INFINITY },
      { cup: 4 },
      { age: Number.POSITIVE_INFINITY },
    ]) {
      expect(decodeVndbCharacter({ ...CHARACTER, ...invalid })).toBeNull();
    }
  });

  it('rejects malformed image, appearance, release, and trait metadata', () => {
    for (const image of [
      {},
      { url: 'x', id: 4 },
      { url: 'x', thumbnail: 4 },
      { url: 'x', dims: [1] },
      { url: 'x', thumbnail_dims: [1] },
      { url: 'x', sexual: Number.POSITIVE_INFINITY },
      { url: 'x', violence: Number.POSITIVE_INFINITY },
      { url: 'x', votecount: Number.POSITIVE_INFINITY },
    ]) {
      expect(decodeVndbCharacter({ ...CHARACTER, image })).toBeNull();
    }
    for (const invalid of [
      { id: 'bad' },
      { role: 'bad' },
      { spoiler: Number.POSITIVE_INFINITY },
      { title: 4 },
      { alttitle: 4 },
      { released: 4 },
      { olang: 4 },
      { languages: [4] },
      { platforms: [4] },
      { length_minutes: Number.POSITIVE_INFINITY },
      { rating: Number.POSITIVE_INFINITY },
      { votecount: Number.POSITIVE_INFINITY },
      { image: { url: 4 } },
      { release: { id: 'bad' } },
      { release: { id: 'r90091', languages: [null] } },
    ]) {
      expect(decodeVndbCharacter({ ...CHARACTER, vns: [{ ...CHARACTER.vns[0], ...invalid }] })).toBeNull();
    }
    for (const invalid of [
      { id: 'bad' },
      { spoiler: Number.POSITIVE_INFINITY },
      { lie: 4 },
      { name: 4 },
      { aliases: [4] },
      { description: 4 },
      { searchable: 4 },
      { applicable: 4 },
      { sexual: 4 },
      { group_name: 4 },
      { char_count: Number.POSITIVE_INFINITY },
    ]) {
      expect(decodeVndbCharacter({ ...CHARACTER, traits: [{ ...CHARACTER.traits[0], ...invalid }] })).toBeNull();
    }
  });
});
