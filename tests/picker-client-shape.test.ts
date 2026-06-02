import { describe, expect, it } from 'vitest';
import {
  decodeEgsSourcePickerResults,
  decodeLocalVnSourcePickerResults,
  decodeProducerPickerResults,
  decodeProducerRefreshSummary,
  decodeTagPickerResults,
  decodeVndbSourcePickerResults,
} from '@/lib/picker-client-shape';

const VNDB_ROW = {
  id: 'V90001',
  title: 'Fixture',
  alttitle: null,
  aliases: [],
  titles: [],
  released: null,
  rating: null,
  votecount: null,
  length_minutes: null,
  languages: ['ja'],
  platforms: ['win'],
  image: null,
  developers: [],
  in_collection: false,
};

describe('picker client response adapters', () => {
  it('decodes tag and producer picker rows', () => {
    expect(decodeTagPickerResults({ tags: [{ id: 'G90001', name: 'Tag', category: 'cont', vn_count: 1 }] })?.[0]?.id).toBe('g90001');
    expect(decodeProducerPickerResults({ producers: [{ id: 'P90001', name: 'Studio', original: null, vn_count: 1 }] })?.[0]?.id).toBe('p90001');
  });

  it('projects library, VNDB, and EGS rows into one picker shape', () => {
    expect(decodeLocalVnSourcePickerResults({
      matches: [{
        id: 'V90001',
        title: 'Local',
        image_url: 'https://example.invalid/full.jpg',
        image_thumb: null,
        local_image: 'vn/full.jpg',
        local_image_thumb: 'vn/thumb.jpg',
      }],
    })?.[0]).toMatchObject({
      id: 'v90001',
      thumbnail: 'https://example.invalid/full.jpg',
      localThumbnail: 'vn/thumb.jpg',
    });
    expect(decodeLocalVnSourcePickerResults({
      matches: [{
        id: 'v90002',
        title: 'Local sparse',
        image_url: null,
        image_thumb: null,
        local_image: 'vn/full.jpg',
        local_image_thumb: null,
      }],
    })?.[0]).toMatchObject({
      thumbnail: null,
      localThumbnail: 'vn/full.jpg',
    });
    expect(decodeVndbSourcePickerResults({ results: [VNDB_ROW] })?.[0]?.id).toBe('v90001');
    expect(decodeEgsSourcePickerResults({
      candidates: [{ id: 90001, gamename: 'EGS', gamename_furigana: null, median: null, count: null, sellday: null }],
    })?.[0]?.id).toBe('egs_90001');
  });

  it('decodes refresh counters and rejects malformed rows', () => {
    expect(decodeProducerRefreshSummary({ developers: 1, publishers: 2, owned: 3, stale: false })).toEqual({
      developers: 1,
      publishers: 2,
      owned: 3,
      stale: false,
    });
    expect(decodeTagPickerResults({ tags: [{ id: 'bad' }] })).toBeNull();
    expect(decodeProducerPickerResults({ producers: [{ id: 'bad' }] })).toBeNull();
    expect(decodeLocalVnSourcePickerResults({ matches: [{ id: 'bad' }] })).toBeNull();
    expect(decodeTagPickerResults({ tags: Array(2_001).fill(null) })).toBeNull();
    expect(decodeProducerPickerResults({ producers: Array(2_001).fill(null) })).toBeNull();
    expect(decodeLocalVnSourcePickerResults({ matches: Array(2_001).fill(null) })).toBeNull();
    expect(decodeVndbSourcePickerResults({ results: [{ id: 'bad' }] })).toBeNull();
    expect(decodeEgsSourcePickerResults({ candidates: [{ id: 'bad' }] })).toBeNull();
    expect(decodeProducerRefreshSummary({ developers: '1' })).toBeNull();
  });
});
