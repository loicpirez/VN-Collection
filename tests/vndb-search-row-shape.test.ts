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

  it('accepts developers without a producer id (the search route omits it)', () => {
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, developers: [{ name: 'Studio' }] })).toMatchObject({
      developers: [{ name: 'Studio' }],
    });
  });

  it('rejects malformed search rows', () => {
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, languages: [4] })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, developers: [{ id: 'p1' }] })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, image: { url: 'x' } })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, titles: {} })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, titles: [{ lang: 'ja' }] })).toBeNull();
    expect(decodeVndbSearchRow({ ...SEARCH_ROW, developers: {} })).toBeNull();
  });

  it('accepts omitted optional metadata and a null image', () => {
    const { aliases: _aliases, titles: _titles, ...withoutOptionalRows } = SEARCH_ROW;
    expect(decodeVndbSearchRow({ ...withoutOptionalRows, image: null })).toMatchObject({
      id: 'v90061',
      image: null,
    });
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
    expect(decodeVndbCoverRow({ id: 'bad', image: null })).toBeNull();
    expect(decodeVndbCoverRow({ id: 'v90061', image: null })).toEqual({ id: 'v90061', image: null });
    expect(decodeVndbCoverRow({ id: 'v90061', image: { url: 'x' } })).toEqual({
      id: 'v90061',
      image: { url: 'x' },
    });
    expect(decodeVndbCoverRow({ id: 'v90061', image: { url: 'x', thumbnail: 4 } })).toBeNull();
    expect(decodeVndbCoverRow({ id: 'v90061', image: { url: 'x', sexual: Number.NaN } })).toBeNull();
  });
});
