import { describe, expect, it } from 'vitest';
import { decodeVndbQuote } from '@/lib/vndb-quote-shape';

const QUOTE = {
  id: 'Q90071',
  quote: 'Fixture quote',
  score: 2,
  vn: {
    id: 'V90071',
    title: 'Fixture',
    alttitle: null,
    released: '2026-01-01',
    image: {
      id: 'cv90071',
      url: 'https://example.invalid/cover.jpg',
      thumbnail: 'https://example.invalid/cover-thumb.jpg',
      dims: [1200, 1800],
      thumbnail_dims: [200, 300],
      sexual: 0,
      violence: 0,
      votecount: 3,
    },
  },
  character: {
    id: 'C90071',
    name: 'Heroine',
    original: null,
    aliases: ['Alias'],
    image: {
      id: 'ch90071',
      url: 'https://example.invalid/character.jpg',
      dims: [600, 900],
      sexual: 0,
      violence: 0,
      votecount: 2,
    },
  },
};

describe('VNDB quote row decoder', () => {
  it('normalizes ids and preserves nested metadata', () => {
    expect(decodeVndbQuote(QUOTE)).toMatchObject({
      id: 'q90071',
      vn: {
        id: 'v90071',
        image: { thumbnail_dims: [200, 300] },
      },
      character: {
        id: 'c90071',
        aliases: ['Alias'],
        image: { dims: [600, 900] },
      },
    });
  });

  it('accepts quotes without VN or character rows', () => {
    expect(decodeVndbQuote({ ...QUOTE, vn: null, character: null })).toMatchObject({
      vn: null,
      character: null,
    });
  });

  it('rejects malformed quote and nested metadata rows', () => {
    expect(decodeVndbQuote({ ...QUOTE, id: 'bad' })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, score: Number.NaN })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, vn: { ...QUOTE.vn, id: 'bad' } })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, character: { ...QUOTE.character, aliases: [4] } })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, character: { ...QUOTE.character, image: { url: 4 } } })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, vn: 'bad' })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, character: 'bad' })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, vn: { ...QUOTE.vn, image: { url: 'x', dims: [1] } } })).toBeNull();
    expect(decodeVndbQuote({ ...QUOTE, character: { ...QUOTE.character, aliases: new Array(5001).fill('Alias') } })).toBeNull();
  });

  it('accepts minimal nested rows and sparse image metadata', () => {
    expect(decodeVndbQuote({
      id: 'q90072',
      quote: 'Minimal',
      score: 1,
      vn: {
        id: 'v90072',
        title: 'Fixture',
        image: null,
      },
      character: {
        id: 'c90072',
        name: 'Heroine',
        original: null,
        image: { url: 'https://example.invalid/character.jpg' },
      },
    })).toEqual({
      id: 'q90072',
      quote: 'Minimal',
      score: 1,
      vn: {
        id: 'v90072',
        title: 'Fixture',
        image: null,
      },
      character: {
        id: 'c90072',
        name: 'Heroine',
        original: null,
        image: { url: 'https://example.invalid/character.jpg' },
      },
    });
  });

  it('omits nested images when VNDB does not send image fields', () => {
    expect(decodeVndbQuote({
      id: 'q90073',
      quote: 'Sparse',
      score: 1,
      vn: {
        id: 'v90073',
        title: 'Fixture',
      },
      character: {
        id: 'c90073',
        name: 'Heroine',
        original: null,
      },
    })).toEqual({
      id: 'q90073',
      quote: 'Sparse',
      score: 1,
      vn: {
        id: 'v90073',
        title: 'Fixture',
      },
      character: {
        id: 'c90073',
        name: 'Heroine',
        original: null,
      },
    });
  });
});
