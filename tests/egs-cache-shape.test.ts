import { describe, expect, it } from 'vitest';
import {
  decodeEgsAnticipatedPage,
  decodeEgsAnticipatedRows,
  decodeEgsCandidates,
  decodeEgsGame,
  decodeEgsRawColumnMap,
  decodeEgsTopRankedPage,
  decodeEgsTopRankedRows,
  decodeEgsUserReviews,
} from '@/lib/egs-cache-shape';

function game() {
  return {
    id: 900001,
    gamename: 'Synthetic game',
    gamename_furigana: null,
    brand_id: 11,
    brand_name: 'Studio X',
    model: null,
    description: null,
    image_url: '/api/egs-cover/900001',
    okazu: false,
    erogame: true,
    median: 80,
    average: 79.5,
    dispersion: 6,
    count: 40,
    sellday: '2099-01-01',
    playtime_median_minutes: 600,
    url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=900001',
    raw: { genre: 'synthetic', banner_url: null },
  };
}

function anticipated() {
  return {
    egs_id: 900002,
    gamename: 'Synthetic upcoming game',
    brand_name: null,
    sellday: '2099-02-01',
    vndb_id: 'V900002',
    will_buy: 12,
    probably_buy: 8,
    watching: 4,
  };
}

function topRanked() {
  return {
    egs_id: 900003,
    gamename: 'Synthetic ranked game',
    furigana: null,
    brand_id: null,
    brand_name: null,
    median: 85,
    average: 84.5,
    count: 50,
    sellday: null,
    banner_url: null,
    okazu: false,
    erogame: true,
    vndb_id: null,
  };
}

describe('EGS cache shape decoders', () => {
  it('decodes a complete game and copies its raw column map', () => {
    const value = game();
    const decoded = decodeEgsGame(value);
    expect(decoded).toEqual(value);
    expect(decoded?.raw).not.toBe(value.raw);
  });

  it('rejects a malformed game URL and malformed raw-column values', () => {
    expect(decodeEgsGame({ ...game(), url: 'https://example.invalid/game' })).toBeNull();
    expect(decodeEgsGame({ ...game(), raw: { genre: 42 } })).toBeNull();
    expect(decodeEgsRawColumnMap([])).toBeUndefined();
    expect(decodeEgsRawColumnMap({ genre: 42 })).toBeUndefined();
  });

  it('decodes candidate and review arrays', () => {
    expect(decodeEgsCandidates([
      {
        id: 900004,
        gamename: 'Synthetic candidate',
        gamename_furigana: null,
        median: 70,
        count: 4,
        sellday: null,
      },
    ])).toHaveLength(1);
    expect(decodeEgsUserReviews([
      {
        egs_id: 900005,
        gamename: 'Synthetic review row',
        tokuten: 88,
        total_play_time_hours: 4.5,
        start_date: null,
        finish_date: null,
        timestamp: '2099-01-02',
      },
    ])).toHaveLength(1);
  });

  it('rejects malformed members instead of returning partially trusted arrays', () => {
    expect(decodeEgsCandidates([{ id: '900004' }])).toBeNull();
    expect(decodeEgsUserReviews([{ egs_id: 900005, gamename: 'Synthetic', tokuten: Number.NaN }])).toBeNull();
    expect(decodeEgsAnticipatedRows(new Array(2001).fill(anticipated()))).toBeNull();
  });

  it('decodes anticipated rows and canonicalizes VNDB identifiers', () => {
    expect(decodeEgsAnticipatedRows([anticipated()])).toEqual([
      { ...anticipated(), vndb_id: 'v900002' },
    ]);
    expect(decodeEgsAnticipatedPage({ rows: [anticipated()], hasMore: true })).toEqual({
      rows: [{ ...anticipated(), vndb_id: 'v900002' }],
      hasMore: true,
    });
  });

  it('rejects malformed anticipated page envelopes', () => {
    expect(decodeEgsAnticipatedPage({ rows: [anticipated()], hasMore: 'yes' })).toBeNull();
    expect(decodeEgsAnticipatedPage({ rows: [{ ...anticipated(), vndb_id: 'bad' }], hasMore: false })).toBeNull();
  });

  it('decodes top-ranked rows and rejects malformed stale-page fields', () => {
    expect(decodeEgsTopRankedRows([topRanked()])).toEqual([topRanked()]);
    expect(decodeEgsTopRankedPage({ rows: [topRanked()], hasMore: false })).toEqual({
      rows: [topRanked()],
      hasMore: false,
    });
    expect(decodeEgsTopRankedRows([{ ...topRanked(), okazu: 'false' }])).toBeNull();
    expect(decodeEgsTopRankedPage({ rows: {}, hasMore: false })).toBeNull();
  });
});
