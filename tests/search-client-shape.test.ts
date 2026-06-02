import { describe, expect, it } from 'vitest';
import {
  decodeAddedEgsVnId,
  decodeEgsSearchCandidates,
  decodeEgsVndbManualLink,
  decodeVnEgsMappingState,
  decodeVnEgsGameSnapshot,
  decodeVndbPickerResults,
  decodeVndbSearchResults,
} from '@/lib/search-client-shape';

const vndbRow = {
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
  developers: [{ id: 'P90001', name: 'Studio' }],
  in_collection: false,
};

const egsGame = {
  id: 90001,
  gamename: 'Fixture',
  gamename_furigana: null,
  brand_id: null,
  brand_name: null,
  model: null,
  description: null,
  image_url: null,
  okazu: null,
  erogame: null,
  median: null,
  average: null,
  dispersion: null,
  count: null,
  sellday: null,
  playtime_median_minutes: null,
  url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=90001',
};

describe('search client response adapters', () => {
  it('decodes rich VNDB search rows and compact picker projections', () => {
    expect(decodeVndbSearchResults({ results: [vndbRow] })?.[0]?.id).toBe('v90001');
    expect(decodeVndbPickerResults({ results: [vndbRow] })?.[0]).toEqual({
      id: 'v90001',
      title: 'Fixture',
      released: null,
      developers: [{ id: 'p90001', name: 'Studio' }],
    });
    expect(decodeVndbPickerResults({
      results: [{ ...vndbRow, developers: undefined }],
    })?.[0]).toEqual({
      id: 'v90001',
      title: 'Fixture',
      released: null,
    });
    expect(decodeVndbPickerResults({
      results: [{ ...vndbRow, developers: [null, { id: 'bad', name: 'Bad' }, { id: 'P90002', name: 'Valid' }] }],
    })?.[0]?.developers).toEqual([{ id: 'p90002', name: 'Valid' }]);
  });

  it('decodes EGS candidates, manual links, mapping state, and synthetic ids', () => {
    expect(decodeEgsSearchCandidates({
      candidates: [{
        id: 90001,
        gamename: 'Fixture',
        gamename_furigana: null,
        median: 80,
        count: 4,
        sellday: null,
      }],
    })?.[0]?.id).toBe(90001);
    expect(decodeEgsVndbManualLink({
      link: { egs_id: 90001, vn_id: 'V90001', note: null, updated_at: 1 },
    })?.vn_id).toBe('v90001');
    expect(decodeEgsVndbManualLink({
      link: { egs_id: 90001, vn_id: null, note: 'note', updated_at: 1 },
    })?.vn_id).toBeNull();
    expect(decodeEgsVndbManualLink({ link: null })).toBeNull();
    expect(decodeVnEgsMappingState({
      game: { id: 90001 },
      manual: null,
      source: 'search',
    })).toEqual({ egs_id: 90001, source: 'search' });
    expect(decodeVnEgsMappingState({
      game: { id: 90001 },
      manual: { egs_id: 90002 },
      source: 'manual',
    })).toEqual({ egs_id: 90002, source: 'manual' });
    expect(decodeVnEgsMappingState({
      game: null,
      manual: { egs_id: null },
      source: null,
    })).toEqual({ egs_id: null, source: null });
    expect(decodeVnEgsGameSnapshot({ game: egsGame, source: 'manual' })?.game?.id).toBe(90001);
    expect(decodeVnEgsGameSnapshot({ game: null, source: 'manual-none' })).toEqual({
      game: null,
      source: 'manual-none',
    });
    expect(decodeAddedEgsVnId({ vn_id: 'EGS_90001' })).toBe('egs_90001');
  });

  it('rejects malformed nested payloads', () => {
    expect(decodeVndbSearchResults({ results: Array(101).fill(vndbRow) })).toBeNull();
    expect(decodeVndbSearchResults({ results: [{ ...vndbRow, languages: [4] }] })).toBeNull();
    expect(decodeVndbPickerResults({ results: [{ ...vndbRow, id: 'bad' }] })).toBeNull();
    expect(decodeEgsSearchCandidates({ candidates: [{ id: '90001' }] })).toBeNull();
    expect(decodeEgsVndbManualLink({ link: { egs_id: 90001, vn_id: 'bad', note: null, updated_at: 1 } })).toBeUndefined();
    expect(decodeVnEgsMappingState({ game: { id: '90001' }, manual: null, source: 'search' })).toBeNull();
    expect(decodeVnEgsMappingState({ game: null, manual: { egs_id: '90001' }, source: 'search' })).toBeNull();
    expect(decodeVnEgsMappingState({ game: null, manual: null, source: 'bad' })).toBeNull();
    expect(decodeVnEgsGameSnapshot({ game: { id: 90001 }, source: 'manual' })).toBeNull();
    expect(decodeVnEgsGameSnapshot({ game: null, source: 'bad' })).toBeNull();
    expect(decodeAddedEgsVnId({ vn_id: 'bad' })).toBeNull();
  });
});
