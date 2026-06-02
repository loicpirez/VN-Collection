import { describe, expect, it, vi } from 'vitest';
import {
  apiGameUrl,
  apiPriceStatsUrl,
  apiPricesUrl,
  apiRelatedUrl,
  buildErogePriceApiSearchUrl,
  buildErogePriceQueries,
  decodeStoredExtras,
  fetchErogePriceBundle,
  parseEpGameDetail,
  parseEpPriceHistory,
  parseEpPriceStats,
  parseEpRelated,
  parseEpSearch,
  searchAndFetchAll,
  type JsonFetcher,
} from '@/lib/erogeprice-meta';

/**
 * Exercises the defensive parser branches and the query builder that the
 * happy-path fixture suite (erogeprice-meta.test.ts) does not reach:
 * malformed/partial wire input, the legacy `egsId`/`selectedEgsId` upgrade,
 * tilde/full-width/decorative query variants, and the maxCandidates slice.
 */

describe('buildErogePriceQueries', () => {
  it('adds tilde, full-width, decorative-stripped, and kana-stem variants of the alttitle', () => {
    const queries = buildErogePriceQueries('てすと～ＡＢＣ☆', null);
    expect(queries).toContain('てすと～ＡＢＣ☆');
    expect(queries.some((q) => q.includes('ABC'))).toBe(true);
    expect(queries).toContain('てすと');
  });

  it('falls back to the title and dedupes case-insensitively', () => {
    const queries = buildErogePriceQueries(null, 'SampleGame');
    expect(queries).toContain('SampleGame');
    const lower = queries.filter((q) => q.toLowerCase() === 'samplegame');
    expect(lower.length).toBe(1);
  });

  it('skips inputs shorter than two characters', () => {
    expect(buildErogePriceQueries('あ', 'x')).toEqual([]);
  });

  it('includes alias variants of length two or more', () => {
    const queries = buildErogePriceQueries(null, null, ['えいりあす', 'a']);
    expect(queries).toContain('えいりあす');
    expect(queries).not.toContain('a');
  });

  it('returns an empty list when all inputs are blank', () => {
    expect(buildErogePriceQueries('  ', '', [' '])).toEqual([]);
  });

  it('ignores a whitespace-only title alongside a usable alttitle', () => {
    const queries = buildErogePriceQueries('えいりあすたいとる', '   ');
    expect(queries).toContain('えいりあすたいとる');
  });
});

describe('buildErogePriceApiSearchUrl', () => {
  it('appends a page parameter only for pages beyond the first', () => {
    expect(buildErogePriceApiSearchUrl('q', 1)).toBe('https://eroge-price.com/api/games?q=q');
    expect(buildErogePriceApiSearchUrl('q', 3)).toBe('https://eroge-price.com/api/games?q=q&page=3');
  });
});

describe('parseEpSearch defensive branches', () => {
  it('returns null for non-object input', () => {
    expect(parseEpSearch(null)).toBeNull();
    expect(parseEpSearch('nope')).toBeNull();
  });

  it('treats a missing games array as empty and defaults pagination from card count', () => {
    const payload = parseEpSearch({});
    expect(payload).not.toBeNull();
    expect(payload!.games).toEqual([]);
    expect(payload!.pagination).toEqual({ page: 1, limit: 0, total: 0 });
  });

  it('skips cards missing id or title and defaults retailerCount to 0', () => {
    const payload = parseEpSearch({
      games: [
        null,
        { title: 'no id' },
        { id: 5 },
        { id: 7, title: 'ok' },
      ],
    });
    expect(payload!.games).toHaveLength(1);
    expect(payload!.games[0]).toMatchObject({ id: 7, title: 'ok', retailerCount: 0 });
  });

  it('reads explicit pagination when provided', () => {
    const payload = parseEpSearch({
      games: [{ id: 1, title: 'a' }],
      pagination: { page: 3, limit: 10, total: 42 },
    });
    expect(payload!.pagination).toEqual({ page: 3, limit: 10, total: 42 });
  });
});

describe('parseEpGameDetail defensive branches', () => {
  it('returns null for non-object input or a card missing id/title', () => {
    expect(parseEpGameDetail(undefined)).toBeNull();
    expect(parseEpGameDetail({ id: 1 })).toBeNull();
    expect(parseEpGameDetail({ title: 'x' })).toBeNull();
  });

  it('defaults the staff block and drops malformed retailer rows', () => {
    const detail = parseEpGameDetail({
      id: 1,
      title: 'Detail',
      downloadRetailers: [
        { retailerId: 9, retailerName: 'Shop', productUrl: 'https://x/y' },
        { retailerName: 'no id' },
        null,
      ],
      packageRetailers: 'not-an-array',
    });
    expect(detail).not.toBeNull();
    expect(detail!.mainStaff).toEqual({ scenario: [], illustration: [], voice: [], music: [], singer: [] });
    expect(detail!.downloadRetailers).toHaveLength(1);
    expect(detail!.packageRetailers).toEqual([]);
  });
});

describe('parseEpPriceStats / parseEpPriceHistory defensive branches', () => {
  it('returns an all-null stats block for non-object input', () => {
    expect(parseEpPriceStats(null)).toEqual({
      allTimeMin: null,
      allTimeMax: null,
      allTimeMinNote: null,
      allTimeMaxNote: null,
      thirtyDayMin: null,
      thirtyDayMinNote: null,
    });
  });

  it('returns an empty history for non-array input', () => {
    expect(parseEpPriceHistory({})).toEqual([]);
  });

  it('skips price points missing any required field', () => {
    const points = parseEpPriceHistory([
      { id: 1, price: 100, scrapedAt: '2020-01-01T00:00:00Z', retailerId: 2, retailerName: 'S', retailerEdition: 'DOWNLOAD' },
      { id: 2, price: null, scrapedAt: '2020-01-02T00:00:00Z', retailerId: 2, retailerName: 'S', retailerEdition: 'PACKAGE' },
      { id: 3, price: 100, retailerId: 2, retailerName: 'S', retailerEdition: 'PACKAGE' },
      null,
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].id).toBe(1);
  });
});

describe('parseEpRelated defensive branches', () => {
  it('returns empty arrays for non-object input', () => {
    expect(parseEpRelated(null)).toEqual({ connections: [], sameBrand: [] });
  });

  it('defaults kind/kindLabel and skips malformed related items', () => {
    const related = parseEpRelated({
      connections: [
        { id: 11, title: 'Rel' },
        { title: 'no id' },
      ],
      sameBrand: [{ id: 22, title: 'Brand' }, null],
    });
    expect(related.connections).toHaveLength(1);
    expect(related.connections[0]).toMatchObject({ id: 11, kind: 'related', kindLabel: '' });
    expect(related.sameBrand).toHaveLength(1);
  });

  it('returns empty arrays when connections / sameBrand are present but not arrays', () => {
    const related = parseEpRelated({ connections: 'x', sameBrand: 42 });
    expect(related).toEqual({ connections: [], sameBrand: [] });
  });
});

describe('fetchErogePriceBundle', () => {
  it('returns null when the detail payload is malformed', async () => {
    const fetcher: JsonFetcher = () => Promise.resolve({});
    expect(await fetchErogePriceBundle(90001, fetcher)).toBeNull();
  });
});

describe('searchAndFetchAll', () => {
  it('returns null for a blank query without fetching', async () => {
    const fetcher = vi.fn();
    expect(await searchAndFetchAll('   ', fetcher as unknown as JsonFetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns null when every candidate detail is malformed but no fetch errored', async () => {
    const fetcher: JsonFetcher = (url) => {
      if (url === buildErogePriceApiSearchUrl('q')) {
        return Promise.resolve({ games: [{ id: 90001, title: 'g' }], pagination: { page: 1, limit: 1, total: 1 } });
      }
      if (url === apiGameUrl(90001)) return Promise.resolve({});
      if (url === apiPriceStatsUrl(90001)) return Promise.resolve({});
      if (url === apiPricesUrl(90001)) return Promise.resolve([]);
      if (url === apiRelatedUrl(90001)) return Promise.resolve({ connections: [], sameBrand: [] });
      return Promise.resolve({});
    };
    expect(await searchAndFetchAll('q', fetcher)).toBeNull();
  });

  it('limits the materialised candidates to maxCandidates', async () => {
    const games = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, title: `g${i}` }));
    const fetcher: JsonFetcher = (url) => {
      if (url === buildErogePriceApiSearchUrl('q')) {
        return Promise.resolve({ games, pagination: { page: 1, limit: 5, total: 5 } });
      }
      const epId = Number(/\/api\/games\/(\d+)/.exec(url)?.[1]);
      if (url.endsWith(`/api/games/${epId}`)) return Promise.resolve({ id: epId, title: `g${epId}` });
      if (url.endsWith('/priceStats')) return Promise.resolve({});
      if (url.endsWith('/prices')) return Promise.resolve([]);
      return Promise.resolve({ connections: [], sameBrand: [] });
    };
    const extras = await searchAndFetchAll('q', fetcher, undefined, 2);
    expect(extras!.candidates).toHaveLength(2);
    expect(extras!.candidates.map((c) => c.epId)).toEqual([100, 101]);
    expect(extras!.selectedEpId).toBe(100);
  });
});

describe('decodeStoredExtras legacy upgrade', () => {
  const detail = { id: 90001, title: 'Legacy', maker: null };

  it('returns null for absent, malformed, or wrong-schema payloads', () => {
    expect(decodeStoredExtras(null)).toBeNull();
    expect(decodeStoredExtras('{not json')).toBeNull();
    expect(decodeStoredExtras('42')).toBeNull();
    expect(decodeStoredExtras(JSON.stringify({ schemaVersion: 2, candidates: [] }))).toBeNull();
    expect(decodeStoredExtras(JSON.stringify({ schemaVersion: 1, candidates: 'x' }))).toBeNull();
  });

  it('upgrades the legacy egsId key to epId', () => {
    const decoded = decodeStoredExtras(JSON.stringify({
      schemaVersion: 1,
      candidates: [{ egsId: 90001, detail }],
      selectedEgsId: 90001,
    }));
    expect(decoded!.candidates[0].epId).toBe(90001);
    expect(decoded!.selectedEpId).toBe(90001);
    expect(decoded!.candidates[0].gameUrl).toBe('https://eroge-price.com/games/90001');
  });

  it('drops candidates with an invalid id and returns null when none survive', () => {
    expect(decodeStoredExtras(JSON.stringify({
      schemaVersion: 1,
      candidates: [{ epId: 0, detail }, { epId: -3, detail }, { detail }],
    }))).toBeNull();
  });

  it('skips non-object candidate entries', () => {
    const decoded = decodeStoredExtras(JSON.stringify({
      schemaVersion: 1,
      candidates: [null, 'nope', { epId: 90001, detail }],
    }));
    expect(decoded!.candidates).toHaveLength(1);
    expect(decoded!.candidates[0].epId).toBe(90001);
  });

  it('falls back to the first candidate when selected id is absent or unknown', () => {
    const decoded = decodeStoredExtras(JSON.stringify({
      schemaVersion: 1,
      candidates: [{ epId: 90001, detail }, { epId: 90002, detail: { id: 90002, title: 'Two' } }],
      selectedEpId: 99999,
    }));
    expect(decoded!.selectedEpId).toBe(90001);
  });

  it('preserves a stored gameUrl and fetchedAt when present and valid', () => {
    const decoded = decodeStoredExtras(JSON.stringify({
      schemaVersion: 1,
      candidates: [{ epId: 90001, detail, gameUrl: 'https://eroge-price.com/games/custom', fetchedAt: 123 }],
      searchQuery: 'q',
      refreshedAt: 456,
    }));
    expect(decoded!.candidates[0].gameUrl).toBe('https://eroge-price.com/games/custom');
    expect(decoded!.candidates[0].fetchedAt).toBe(123);
    expect(decoded!.searchQuery).toBe('q');
    expect(decoded!.refreshedAt).toBe(456);
  });
});
