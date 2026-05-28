/**
 * JSON-API fixture tests for the Eroge Price client.
 *
 * Fixtures are synthetic (ids 90001 / 90002) and live under
 * `tests/fixtures/eroge-price/json/`.
 *
 * The operator asked: "one exact name match can have many games;
 * integrate them all". `searchAndFetchAll` is the helper that does
 * that — every candidate the search returns becomes a fully-
 * hydrated `ErogePriceBundle` (detail + priceStats + priceHistory +
 * related) in the persisted `ErogePriceExtrasV1` envelope.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  apiGameUrl,
  apiPriceStatsUrl,
  apiPricesUrl,
  apiRelatedUrl,
  buildErogePriceApiSearchUrl,
  buildErogePriceGameUrl,
  buildErogePriceSearchUrl,
  fetchErogePriceBundle,
  parseEpGameDetail,
  parseEpPriceHistory,
  parseEpPriceStats,
  parseEpRelated,
  parseEpSearch,
  searchAndFetchAll,
  type JsonFetcher,
} from '../src/lib/erogeprice-meta';

const FIXTURE = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures/eroge-price/json', name), 'utf8'));

const SEARCH_SYNTHETIC = FIXTURE('search-synthetic.json');
const GAME_90001 = FIXTURE('game-90001.json');
const PRICES_90001 = FIXTURE('prices-90001.json');
const STATS_90001 = FIXTURE('priceStats-90001.json');
const RELATED_90001 = FIXTURE('related-90001.json');
const GAME_90002 = FIXTURE('game-90002.json');
const PRICES_90002 = FIXTURE('prices-90002.json');
const STATS_90002 = FIXTURE('priceStats-90002.json');
const RELATED_90002 = FIXTURE('related-90002.json');

const FIXTURE_ROUTER: Record<string, unknown> = {
  [buildErogePriceApiSearchUrl('synthetic-query')]: SEARCH_SYNTHETIC,
  [apiGameUrl(90001)]: GAME_90001,
  [apiPricesUrl(90001)]: PRICES_90001,
  [apiPriceStatsUrl(90001)]: STATS_90001,
  [apiRelatedUrl(90001)]: RELATED_90001,
  [apiGameUrl(90002)]: GAME_90002,
  [apiPricesUrl(90002)]: PRICES_90002,
  [apiPriceStatsUrl(90002)]: STATS_90002,
  [apiRelatedUrl(90002)]: RELATED_90002,
};

const fakeFetcher: JsonFetcher = (url) => {
  if (!(url in FIXTURE_ROUTER)) {
    throw new Error(`Unmocked URL: ${url}`);
  }
  return Promise.resolve(FIXTURE_ROUTER[url]);
};

describe('URL builders', () => {
  it('public search URL encodes query characters', () => {
    expect(buildErogePriceSearchUrl('synthetic-query')).toBe(
      'https://eroge-price.com/games?q=synthetic-query',
    );
  });

  it('public game URL is /games/{epId}', () => {
    expect(buildErogePriceGameUrl(90001)).toBe('https://eroge-price.com/games/90001');
  });

  it('JSON-API URLs are /api/games/{epId}*', () => {
    expect(apiGameUrl(90001)).toBe('https://eroge-price.com/api/games/90001');
    expect(apiPricesUrl(90001)).toBe('https://eroge-price.com/api/games/90001/prices');
    expect(apiPriceStatsUrl(90001)).toBe('https://eroge-price.com/api/games/90001/priceStats');
    expect(apiRelatedUrl(90001)).toBe('https://eroge-price.com/api/games/90001/related');
  });
});

describe('parseEpSearch — /api/games?q=synthetic-query', () => {
  const payload = parseEpSearch(SEARCH_SYNTHETIC);
  it('finds two synthetic candidates with rich card metadata', () => {
    expect(payload).not.toBeNull();
    expect(payload!.games).toHaveLength(2);
    expect(payload!.games.map((g) => g.id).sort((a, b) => a - b)).toEqual([90001, 90002]);
  });
  it('includes lowestPrice / lowestDownloadPrice / lowestPackagePrice', () => {
    const a = payload!.games.find((g) => g.id === 90001)!;
    expect(a.lowestPrice).toBe(2000);
    expect(a.lowestDownloadPrice).toBe(2000);
    expect(a.lowestPackagePrice).toBe(2500);
    expect(a.retailerCount).toBe(2);
  });
});

describe('parseEpGameDetail — /api/games/90001', () => {
  const d = parseEpGameDetail(GAME_90001)!;
  it('parses identity + flags', () => {
    expect(d.id).toBe(90001);
    expect(d.title).toBe('Synthetic VN Alpha');
    expect(d.maker).toBe('Test Studio');
    expect(d.releaseDate).toBe('2020-01-15T00:00:00.000Z');
    expect(d.platform).toBe('PC');
    expect(d.ageRating).toBe('R18');
    expect(d.hasDownload).toBe(true);
    expect(d.hasPackage).toBe(true);
  });
  it('parses the structured staff block including singer + voice', () => {
    expect(d.mainStaff.scenario).toEqual(['Author A']);
    expect(d.mainStaff.illustration).toEqual(['Artist B']);
    expect(d.mainStaff.singer).toEqual(['Singer C']);
    expect(d.mainStaff.voice).toEqual(['Voice X', 'Voice Y']);
    expect(d.mainStaff.music.length).toBeGreaterThanOrEqual(1);
  });
  it('parses every retailer row', () => {
    const names = [...d.downloadRetailers, ...d.packageRetailers].map((r) => r.retailerName);
    expect(names).toContain('TestShop DL');
    expect(names).toContain('TestShop PKG');
  });
  it('preserves official site URLs', () => {
    expect(d.officialSiteUrl).toBe('https://example.com/game-alpha');
    expect(d.brandSiteUrl).toBe('https://example.com/test-studio');
  });
});

describe('parseEpPriceStats — /api/games/90001/priceStats', () => {
  it('exposes allTimeMin / allTimeMax / thirtyDayMin verbatim', () => {
    const s = parseEpPriceStats(STATS_90001);
    expect(s.allTimeMin).toBe(1200);
    expect(s.allTimeMax).toBe(3000);
    expect(s.thirtyDayMin).toBe(1200);
  });
});

describe('parseEpPriceHistory — /api/games/90001/prices', () => {
  const points = parseEpPriceHistory(PRICES_90001);
  it('parses scrape points', () => {
    expect(points.length).toBe(5);
  });
  it('carries retailer name + edition (DOWNLOAD / PACKAGE)', () => {
    for (const p of points.slice(0, 5)) {
      expect(p.retailerEdition).toMatch(/^(DOWNLOAD|PACKAGE)$/);
      expect(p.retailerName.length).toBeGreaterThan(0);
      expect(p.price).toBeGreaterThan(0);
      expect(p.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('parseEpRelated — /api/games/90001/related', () => {
  const r = parseEpRelated(RELATED_90001);
  it('keeps connections with relationship kind labels', () => {
    expect(r.connections.length).toBeGreaterThan(0);
    const fandisk = r.connections.find((c) => c.kind === 'fandisk');
    expect(fandisk?.kindLabel).toBe('FD');
  });
  it('keeps sameBrand list non-empty', () => {
    expect(r.sameBrand.length).toBeGreaterThan(0);
    expect(r.sameBrand.every((g) => g.id > 0)).toBe(true);
  });
});

describe('fetchErogePriceBundle — single id', () => {
  it('assembles detail + stats + prices + related into one bundle', async () => {
    const bundle = await fetchErogePriceBundle(90001, fakeFetcher);
    expect(bundle).not.toBeNull();
    expect(bundle!.epId).toBe(90001);
    expect(bundle!.detail.title).toBe('Synthetic VN Alpha');
    expect(bundle!.priceStats.allTimeMin).toBe(1200);
    expect(bundle!.priceHistory.length).toBeGreaterThan(0);
    expect(bundle!.related.connections.length).toBeGreaterThan(0);
    expect(bundle!.gameUrl).toBe('https://eroge-price.com/games/90001');
  });
});

describe('searchAndFetchAll — integrates EVERY candidate', () => {
  it('returns both synthetic releases (operator requirement: integrate them all)', async () => {
    const extras = await searchAndFetchAll('synthetic-query', fakeFetcher);
    expect(extras).not.toBeNull();
    expect(extras!.schemaVersion).toBe(1);
    expect(extras!.candidates.map((c) => c.epId).sort((a, b) => a - b)).toEqual([90001, 90002]);
    expect(extras!.selectedEpId).toBe(extras!.candidates[0].epId);
    expect(extras!.searchQuery).toBe('synthetic-query');
  });

  it('each candidate carries its own detail / stats / history / related', async () => {
    const extras = await searchAndFetchAll('synthetic-query', fakeFetcher);
    const c90002 = extras!.candidates.find((c) => c.epId === 90002)!;
    expect(c90002.detail.releaseDate).toBe('2021-06-01T00:00:00.000Z');
    expect(c90002.priceStats.allTimeMin).toBe(1500);
    expect(c90002.priceHistory.length).toBeGreaterThan(0);
  });

  it('throws when search finds candidates but all bundle fetches fail', async () => {
    const fakeSearch = {
      games: [{ id: 90001, title: 'synthetic-test', maker: null, releaseDate: null, coverImageUrl: null, ageRating: null, hasDownload: true, hasPackage: false, lowestPrice: null, lowestDownloadPrice: null, lowestPackagePrice: null, platform: null, retailerCount: 0 }],
      pagination: { page: 1, limit: 20, total: 1 },
    };
    const errFetcher: JsonFetcher = (url) => {
      if (url.includes('/api/games?')) return Promise.resolve(fakeSearch);
      return Promise.reject(new Error('HTTP 503 from eroge-price.com'));
    };
    await expect(searchAndFetchAll('dummy', errFetcher)).rejects.toThrow('HTTP 503');
  });

  it('returns null (no_results) when search yields zero candidates', async () => {
    const emptySearch = { games: [], pagination: { page: 1, limit: 20, total: 0 } };
    const emptyFetcher: JsonFetcher = () => Promise.resolve(emptySearch);
    await expect(searchAndFetchAll('dummy', emptyFetcher)).resolves.toBeNull();
  });
});
