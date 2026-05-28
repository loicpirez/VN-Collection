/**
 * JSON-API fixture tests for the Eroge Price client.
 *
 * Real responses were captured 2026-05-28 with
 *   `curl https://eroge-price.com/api/games?q=…` etc.
 * Fixtures live under `tests/fixtures/eroge-price/json/`.
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

const SEARCH_SAYA = FIXTURE('search-saya.json');
const GAME_3676 = FIXTURE('game-3676.json');
const PRICES_3676 = FIXTURE('prices-3676.json');
const STATS_3676 = FIXTURE('priceStats-3676.json');
const RELATED_3676 = FIXTURE('related-3676.json');
const GAME_33072 = FIXTURE('game-33072.json');
const PRICES_33072 = FIXTURE('prices-33072.json');
const STATS_33072 = FIXTURE('priceStats-33072.json');
const RELATED_33072 = FIXTURE('related-33072.json');

/** Look up the right JSON for the requested API URL. */
const FIXTURE_ROUTER: Record<string, unknown> = {
  [buildErogePriceApiSearchUrl('沙耶の唄')]: SEARCH_SAYA,
  [apiGameUrl(3676)]: GAME_3676,
  [apiPricesUrl(3676)]: PRICES_3676,
  [apiPriceStatsUrl(3676)]: STATS_3676,
  [apiRelatedUrl(3676)]: RELATED_3676,
  [apiGameUrl(33072)]: GAME_33072,
  [apiPricesUrl(33072)]: PRICES_33072,
  [apiPriceStatsUrl(33072)]: STATS_33072,
  [apiRelatedUrl(33072)]: RELATED_33072,
};

const fakeFetcher: JsonFetcher = (url) => {
  if (!(url in FIXTURE_ROUTER)) {
    throw new Error(`Unmocked URL: ${url}`);
  }
  return Promise.resolve(FIXTURE_ROUTER[url]);
};

describe('URL builders', () => {
  it('public search URL encodes Japanese', () => {
    expect(buildErogePriceSearchUrl('沙耶の唄')).toBe(
      'https://eroge-price.com/games?q=%E6%B2%99%E8%80%B6%E3%81%AE%E5%94%84',
    );
  });

  it('public game URL is /games/{egsId}', () => {
    expect(buildErogePriceGameUrl(3676)).toBe('https://eroge-price.com/games/3676');
  });

  it('JSON-API URLs are /api/games/{egsId}*', () => {
    expect(apiGameUrl(3676)).toBe('https://eroge-price.com/api/games/3676');
    expect(apiPricesUrl(3676)).toBe('https://eroge-price.com/api/games/3676/prices');
    expect(apiPriceStatsUrl(3676)).toBe('https://eroge-price.com/api/games/3676/priceStats');
    expect(apiRelatedUrl(3676)).toBe('https://eroge-price.com/api/games/3676/related');
  });
});

describe('parseEpSearch — /api/games?q=沙耶の唄', () => {
  const payload = parseEpSearch(SEARCH_SAYA);
  it('finds two Saya-no-Uta candidates with rich card metadata', () => {
    expect(payload).not.toBeNull();
    expect(payload!.games).toHaveLength(2);
    expect(payload!.games.map((g) => g.id).sort((a, b) => a - b)).toEqual([3676, 33072]);
  });
  it('includes lowestPrice / lowestDownloadPrice / lowestPackagePrice', () => {
    const a = payload!.games.find((g) => g.id === 3676)!;
    expect(a.lowestPrice).toBe(2530);
    expect(a.lowestDownloadPrice).toBe(2530);
    expect(a.lowestPackagePrice).toBe(3211);
    expect(a.retailerCount).toBe(3);
  });
});

describe('parseEpGameDetail — /api/games/3676', () => {
  const d = parseEpGameDetail(GAME_3676)!;
  it('parses identity + flags', () => {
    expect(d.id).toBe(3676);
    expect(d.title).toBe('沙耶の唄');
    expect(d.maker).toBe('NitroPlus');
    expect(d.releaseDate).toBe('2003-12-26T00:00:00.000Z');
    expect(d.platform).toBe('PC');
    expect(d.ageRating).toBe('R18');
    expect(d.hasDownload).toBe(true);
    expect(d.hasPackage).toBe(true);
  });
  it('parses the structured staff block including singer + voice', () => {
    expect(d.mainStaff.scenario).toEqual(['虚淵玄']);
    expect(d.mainStaff.illustration).toEqual(['中央東口']);
    expect(d.mainStaff.singer).toEqual(['いとうかなこ']);
    expect(d.mainStaff.voice).toEqual([
      '矢沢泉',
      '川村みどり',
      '海原エレナ',
      '佐藤まこと',
      '氷河流',
      '片岡大二郎',
      '鬼沢雅維',
    ]);
    expect(d.mainStaff.music.length).toBeGreaterThanOrEqual(4);
  });
  it('parses every retailer row (DLsite, FANZA, 駿河屋)', () => {
    const names = [...d.downloadRetailers, ...d.packageRetailers].map((r) => r.retailerName);
    expect(names).toContain('DLsite');
    expect(names).toContain('FANZA');
    expect(names).toContain('駿河屋');
  });
  it('preserves official site URLs', () => {
    expect(d.officialSiteUrl).toBe('https://www.nitroplus.co.jp/pc/lineup/into_06/');
    expect(d.brandSiteUrl).toBe('https://www.nitroplus.co.jp/');
  });
});

describe('parseEpPriceStats — /api/games/3676/priceStats', () => {
  it('exposes allTimeMin / allTimeMax / thirtyDayMin verbatim', () => {
    const s = parseEpPriceStats(STATS_3676);
    expect(s.allTimeMin).toBe(1501);
    expect(s.allTimeMax).toBe(3990);
    expect(s.thirtyDayMin).toBe(1501);
  });
});

describe('parseEpPriceHistory — /api/games/3676/prices', () => {
  const points = parseEpPriceHistory(PRICES_3676);
  it('parses every scrape point', () => {
    expect(points.length).toBeGreaterThan(100);
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

describe('parseEpRelated — /api/games/3676/related', () => {
  const r = parseEpRelated(RELATED_3676);
  it('keeps connections with relationship kind labels (FD / 移植 / …)', () => {
    expect(r.connections.length).toBeGreaterThan(0);
    const fandisk = r.connections.find((c) => c.kind === 'fandisk');
    expect(fandisk?.kindLabel).toBe('FD');
    const port = r.connections.find((c) => c.kind === 'transplant');
    expect(port?.kindLabel).toBe('移植');
  });
  it('keeps sameBrand list non-empty for a NitroPlus title', () => {
    expect(r.sameBrand.length).toBeGreaterThan(0);
    expect(r.sameBrand.every((g) => g.id > 0)).toBe(true);
  });
});

describe('fetchErogePriceBundle — single id', () => {
  it('assembles detail + stats + prices + related into one bundle', async () => {
    const bundle = await fetchErogePriceBundle(3676, fakeFetcher);
    expect(bundle).not.toBeNull();
    expect(bundle!.egsId).toBe(3676);
    expect(bundle!.detail.title).toBe('沙耶の唄');
    expect(bundle!.priceStats.allTimeMin).toBe(1501);
    expect(bundle!.priceHistory.length).toBeGreaterThan(100);
    expect(bundle!.related.connections.length).toBeGreaterThan(0);
    expect(bundle!.gameUrl).toBe('https://eroge-price.com/games/3676');
  });
});

describe('searchAndFetchAll — integrates EVERY candidate', () => {
  it('returns both Saya-no-Uta releases (operator requirement: integrate them all)', async () => {
    const extras = await searchAndFetchAll('沙耶の唄', fakeFetcher);
    expect(extras).not.toBeNull();
    expect(extras!.schemaVersion).toBe(1);
    expect(extras!.candidates.map((c) => c.egsId).sort((a, b) => a - b)).toEqual([3676, 33072]);
    expect(extras!.selectedEgsId).toBe(extras!.candidates[0].egsId);
    expect(extras!.searchQuery).toBe('沙耶の唄');
  });

  it('each candidate carries its own detail / stats / history / related', async () => {
    const extras = await searchAndFetchAll('沙耶の唄', fakeFetcher);
    const c33072 = extras!.candidates.find((c) => c.egsId === 33072)!;
    expect(c33072.detail.releaseDate).toBe('2015-11-27T00:00:00.000Z');
    expect(c33072.priceStats.allTimeMin).toBe(2200);
    expect(c33072.priceHistory.length).toBeGreaterThan(0);
  });
});
