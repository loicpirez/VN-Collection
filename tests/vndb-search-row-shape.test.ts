import { describe, expect, it } from 'vitest';
import { decodeVndbCoverRow, decodeVndbSearchRow } from '@/lib/vndb-search-row-shape';

const SEARCH_ROW = {
  id: 'V90061',
  title: 'Fixture',
  alttitle: null,
  aliases: ['Fixture alias'],
  titles: [{ lang: 'ja', title: 'Fixture', latin: null, official: true, main: true }],
  released: '2026-01-01',
  rating: 80,
  votecount: 10,
  length_minutes: 1200,
  languages: ['ja'],
  platforms: ['win'],
  image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg' },
  developers: [{ id: 'P90061', name: 'Studio' }],
};

describe('VNDB VN-search row decoder', () => {
  it('normalizes search rows used by matching and rendering paths', () => {
    expect(decodeVndbSearchRow(SEARCH_ROW)).toMatchObject({
      id: 'v90061',
      aliases: ['Fixture alias'],
      developers: [{ name: 'Studio' }],
    });
  });

  it('rejects malformed search rows', () => {
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, languages: [4] })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, developers: [{ id: 'bad', name: 'Studio' }] })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, image: { url: 'x' } })).toBeNull();
  });

  it('normalizes cover-only rows and rejects malformed images', () => {
    expect(decodeVndbCoverRow({
      id: 'V90061',
      image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg', sexual: 0 },
    })).toEqual({
      id: 'v90061',
      image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg', sexual: 0 },
    });
    expect(decodeVndbCoverRow({ id: 'v90061', image: { url: 4 } })).toBeNull();
  });
});
