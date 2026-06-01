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
});
