import { describe, expect, it } from 'vitest';
import { decodeNominatimResults } from '../src/lib/nominatim-shape';

describe('Nominatim response adapter', () => {
  it('preserves valid result rows', () => {
    expect(decodeNominatimResults([
      { display_name: 'Shop', lat: '35.1', lon: '135.2', ignored: true },
    ])).toEqual([{ display_name: 'Shop', lat: '35.1', lon: '135.2' }]);
  });

  it('drops malformed rows and out-of-range coordinates', () => {
    expect(decodeNominatimResults([
      { display_name: 'Valid', lat: '-90', lon: '180' },
      { display_name: 'Missing longitude', lat: '35.1' },
      { display_name: 'Bad latitude', lat: '91', lon: '135.2' },
      { display_name: 'Not numeric', lat: 'north', lon: 'east' },
      null,
    ])).toEqual([{ display_name: 'Valid', lat: '-90', lon: '180' }]);
  });

  it('rejects malformed and oversized envelopes', () => {
    expect(decodeNominatimResults({ results: [] })).toBeNull();
    expect(decodeNominatimResults(Array.from({ length: 21 }, () => ({
      display_name: 'Shop',
      lat: '35.1',
      lon: '135.2',
    })))).toBeNull();
  });
});
