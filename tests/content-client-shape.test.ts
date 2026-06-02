import { describe, expect, it } from 'vitest';
import { decodeCacheStatsResponse } from '../src/lib/cache-client-shape';
import { decodeQuotesResponse, decodeRandomQuoteResponse } from '../src/lib/quote-client-shape';
import { decodeVnTitleResponse } from '../src/lib/vn-summary-client-shape';

const quote = {
  id: 'q1',
  quote: 'Line',
  score: 1,
  vn: {
    id: 'V90001',
    title: 'Title',
    image_url: null,
    local_image: 'vn/cover.webp',
    local_image_thumb: null,
  },
  character: {
    id: 'C90001',
    name: 'Character',
    original: null,
    image: { local_path: 'character/portrait.webp' },
  },
};

describe('content response adapters', () => {
  it('decodes cache metrics', () => {
    expect(decodeCacheStatsResponse({
      stats: {
        total: 1,
        fresh: 1,
        stale: 0,
        bytes: 10,
        oldest: null,
        newest: 1,
        by_path: [{ path: 'POST /vn', n: 1 }],
      },
    })?.by_path[0]?.n).toBe(1);
    expect(decodeCacheStatsResponse({ stats: { total: -1 } })).toBeNull();
    expect(decodeCacheStatsResponse({
      stats: { total: 1, fresh: 1, stale: 0, bytes: 10, oldest: null, newest: null, by_path: [null] },
    })).toBeNull();
  });

  it('decodes enriched quote lists and random quote envelopes', () => {
    expect(decodeQuotesResponse({ quotes: [quote] })?.[0]?.vn?.id).toBe('v90001');
    expect(decodeRandomQuoteResponse({ quote, source: 'mine' })?.character?.id).toBe('c90001');
    expect(decodeRandomQuoteResponse({ quote: null, source: 'all' })).toBeNull();
    expect(decodeRandomQuoteResponse({ quote, source: 'bad' })).toBeUndefined();
  });

  it('rejects malformed quotes and decodes VN titles', () => {
    expect(decodeQuotesResponse({ quotes: [{ ...quote, score: '1' }] })).toBeNull();
    expect(decodeQuotesResponse({ quotes: Array(201).fill(quote) })).toBeNull();
    expect(decodeQuotesResponse({
      quotes: [{
        ...quote,
        vn: null,
        character: null,
      }],
    })?.[0]).toMatchObject({ vn: null, character: null });
    expect(decodeQuotesResponse({
      quotes: [{
        ...quote,
        vn: { id: 'v90002', title: 'Sparse' },
        character: { id: 'c90002', name: 'Sparse', original: null, image: null },
      }],
    })?.[0]?.character?.image).toBeNull();
    expect(decodeQuotesResponse({
      quotes: [{
        ...quote,
        character: { id: 'c90003', name: 'Sparse', original: null, image: {} },
      }],
    })?.[0]?.character?.image).toEqual({});
    expect(decodeQuotesResponse({
      quotes: [{
        ...quote,
        character: { id: 'c90005', name: 'Sparse', original: null },
      }],
    })?.[0]?.character).toEqual({
      id: 'c90005',
      name: 'Sparse',
      original: null,
    });
    expect(decodeQuotesResponse({ quotes: [{ ...quote, vn: { id: 'bad', title: 'Bad' } }] })).toBeNull();
    expect(decodeQuotesResponse({ quotes: [{ ...quote, character: { id: 'bad', name: 'Bad', original: null } }] })).toBeNull();
    expect(decodeQuotesResponse({ quotes: [{ ...quote, character: { id: 'c90004', name: 'Bad', original: null, image: 4 } }] })).toBeNull();
    expect(decodeQuotesResponse({ quotes: [{ ...quote, character: { id: 'c90004', name: 'Bad', original: null, image: { local_path: 4 } } }] })).toBeNull();
    expect(decodeRandomQuoteResponse({ quote: { ...quote, score: '1' }, source: 'all' })).toBeUndefined();
    expect(decodeVnTitleResponse({ vn: { title: 'Title' } })).toBe('Title');
    expect(decodeVnTitleResponse({ vn: { title: 4 } })).toBeNull();
  });
});
