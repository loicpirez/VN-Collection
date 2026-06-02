import { describe, expect, it } from 'vitest';
import { decodeVndbVnDetail } from '@/lib/vndb-vn-shape';

const VN = {
  id: 'V90051',
  title: 'Fixture',
  alttitle: null,
  titles: [{ lang: 'ja', title: 'Fixture', latin: null, official: true, main: true }],
  aliases: [],
  olang: 'ja',
  devstatus: 0,
  released: '2026-01-01',
  languages: ['ja'],
  platforms: ['win'],
  length: 3,
  length_minutes: 1200,
  length_votes: 2,
  rating: 80,
  votecount: 10,
  average: 79,
  description: null,
  image: null,
  extlinks: [],
  has_anime: false,
  editions: [],
  staff: [{
    eid: null,
    role: 'scenario',
    note: null,
    id: 'S90051',
    aid: 1,
    name: 'Writer',
    original: null,
    lang: 'ja',
  }],
  va: [{
    note: null,
    character: { id: 'C90051', name: 'Heroine', original: null, image: null },
    staff: { id: 'S90052', aid: 1, name: 'Voice', original: null, lang: 'ja' },
  }],
  developers: [{ id: 'P90051', name: 'Studio' }],
  tags: [{ id: 'G90051', name: 'Tag', rating: 2, spoiler: 0, lie: false, category: 'cont' }],
  screenshots: [{
    id: 'sf90051',
    url: 'https://example.invalid/screenshot.jpg',
    thumbnail: 'https://example.invalid/screenshot-thumb.jpg',
    release: { id: 'R90051' },
  }],
  relations: [{
    id: 'V90052',
    title: 'Related',
    released: null,
    image: null,
    relation: 'seq',
    relation_official: true,
  }],
};

const SPARSE_VN = {
  id: 'V90061',
  title: 'Sparse fixture',
  alttitle: null,
  olang: null,
  released: null,
  languages: [],
  platforms: [],
  length: null,
  length_minutes: null,
  rating: null,
  votecount: null,
  description: null,
  image: null,
  developers: [],
  tags: [],
  screenshots: [],
};

describe('VNDB VN-detail row decoder', () => {
  it('normalizes ids and preserves screenshot release links for later fan-out', () => {
    expect(decodeVndbVnDetail(VN)).toMatchObject({
      id: 'v90051',
      developers: [{ id: 'p90051' }],
      tags: [{ id: 'g90051' }],
      staff: [{ id: 's90051' }],
      va: [{ character: { id: 'c90051' }, staff: { id: 's90052' } }],
      screenshots: [{ release: { id: 'r90051' } }],
      relations: [{ id: 'v90052' }],
    });
  });

  it('rejects malformed nested rows before they reach persistence', () => {
    expect(decodeVndbVnDetail({ ...VN, developers: [{ id: 'bad', name: 'Studio' }] })).toBeNull();
    expect(decodeVndbVnDetail({ ...VN, tags: [{ id: 'g90051' }] })).toBeNull();
    expect(decodeVndbVnDetail({ ...VN, staff: [{ id: 's90051' }] })).toBeNull();
    expect(decodeVndbVnDetail({ ...VN, screenshots: [{ url: 'x', thumbnail: 'y', release: { id: 'bad' } }] })).toBeNull();
  });

  it('accepts sparse rows and preserves rich optional metadata', () => {
    expect(decodeVndbVnDetail(SPARSE_VN)).toEqual({
      ...SPARSE_VN,
      id: 'v90061',
    });
    expect(decodeVndbVnDetail({
      ...VN,
      image: {
        id: 'cv90051',
        url: 'https://example.invalid/cover.jpg',
        thumbnail: 'https://example.invalid/cover-thumb.jpg',
        dims: [600, 900],
        thumbnail_dims: [200, 300],
        sexual: 0,
        violence: 0,
        votecount: 1,
      },
      extlinks: [
        { url: 'https://example.invalid/a', label: 'A', name: 'a' },
        { url: 'https://example.invalid/b', label: 'B', name: 'b', id: null },
        { url: 'https://example.invalid/c', label: 'C', name: 'c', id: 4 },
      ],
      editions: [{ eid: 4, lang: null, name: 'Edition', official: true }],
      developers: [{
        id: 'p90051',
        name: 'Studio',
        original: null,
        aliases: ['Alias'],
        lang: null,
        type: null,
        description: null,
        extlinks: [{ url: 'https://example.invalid/dev', label: 'Dev', name: 'dev', id: 'studio' }],
      }],
      tags: [{
        id: 'g90051',
        name: 'Tag',
        rating: 2,
        spoiler: 0,
        lie: true,
        category: null,
        aliases: ['Alias'],
        description: null,
        searchable: true,
        applicable: false,
        vn_count: 4,
      }],
      staff: [{
        ...VN.staff[0],
        ismain: true,
        gender: null,
        description: null,
        aliases: [{ aid: 1, name: 'Pen name', latin: null, ismain: true }],
        extlinks: [{ url: 'https://example.invalid/staff', label: 'Staff', name: 'staff' }],
      }],
      va: [{
        ...VN.va[0],
        character: {
          ...VN.va[0].character,
          aliases: ['Alias'],
          image: { url: 'https://example.invalid/character.jpg' },
        },
        staff: {
          ...VN.va[0].staff,
          ismain: false,
          gender: null,
          description: null,
          aliases: [{ aid: 2, name: 'Voice alias', latin: null, ismain: false }],
          extlinks: [{ url: 'https://example.invalid/voice', label: 'Voice', name: 'voice' }],
        },
      }],
      screenshots: [{
        id: 'sf90051',
        url: 'https://example.invalid/screenshot.jpg',
        thumbnail: 'https://example.invalid/screenshot-thumb.jpg',
        sexual: 0,
        violence: 0,
        dims: [1280, 720],
        release: null,
      }, {
        url: 'https://example.invalid/screenshot-2.jpg',
        thumbnail: 'https://example.invalid/screenshot-2-thumb.jpg',
      }],
      relations: [{
        id: 'v90052',
        title: 'Related',
        alttitle: null,
        titles: [{ lang: 'ja', title: 'Related', latin: null, official: true, main: true }],
        aliases: ['Alias'],
        olang: null,
        devstatus: null,
        released: null,
        rating: null,
        votecount: null,
        average: null,
        length: null,
        length_minutes: null,
        length_votes: null,
        languages: ['ja'],
        platforms: ['win'],
        description: null,
        developers: [{ id: 'p90051', name: 'Studio' }],
        image: { url: 'https://example.invalid/relation.jpg' },
        extlinks: [{ url: 'https://example.invalid/relation', label: 'Relation', name: 'relation' }],
        relation: 'seq',
        relation_official: true,
      }],
    })).toMatchObject({
      id: 'v90051',
      image: { dims: [600, 900], thumbnail_dims: [200, 300] },
      editions: [{ eid: 4 }],
      developers: [{ id: 'p90051', aliases: ['Alias'] }],
      tags: [{ id: 'g90051', category: null }],
      staff: [{ id: 's90051', aliases: [{ aid: 1 }] }],
      va: [{ character: { id: 'c90051', aliases: ['Alias'] }, staff: { id: 's90052', aliases: [{ aid: 2 }] } }],
      screenshots: [{ release: null }, { url: 'https://example.invalid/screenshot-2.jpg' }],
      relations: [{ id: 'v90052', developers: [{ id: 'p90051' }] }],
    });
  });

  it('omits absent optional nested metadata', () => {
    const decoded = decodeVndbVnDetail({
      ...VN,
      tags: [{ id: 'g90051', name: 'Tag', rating: 2, spoiler: 0 }],
      va: [{
        ...VN.va[0],
        character: { id: 'c90051', name: 'Heroine', original: null },
      }],
    });
    expect(decoded?.tags[0]).toEqual({ id: 'g90051', name: 'Tag', rating: 2, spoiler: 0 });
    expect(decoded?.va?.[0]?.character).toEqual({ id: 'c90051', name: 'Heroine', original: null });
  });

  it('rejects malformed top-level scalar and collection metadata', () => {
    for (const invalid of [
      { id: 'bad' },
      { title: 4 },
      { alttitle: 4 },
      { titles: [null] },
      { aliases: [4] },
      { olang: 4 },
      { devstatus: 4 },
      { released: 4 },
      { languages: [4] },
      { platforms: [4] },
      { length: Number.POSITIVE_INFINITY },
      { length_minutes: Number.POSITIVE_INFINITY },
      { length_votes: Number.POSITIVE_INFINITY },
      { rating: Number.POSITIVE_INFINITY },
      { votecount: Number.POSITIVE_INFINITY },
      { average: Number.POSITIVE_INFINITY },
      { description: 4 },
      { image: { url: 4 } },
      { extlinks: [null] },
      { has_anime: 4 },
      { editions: [null] },
      { staff: [null] },
      { va: [null] },
      { developers: [null] },
      { tags: [null] },
      { screenshots: [null] },
      { relations: [null] },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, ...invalid })).toBeNull();
    }
    expect(decodeVndbVnDetail({ ...VN, developers: new Array(5001).fill(VN.developers[0]) })).toBeNull();
  });

  it('rejects malformed image, link, developer, tag, and edition metadata', () => {
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
      expect(decodeVndbVnDetail({ ...VN, image })).toBeNull();
    }
    for (const extlink of [
      {},
      { url: 'x', label: 4, name: 'x' },
      { url: 'x', label: 'x', name: 4 },
      { url: 'x', label: 'x', name: 'x', id: {} },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, extlinks: [extlink] })).toBeNull();
    }
    for (const invalid of [
      { id: 'bad' },
      { name: 4 },
      { original: 4 },
      { aliases: [4] },
      { lang: 4 },
      { type: 4 },
      { description: 4 },
      { extlinks: [null] },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, developers: [{ ...VN.developers[0], ...invalid }] })).toBeNull();
    }
    for (const invalid of [
      { id: 'bad' },
      { name: 4 },
      { rating: Number.POSITIVE_INFINITY },
      { spoiler: Number.POSITIVE_INFINITY },
      { lie: 4 },
      { category: 'bad' },
      { aliases: [4] },
      { description: 4 },
      { searchable: 4 },
      { applicable: 4 },
      { vn_count: Number.POSITIVE_INFINITY },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, tags: [{ ...VN.tags[0], ...invalid }] })).toBeNull();
    }
    for (const invalid of [
      { eid: Number.POSITIVE_INFINITY },
      { lang: 4 },
      { name: 4 },
      { official: 4 },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, editions: [{ eid: 1, lang: null, name: 'Edition', official: true, ...invalid }] })).toBeNull();
    }
  });

  it('rejects malformed staff, voice actor, screenshot, and relation metadata', () => {
    for (const invalid of [
      { eid: 1.5 },
      { role: 4 },
      { note: 4 },
      { aid: 1.5 },
      { name: 4 },
      { original: 4 },
      { lang: 4 },
      { ismain: 4 },
      { gender: 4 },
      { description: 4 },
      { aliases: [null] },
      { extlinks: [null] },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, staff: [{ ...VN.staff[0], ...invalid }] })).toBeNull();
    }
    for (const invalid of [
      { note: 4 },
      { character: null },
      { character: { ...VN.va[0].character, id: 'bad' } },
      { character: { ...VN.va[0].character, name: 4 } },
      { character: { ...VN.va[0].character, original: 4 } },
      { character: { ...VN.va[0].character, aliases: [4] } },
      { character: { ...VN.va[0].character, image: { url: 4 } } },
      { staff: null },
      { staff: { ...VN.va[0].staff, id: 'bad' } },
      { staff: { ...VN.va[0].staff, aid: 1.5 } },
      { staff: { ...VN.va[0].staff, name: 4 } },
      { staff: { ...VN.va[0].staff, original: 4 } },
      { staff: { ...VN.va[0].staff, lang: 4 } },
      { staff: { ...VN.va[0].staff, ismain: 4 } },
      { staff: { ...VN.va[0].staff, gender: 4 } },
      { staff: { ...VN.va[0].staff, description: 4 } },
      { staff: { ...VN.va[0].staff, aliases: [null] } },
      { staff: { ...VN.va[0].staff, extlinks: [null] } },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, va: [{ ...VN.va[0], ...invalid }] })).toBeNull();
    }
    for (const invalid of [
      { url: 4 },
      { thumbnail: 4 },
      { id: 4 },
      { sexual: Number.POSITIVE_INFINITY },
      { violence: Number.POSITIVE_INFINITY },
      { dims: [1] },
      { release: { id: 'bad' } },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, screenshots: [{ ...VN.screenshots[0], ...invalid }] })).toBeNull();
    }
    for (const invalid of [
      { id: 'bad' },
      { title: 4 },
      { released: 4 },
      { relation: 4 },
      { relation_official: 4 },
      { alttitle: 4 },
      { titles: [null] },
      { aliases: [4] },
      { olang: 4 },
      { devstatus: 4 },
      { rating: Number.POSITIVE_INFINITY },
      { votecount: Number.POSITIVE_INFINITY },
      { average: Number.POSITIVE_INFINITY },
      { length: Number.POSITIVE_INFINITY },
      { length_minutes: Number.POSITIVE_INFINITY },
      { length_votes: Number.POSITIVE_INFINITY },
      { languages: [4] },
      { platforms: [4] },
      { description: 4 },
      { developers: [null] },
      { image: { url: 4 } },
      { extlinks: [null] },
    ]) {
      expect(decodeVndbVnDetail({ ...VN, relations: [{ ...VN.relations[0], ...invalid }] })).toBeNull();
    }
  });
});
