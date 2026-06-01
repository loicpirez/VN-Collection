import { describe, expect, it } from 'vitest';
import { decodeVndbResultsEnvelope } from '../src/lib/vndb-response-shape';

describe('decodeVndbResultsEnvelope', () => {
  it('normalizes optional pagination fields', () => {
    expect(decodeVndbResultsEnvelope({ results: [{ id: 'v90001' }] })).toEqual({
      results: [{ id: 'v90001' }],
      more: false,
    });
    expect(decodeVndbResultsEnvelope({ results: [], more: true, count: 12 })).toEqual({
      results: [],
      more: true,
      count: 12,
    });
  });

  it('rejects malformed envelopes and pagination fields', () => {
    expect(decodeVndbResultsEnvelope(null)).toBeNull();
    expect(decodeVndbResultsEnvelope([])).toBeNull();
    expect(decodeVndbResultsEnvelope({ results: null })).toBeNull();
    expect(decodeVndbResultsEnvelope({ results: [], more: 1 })).toBeNull();
    expect(decodeVndbResultsEnvelope({ results: [], count: -1 })).toBeNull();
    expect(decodeVndbResultsEnvelope({ results: [], count: 1.5 })).toBeNull();
  });

  it('rejects oversized results arrays', () => {
    expect(decodeVndbResultsEnvelope({ results: Array.from({ length: 1_001 }, () => null) })).toBeNull();
  });
});
