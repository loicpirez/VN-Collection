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
  });

  it('decodes enriched quote lists and random quote envelopes', () => {
    expect(decodeQuotesResponse({ quotes: [quote] })?.[0]?.vn?.id).toBe('v90001');
    expect(decodeRandomQuoteResponse({ quote, source: 'mine' })?.character?.id).toBe('c90001');
    expect(decodeRandomQuoteResponse({ quote: null, source: 'all' })).toBeNull();
    expect(decodeRandomQuoteResponse({ quote, source: 'bad' })).toBeUndefined();
  });

  it('rejects malformed quotes and decodes VN titles', () => {
    expect(decodeQuotesResponse({ quotes: [{ ...quote, score: '1' }] })).toBeNull();
    expect(decodeVnTitleResponse({ vn: { title: 'Title' } })).toBe('Title');
    expect(decodeVnTitleResponse({ vn: { title: 4 } })).toBeNull();
  });
});
