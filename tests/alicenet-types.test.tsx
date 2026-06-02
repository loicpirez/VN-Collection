// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { AliceNetItem } from '@/components/alicenet-types';
import {
  ALICENET_SORTS,
  ALICENET_GROUPS,
  parseAliceNetPrice,
  comparableAliceNetDate,
  formatAliceNetDate,
  parseAliceNetDevs,
  parseAliceNetCandidates,
  alicenetMatchKind,
  displayAliceNetTitle,
  displayAliceNetProducer,
} from '@/components/alicenet-types';

/**
 * Build a fully-typed synthetic AliceNet item; callers override only the
 * fields a given assertion cares about.
 */
function makeItem(overrides: Partial<AliceNetItem> = {}): AliceNetItem {
  return {
    code: '001-000001-001',
    title: 'Title Y',
    jan: null,
    release_date: null,
    list_price: null,
    sale_price: null,
    vn_id: null,
    vn_match_source: null,
    vn_candidates: null,
    search_title: null,
    egs_id: null,
    egs_match_source: null,
    egs_title: null,
    egs_brand: null,
    egs_release_date: null,
    egs_image_url: null,
    egs_vndb_raw: null,
    in_collection: 0,
    in_wishlist: 0,
    last_matched_at: null,
    fetched_at: 0,
    updated_at: 0,
    vn_image_url: null,
    vn_local_image: null,
    vn_image_sexual: null,
    vn_developers: null,
    ...overrides,
  };
}

describe('alicenet-types constants', () => {
  it('exposes the canonical sort and group identifier lists', () => {
    expect(ALICENET_SORTS).toContain('match_status');
    expect(ALICENET_SORTS).toContain('updated_desc');
    expect(ALICENET_SORTS).toHaveLength(7);
    expect(ALICENET_GROUPS).toEqual(['none', 'match', 'producer', 'year']);
  });
});

describe('parseAliceNetPrice', () => {
  it('returns null for empty / null input', () => {
    expect(parseAliceNetPrice(null)).toBeNull();
    expect(parseAliceNetPrice('')).toBeNull();
  });
  it('strips currency markers and returns the positive integer yen', () => {
    expect(parseAliceNetPrice('¥4,270')).toBe(4270);
    expect(parseAliceNetPrice('4,270円')).toBe(4270);
  });
  it('returns null when there are no digits or the value is zero', () => {
    expect(parseAliceNetPrice('free')).toBeNull();
    expect(parseAliceNetPrice('¥0')).toBeNull();
  });
});

describe('comparableAliceNetDate', () => {
  it('returns empty string for null', () => {
    expect(comparableAliceNetDate(null)).toBe('');
  });
  it('canonicalises slash and dash JP dates to ISO with zero padding', () => {
    expect(comparableAliceNetDate('2017/12/22')).toBe('2017-12-22');
    expect(comparableAliceNetDate('2017-1-2')).toBe('2017-01-02');
  });
  it('passes through unrecognised formats verbatim', () => {
    expect(comparableAliceNetDate('coming soon')).toBe('coming soon');
  });
});

describe('formatAliceNetDate', () => {
  it('returns empty string for null', () => {
    expect(formatAliceNetDate(null, 'en')).toBe('');
  });
  it('formats an ISO-canonicalisable date', () => {
    const out = formatAliceNetDate('2017/12/22', 'en');
    expect(out).toContain('2017');
  });
  it('parses the year-month-day kanji form', () => {
    const out = formatAliceNetDate('2017年12月22日', 'en');
    expect(out).toContain('2017');
  });
  it('parses a year-only kanji form by defaulting month and day', () => {
    const out = formatAliceNetDate('2017年', 'en');
    expect(out).toContain('2017');
  });
  it('passes through a value that matches no known shape', () => {
    expect(formatAliceNetDate('TBA', 'en')).toBe('TBA');
  });
});

describe('parseAliceNetDevs', () => {
  it('returns an empty array for null or malformed JSON', () => {
    expect(parseAliceNetDevs(null)).toEqual([]);
    expect(parseAliceNetDevs('not json')).toEqual([]);
  });
  it('parses structurally valid named-id rows', () => {
    const rows = parseAliceNetDevs(JSON.stringify([{ id: 'p90001', name: 'Studio X' }]));
    expect(rows).toEqual([{ id: 'p90001', name: 'Studio X' }]);
  });
});

describe('parseAliceNetCandidates', () => {
  it('returns an empty array for null', () => {
    expect(parseAliceNetCandidates(null)).toEqual([]);
  });
  it('parses valid VNDB candidate rows and drops malformed siblings', () => {
    const rows = parseAliceNetCandidates(
      JSON.stringify([
        { id: 'v90001', title: 'Title Y', alttitle: null, released: '2017-01-01' },
        { id: 'not-a-vn', title: 'bad', alttitle: null, released: null },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('v90001');
  });
});

describe('alicenetMatchKind', () => {
  it('returns vndb when a VN id is present', () => {
    expect(alicenetMatchKind(makeItem({ vn_id: 'v90001' }))).toBe('vndb');
  });
  it('returns egs when only an EGS id is present', () => {
    expect(alicenetMatchKind(makeItem({ egs_id: 12345 }))).toBe('egs');
  });
  it('returns unresolved when the match source recorded none', () => {
    expect(alicenetMatchKind(makeItem({ vn_match_source: 'none' }))).toBe('unresolved');
  });
  it('returns new for an unprocessed item', () => {
    expect(alicenetMatchKind(makeItem())).toBe('new');
  });
});

describe('displayAliceNetTitle', () => {
  it('prefers the EGS title when present', () => {
    expect(displayAliceNetTitle(makeItem({ title: 'Raw', egs_title: 'Clean' }))).toBe('Clean');
  });
  it('falls back to the raw title', () => {
    expect(displayAliceNetTitle(makeItem({ title: 'Raw' }))).toBe('Raw');
  });
});

describe('displayAliceNetProducer', () => {
  it('prefers the first VNDB developer name', () => {
    const item = makeItem({
      vn_developers: JSON.stringify([{ id: 'p90001', name: 'Studio X' }]),
      egs_brand: 'Brand Z',
    });
    expect(displayAliceNetProducer(item)).toBe('Studio X');
  });
  it('falls back to the EGS brand', () => {
    expect(displayAliceNetProducer(makeItem({ egs_brand: 'Brand Z' }))).toBe('Brand Z');
  });
  it('returns empty string when neither is known', () => {
    expect(displayAliceNetProducer(makeItem())).toBe('');
  });
});
