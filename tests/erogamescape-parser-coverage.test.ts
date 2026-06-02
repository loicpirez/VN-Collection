/**
 * Hermetic coverage for the ErogameScape SQL-form client
 * (`src/lib/erogamescape.ts`). Every outbound call is intercepted at the
 * `providerFetch` boundary and fed synthetic HTML tables shaped like the EGS
 * SQL form output; release-extlink lookups are intercepted at the `@/lib/vndb`
 * `getReleasesForVn` boundary. No network, no real titles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { allowTargetMock } = vi.hoisted(() => ({ allowTargetMock: vi.fn() }));

vi.mock('@/lib/proxy-fetch', () => ({ providerFetch: vi.fn() }));
vi.mock('@/lib/vndb', () => ({ getReleasesForVn: vi.fn() }));
vi.mock('@/lib/url-allowlist', () => ({ isAllowedHttpTarget: allowTargetMock }));

import { db } from '@/lib/db';
import { providerFetch } from '@/lib/proxy-fetch';
import { getReleasesForVn } from '@/lib/vndb';
import type { VndbRelease } from '@/lib/vndb';
import {
  applyManualEgsToVndb,
  clearEgsCache,
  egsBayesianScore,
  fetchEgsAnticipated,
  fetchEgsAnticipatedPage,
  fetchEgsGame,
  fetchEgsTopRanked,
  fetchEgsTopRankedPage,
  fetchEgsUserReviews,
  linkEgsToVn,
  resolveEgsForVn,
  searchEgsByName,
  searchEgsCandidates,
  EgsUnreachable,
} from '@/lib/erogamescape';

const mockProviderFetch = vi.mocked(providerFetch);
const mockGetReleases = vi.mocked(getReleasesForVn);

/**
 * Build an HTML response body that mirrors the EGS SQL form result table.
 * `rows[0]` is the header row (rendered as `<th>`), the rest are `<td>`.
 * When `named` is true the table carries the `sql_for_erogamer` class so the
 * named-table regex path is exercised; otherwise the last-table fallback runs.
 */
function tableHtml(rows: string[][], opts: { named?: boolean } = {}): string {
  const { named = true } = opts;
  const body = rows
    .map((cells, rowIndex) => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      const tds = cells.map((c) => `<${tag}>${c}</${tag}>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  const cls = named ? ' class="result sql_for_erogamer wide"' : '';
  return `<html><body><table${cls}>${body}</table></body></html>`;
}

function ok(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, { status: 200, headers });
}

/**
 * Queue a sequence of `providerFetch` results in call order. Each entry is
 * either a ready `Response` or a factory producing one (for status codes).
 */
function queueFetches(...responses: Array<Response | (() => Response)>): void {
  for (const r of responses) {
    mockProviderFetch.mockImplementationOnce(async () => (typeof r === 'function' ? r() : r));
  }
}

function clearCache(): void {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:%'`).run();
}

function clearEgsRows(): void {
  db.prepare(`DELETE FROM egs_game`).run();
  db.prepare(`DELETE FROM vn_egs_link`).run();
  db.prepare(`DELETE FROM egs_vn_link`).run();
  db.prepare(`DELETE FROM collection`).run();
  db.prepare(`DELETE FROM vn`).run();
}

function seedVn(id: string, title: string, alttitle: string | null = null): void {
  db.prepare(`INSERT INTO vn (id, title, alttitle, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, alttitle = excluded.alttitle`)
    .run(id, title, alttitle, Date.now());
}

function releaseWithExtlinks(extlinks: VndbRelease['extlinks']): VndbRelease {
  return {
    id: 'r90001',
    title: 'Release',
    alttitle: null,
    languages: [],
    platforms: [],
    media: [],
    released: null,
    minage: null,
    patch: false,
    freeware: false,
    uncensored: null,
    official: true,
    has_ero: false,
    resolution: null,
    engine: null,
    voiced: null,
    notes: null,
    gtin: null,
    catalog: null,
    producers: [],
    extlinks,
    vns: [],
    images: [],
  };
}

beforeEach(() => {
  clearCache();
  clearEgsRows();
  mockProviderFetch.mockReset();
  mockGetReleases.mockReset();
  mockGetReleases.mockResolvedValue([]);
  allowTargetMock.mockReset();
  allowTargetMock.mockReturnValue(true);
});

afterEach(() => {
  clearCache();
  clearEgsRows();
  vi.restoreAllMocks();
});

describe('egsBayesianScore', () => {
  it('pulls a low-vote outlier toward the prior mean', () => {
    const shrunk = egsBayesianScore(100, 1);
    expect(shrunk).toBeGreaterThan(70);
    expect(shrunk).toBeLessThan(100);
  });

  it('barely moves a high-vote median', () => {
    const score = egsBayesianScore(85, 2000);
    expect(score).toBeGreaterThan(84);
    expect(score).toBeLessThan(85.5);
  });
});

describe('fetchEgsGame', () => {
  it('rejects a non-integer id before any fetch', async () => {
    await expect(fetchEgsGame(1.5)).rejects.toThrow(/invalid EGS SQL integer/);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('parses a game row plus playtime median and caches the result', async () => {
    // call 1: the g.* + brandlist join. call 2: the userreview playtime query.
    queueFetches(
      ok(tableHtml([
        ['gamename', 'furigana', 'model', 'okazu', 'erogame', 'median', 'average2', 'stdev', 'count2', 'sellday', 'total_play_time_median', 'brand_fk_id', 'brand_name'],
        ['Synthetic Title A', 'しんせてぃっく', 'PC', 't', 'f', '78', '76', '12', '40', '2020-05-01', '20', '900', 'Studio Placeholder'],
      ])),
      ok(tableHtml([['total_play_time'], ['10'], ['12'], ['14']])),
    );

    const game = await fetchEgsGame(4192);
    expect(game).not.toBeNull();
    expect(game).toMatchObject({
      id: 4192,
      gamename: 'Synthetic Title A',
      gamename_furigana: 'しんせてぃっく',
      brand_id: 900,
      brand_name: 'Studio Placeholder',
      okazu: true,
      erogame: false,
      median: 78,
      average: 76,
      dispersion: 12,
      count: 40,
      sellday: '2020-05-01',
      image_url: '/api/egs-cover/4192',
    });
    // 3 values [10,12,14] → median 12h → 720 minutes.
    expect(game?.playtime_median_minutes).toBe(720);

    // Second call hits the cache: no further providerFetch invocations.
    mockProviderFetch.mockReset();
    const cached = await fetchEgsGame(4192);
    expect(cached?.id).toBe(4192);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('falls back to gamelist.total_play_time_median when userreview has no rows', async () => {
    queueFetches(
      ok(tableHtml([
        ['gamename', 'furigana', 'median', 'average2', 'stdev', 'count2', 'sellday', 'total_play_time_median', 'brand_fk_id', 'brand_name'],
        ['Synthetic Title B', 'NULL', '60', '60', '5', '12', 'NULL', '8', 'NULL', 'NULL'],
      ])),
      ok(tableHtml([['total_play_time']])), // header only → no userreview median
    );
    const game = await fetchEgsGame(7);
    // gamelist median 8h → 480 minutes.
    expect(game?.playtime_median_minutes).toBe(480);
    expect(game?.gamename_furigana).toBeNull();
    expect(game?.brand_id).toBeNull();
    expect(game?.sellday).toBeNull();
  });

  it('caches a negative result when the row is absent', async () => {
    queueFetches(ok(tableHtml([['gamename']]))); // header only → fetchOne returns null
    const game = await fetchEgsGame(99999);
    expect(game).toBeNull();
    const row = db
      .prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:game:99999'`)
      .get() as { body: string } | undefined;
    expect(row?.body).toBe('null');
  });

  it('propagates EgsUnreachable on a 429 and does not cache', async () => {
    queueFetches(() => new Response('rate limited', { status: 429 }));
    await expect(fetchEgsGame(5)).rejects.toBeInstanceOf(EgsUnreachable);
    const row = db.prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:game:5'`).get();
    expect(row).toBeUndefined();
  });

  it('maps a 403 to a blocked EgsUnreachable', async () => {
    queueFetches(() => new Response('forbidden', { status: 403 }));
    await expect(fetchEgsGame(6)).rejects.toMatchObject({ kind: 'blocked', status: 403 });
  });

  it('maps a 500 to a server EgsUnreachable', async () => {
    queueFetches(() => new Response('boom', { status: 500 }));
    await expect(fetchEgsGame(8)).rejects.toMatchObject({ kind: 'server' });
  });

  it('maps a thrown fetch (DNS/connection) to a network EgsUnreachable', async () => {
    mockProviderFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(fetchEgsGame(9)).rejects.toMatchObject({ kind: 'network' });
  });

  it('maps a non-Error thrown fetch value to a network EgsUnreachable', async () => {
    mockProviderFetch.mockRejectedValueOnce('offline');
    await expect(fetchEgsGame(901)).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects an over-large declared content-length', async () => {
    queueFetches(() => new Response('x', { status: 200, headers: { 'content-length': String(5 * 1024 * 1024) } }));
    await expect(fetchEgsGame(10)).rejects.toMatchObject({ kind: 'server' });
  });

  it('rejects an over-large response body even without a content-length header', async () => {
    queueFetches(ok('x'.repeat(4 * 1024 * 1024 + 1)));
    await expect(fetchEgsGame(902)).rejects.toMatchObject({ kind: 'server' });
  });

  it('rejects a static EGS endpoint when it is absent from the SSRF allowlist', async () => {
    allowTargetMock.mockReturnValueOnce(false);
    await expect(fetchEgsGame(903)).rejects.toMatchObject({ kind: 'blocked' });
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('maps a response-like status zero to a server EgsUnreachable', async () => {
    const response = ok('');
    Object.defineProperty(response, 'status', { value: 0 });
    mockProviderFetch.mockResolvedValueOnce(response);
    await expect(fetchEgsGame(904)).rejects.toMatchObject({ kind: 'server', status: 0 });
  });

  it('aborts a stalled provider fetch after the timeout', async () => {
    vi.useFakeTimers();
    try {
      mockProviderFetch.mockImplementationOnce(async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      );
      const pending = fetchEgsGame(905);
      const assertion = expect(pending).rejects.toMatchObject({ kind: 'network' });
      await vi.advanceTimersByTimeAsync(7_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('decodes HTML entities and numeric character references in cells', async () => {
    queueFetches(
      ok(tableHtml([
        ['gamename', 'median', 'count2', 'brand_name'],
        // &#x... hex ref, &rarr; / &hellip; named entities, decimal ref, &nbsp;.
        ['A &amp; B &#65; &times; &#x42; &rarr;&hellip;&nbsp;end', '50', '5', 'Br&lt;X&gt;'],
      ])),
      ok(tableHtml([['total_play_time']])),
    );
    const game = await fetchEgsGame(11);
    expect(game?.gamename).toBe('A & B A × B →… end');
    expect(game?.brand_name).toBe('Br<X>');
  });

  it('maps an unrecognized boolean cell to null', async () => {
    queueFetches(
      ok(tableHtml([
        ['gamename', 'median', 'count2', 'okazu', 'erogame'],
        ['Weird Bools', '50', '5', 'maybe', '2'], // neither t/f/true/false/0/1
      ])),
      ok(tableHtml([['total_play_time']])),
    );
    const game = await fetchEgsGame(13);
    expect(game?.okazu).toBeNull();
    expect(game?.erogame).toBeNull();
  });

  it('defaults a missing title and a missing trailing cell in a sparse game row', async () => {
    queueFetches(
      ok(tableHtml([['median', 'count2'], ['50']])),
      ok(tableHtml([['total_play_time']])),
    );
    const game = await fetchEgsGame(14);
    expect(game?.gamename).toBe('');
    expect(game?.count).toBeNull();
  });

  it('short-circuits to the cached game when a fresh cache row exists', async () => {
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Cache Hit', '60', '8']])),
      ok(tableHtml([['total_play_time'], ['5']])),
    );
    const first = await fetchEgsGame(12);
    expect(first?.gamename).toBe('Cache Hit');
    mockProviderFetch.mockReset();
    const second = await fetchEgsGame(12);
    expect(second?.gamename).toBe('Cache Hit');
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });
});

describe('searchEgsByName', () => {
  it('returns null for an empty query without fetching', async () => {
    expect(await searchEgsByName('   ')).toBeNull();
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('returns null when the query sanitizes to nothing', async () => {
    // Every character here is outside the EGS-LIKE allowlist (which keeps
    // letters/digits/marks plus a small punctuation set), so the sanitizer
    // returns '' and the function short-circuits before fetching.
    expect(await searchEgsByName('();\'"@#$')).toBeNull();
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('resolves the top id then fetches the full game', async () => {
    queueFetches(
      ok(tableHtml([['id'], ['321']])), // search → one id
      ok(tableHtml([ // fetchEgsGame g.* row
        ['gamename', 'median', 'count2'],
        ['Synthetic Searched', '70', '15'],
      ])),
      ok(tableHtml([['total_play_time'], ['5']])), // playtime median
    );
    const game = await searchEgsByName('synthetic');
    expect(game?.id).toBe(321);
    expect(game?.gamename).toBe('Synthetic Searched');
  });

  it('caches an empty search result when zero rows come back', async () => {
    queueFetches(ok(tableHtml([['id']]))); // header only
    const game = await searchEgsByName('missing-xyz');
    expect(game).toBeNull();
    const row = db
      .prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:search:missing-xyz'`)
      .get() as { body: string } | undefined;
    expect(row?.body).toBe('null');
  });

  it('returns null when the resolved id cell is non-numeric', async () => {
    queueFetches(ok(tableHtml([['id'], ['NULL']])));
    expect(await searchEgsByName('weird')).toBeNull();
  });

  it('serves a cached search result without fetching again', async () => {
    queueFetches(
      ok(tableHtml([['id'], ['322']])),
      ok(tableHtml([['gamename'], ['Cached Search']])),
      ok(tableHtml([['total_play_time']])),
    );
    expect((await searchEgsByName('cached-search'))?.id).toBe(322);
    mockProviderFetch.mockReset();
    expect((await searchEgsByName('cached-search'))?.id).toBe(322);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });
});

describe('searchEgsCandidates', () => {
  it('returns [] for an empty query', async () => {
    expect(await searchEgsCandidates('  ')).toEqual([]);
  });

  it('returns [] when the sanitized query is empty', async () => {
    expect(await searchEgsCandidates('***')).toEqual([]);
  });

  it('maps multiple candidate rows by header position', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'gamename_furigana', 'median', 'count', 'sellday'],
      ['1', 'Cand One', 'かな1', '80', '30', '2019-01-01'],
      // Short row: trailing cells absent → `r[idx] ?? null` yields null and
      // `toNumber(undefined)` yields null. A literal "NULL" cell would survive
      // the `?? null` guard, so we drop the cells entirely instead.
      ['2', 'Cand Two'],
      ['3'],
      ['NULL', 'Skipped', 'x', '1', '1', '2000-01-01'], // id null → skipped
    ])));
    const out = await searchEgsCandidates('cand', 10);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ id: 1, gamename: 'Cand One', gamename_furigana: 'かな1', median: 80, count: 30 });
    expect(out[1]).toMatchObject({ id: 2, gamename: 'Cand Two', gamename_furigana: null, median: null, count: null, sellday: null });
    expect(out[2]).toMatchObject({ id: 3, gamename: '' });
  });

  it('caches an empty candidate list on zero rows', async () => {
    queueFetches(ok(tableHtml([['id', 'gamename']])));
    expect(await searchEgsCandidates('none', 5)).toEqual([]);
    const row = db
      .prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:candidates:5:none'`)
      .get() as { body: string } | undefined;
    expect(row?.body).toBe('[]');
  });

  it('serves a cached candidate list without re-fetching', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'gamename_furigana', 'median', 'count', 'sellday'],
      ['7', 'Cached Cand', 'NULL', '50', '5', 'NULL'],
    ])));
    const first = await searchEgsCandidates('cachehit', 20);
    expect(first).toHaveLength(1);
    mockProviderFetch.mockReset();
    const second = await searchEgsCandidates('cachehit', 20);
    expect(second).toHaveLength(1);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });
});

describe('parseHtmlTable branches (via fetchEgsGame)', () => {
  it('detects the explicit no-results sentinel and returns no game', async () => {
    queueFetches(ok('<html><body><p>該当するデータはありません</p></body></html>'));
    const game = await fetchEgsGame(123);
    expect(game).toBeNull();
  });

  it('uses the last-table fallback when no class attribute is present', async () => {
    queueFetches(
      ok(`<html><body>` +
        `<table><tr><th>noise</th></tr><tr><td>ignore</td></tr></table>` +
        tableHtml([['gamename', 'median', 'count2'], ['Fallback Title', '55', '7']], { named: false })
          .replace(/^<html><body>|<\/body><\/html>$/g, '') +
        `</body></html>`),
      ok(tableHtml([['total_play_time']])),
    );
    const game = await fetchEgsGame(456);
    expect(game?.gamename).toBe('Fallback Title');
  });

  it('returns no game when HTML contains neither a named nor fallback table', async () => {
    queueFetches(ok('<html><body><p>empty</p></body></html>'));
    expect(await fetchEgsGame(457)).toBeNull();
  });

  it('ignores table rows that contain no cells', async () => {
    queueFetches(ok('<table class="sql_for_erogamer"><tr></tr></table>'));
    expect(await fetchEgsGame(458)).toBeNull();
  });
});

describe('fetchEgsAnticipated', () => {
  it('parses anticipated rows and validates the vndb cross-link', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'],
      ['100', 'Upcoming A', '2099-01-01', 'Brand A', 'v555', '42', '10', '5'],
      // Empty brand cell → `r[idx] || null` yields null; non-VN vndb cell → null.
      ['101', 'Upcoming B', '2099-02-02', '', 'not-an-id', '1', '0', '0'],
      ['NULL', 'Skip', '2099-03-03', 'x', '', '0', '0', '0'],
    ])));
    const rows = await fetchEgsAnticipated(50);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ egs_id: 100, vndb_id: 'v555', will_buy: 42, probably_buy: 10, watching: 5 });
    expect(rows[1]).toMatchObject({ egs_id: 101, brand_name: null, vndb_id: null });
  });

  it('defaults missing anticipated row cells without dropping a valid id', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'],
      ['102'],
    ])));
    expect(await fetchEgsAnticipated(51)).toEqual([{
      egs_id: 102,
      gamename: '',
      brand_name: null,
      sellday: '',
      vndb_id: null,
      will_buy: 0,
      probably_buy: 0,
      watching: 0,
    }]);
  });

  it('returns [] without caching when zero rows come back', async () => {
    queueFetches(ok(tableHtml([['id', 'gamename']])));
    expect(await fetchEgsAnticipated(50)).toEqual([]);
    const row = db.prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:anticipated:50'`).get();
    expect(row).toBeUndefined();
  });

  it('serves a non-empty cache hit and applies the manual override overlay', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'],
      ['200', 'Overlaid', '2099-01-01', 'NULL', '', '3', '1', '0'],
    ])));
    await fetchEgsAnticipated(60);
    // Pin a manual EGS->VNDB override for egs 200.
    db.prepare(`INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at) VALUES (200, 'v777', NULL, ?) ON CONFLICT(egs_id) DO UPDATE SET vn_id = excluded.vn_id`)
      .run(Date.now());
    mockProviderFetch.mockReset();
    const cached = await fetchEgsAnticipated(60);
    expect(mockProviderFetch).not.toHaveBeenCalled();
    expect(cached[0].vndb_id).toBe('v777');
  });
});

describe('fetchEgsAnticipatedPage', () => {
  it('derives hasMore from the +1 probe row, skips id-less rows, and trims it', async () => {
    const header = ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'];
    const body = Array.from({ length: 11 }, (_, i) => [String(300 + i), `Pg ${i}`, '2099-01-01', 'NULL', '', '1', '0', '0']);
    // A NULL-id row interleaved → the parser skips it (id == null → continue).
    body.splice(1, 0, ['NULL', 'Skip Me', '2099-01-01', 'NULL', '', '0', '0', '0']);
    queueFetches(ok(tableHtml([header, ...body])));
    const page = await fetchEgsAnticipatedPage(1, 10);
    expect(page.rows).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(10);
  });

  it('returns an empty page on zero rows', async () => {
    queueFetches(ok(tableHtml([['id', 'gamename']])));
    const page = await fetchEgsAnticipatedPage(2, 25);
    expect(page.rows).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('defaults missing anticipated page cells without dropping a valid id', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'],
      ['311'],
    ])));
    const page = await fetchEgsAnticipatedPage(20, 100);
    expect(page.rows).toEqual([{
      egs_id: 311,
      gamename: '',
      brand_name: null,
      sellday: '',
      vndb_id: null,
      will_buy: 0,
      probably_buy: 0,
      watching: 0,
    }]);
  });

  it('keeps a valid VNDB link and avoids caching when every anticipated page row has an invalid id', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'],
      ['312', 'Linked', '2099-01-01', '', 'v123', '1', '0', '0'],
    ])));
    expect((await fetchEgsAnticipatedPage(1, 10)).rows[0]?.vndb_id).toBe('v123');

    queueFetches(ok(tableHtml([['id'], ['NULL']])));
    expect((await fetchEgsAnticipatedPage(2, 10)).rows).toEqual([]);
    expect(db.prepare(`SELECT 1 FROM vndb_cache WHERE cache_key = 'egs:anticipated:p2:10'`).get()).toBeUndefined();
  });

  it('serves an expired cache row with stale=true when the fetch fails', async () => {
    const cacheKey = 'egs:anticipated:p1:10';
    const payload = {
      rows: [{ egs_id: 9001, gamename: 'Stale Row', brand_name: null, sellday: '2099-01-01', vndb_id: null, will_buy: 5, probably_buy: 0, watching: 0 }],
      hasMore: false,
    };
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES (?, ?, NULL, NULL, ?, ?)`)
      .run(cacheKey, JSON.stringify(payload), now - 86_400_000, now - 3_600_000);
    mockProviderFetch.mockRejectedValueOnce(new Error('down'));
    const page = await fetchEgsAnticipatedPage(1, 10);
    expect(page.stale).toBe(true);
    expect(page.rows[0].egs_id).toBe(9001);
    expect(page.fetchedAt).toBeGreaterThan(0);
  });

  it('rethrows when the fetch fails and there is no expired cache', async () => {
    mockProviderFetch.mockRejectedValue(new Error('down-and-empty'));
    await expect(fetchEgsAnticipatedPage(3, 10)).rejects.toThrow();
  });

  it('rethrows when the expired anticipated cache body is malformed or decodes to null', async () => {
    const now = Date.now();
    const key = 'egs:anticipated:p1:10';
    for (const body of ['{broken', JSON.stringify({ rows: 'bad', hasMore: false })]) {
      db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES (?, ?, NULL, NULL, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`)
        .run(key, body, now - 86_400_000, now - 3_600_000);
      mockProviderFetch.mockRejectedValueOnce(new Error('down'));
      await expect(fetchEgsAnticipatedPage(1, 10)).rejects.toThrow();
    }
  });
});

describe('fetchEgsTopRanked', () => {
  it('parses rows, prefers median over median2, and reads boolean flags', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'],
      ['400', 'Top A', 'NULL', '900', 'Brand A', '88', 'NULL', '85', '120', '2018-01-01', 'https://example/b.jpg', 't', 'f', 'v123'],
      ['401', 'Top B (legacy median)', 'NULL', 'NULL', 'NULL', 'NULL', '72', '70', '50', 'NULL', 'NULL', 'f', 't', 'garbage'],
    ])));
    const rows = await fetchEgsTopRanked(100, 10);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ egs_id: 400, median: 88, okazu: true, erogame: false, vndb_id: 'v123', banner_url: 'https://example/b.jpg' });
    // median NULL → median2 fallback used.
    expect(rows[1]).toMatchObject({ egs_id: 401, median: 72, okazu: false, erogame: true, vndb_id: null });
  });

  it('skips invalid top-ranked ids and defaults missing optional cells', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'],
      ['NULL'],
      ['402'],
    ])));
    expect(await fetchEgsTopRanked(11, 1)).toEqual([{
      egs_id: 402,
      gamename: '',
      furigana: null,
      brand_id: null,
      brand_name: null,
      median: null,
      average: null,
      count: null,
      sellday: null,
      banner_url: null,
      okazu: false,
      erogame: false,
      vndb_id: null,
    }]);
  });

  it('does not cache a zero-row response', async () => {
    queueFetches(ok(tableHtml([['id', 'gamename']])));
    expect(await fetchEgsTopRanked(100, 10)).toEqual([]);
    const row = db.prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:top-ranked:10:100'`).get();
    expect(row).toBeUndefined();
  });
});

describe('fetchEgsTopRankedPage', () => {
  it('trims the probe row, skips id-less rows, and reports hasMore', async () => {
    const header = ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'];
    const body = Array.from({ length: 11 }, (_, i) => [String(500 + i), `TP ${i}`, 'NULL', 'NULL', 'NULL', '90', 'NULL', '88', '40', 'NULL', 'NULL', 'f', 'f', '']);
    // A NULL-id row → the parser skips it (id == null → continue).
    body.splice(1, 0, ['NULL', 'Skip', 'NULL', 'NULL', 'NULL', '90', 'NULL', '88', '40', 'NULL', 'NULL', 'f', 'f', '']);
    queueFetches(ok(tableHtml([header, ...body])));
    const page = await fetchEgsTopRankedPage(1, 10, 5);
    expect(page.rows).toHaveLength(10);
    expect(page.hasMore).toBe(true);
  });

  it('serves an expired cache row with stale=true on fetch failure', async () => {
    const cacheKey = 'egs:top-ranked:10:p1:10';
    const rows = [{ egs_id: 600, gamename: 'Stale Top', furigana: null, brand_id: null, brand_name: null, median: 90, average: 88, count: 30, sellday: null, banner_url: null, okazu: false, erogame: false, vndb_id: null }];
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES (?, ?, NULL, NULL, ?, ?)`)
      .run(cacheKey, JSON.stringify({ rows, hasMore: false }), now - 86_400_000, now - 3_600_000);
    mockProviderFetch.mockRejectedValueOnce(new Error('down'));
    const page = await fetchEgsTopRankedPage(1, 10, 10);
    expect(page.stale).toBe(true);
    expect(page.rows[0].egs_id).toBe(600);
  });

  it('returns an empty page on zero rows', async () => {
    queueFetches(ok(tableHtml([['id', 'gamename']])));
    const page = await fetchEgsTopRankedPage(1, 10, 10);
    expect(page.rows).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('defaults missing top-ranked page cells without dropping a valid id', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'],
      ['601'],
    ])));
    const page = await fetchEgsTopRankedPage(1, 100, 1);
    expect(page.rows).toEqual([{
      egs_id: 601,
      gamename: '',
      furigana: null,
      brand_id: null,
      brand_name: null,
      median: null,
      average: null,
      count: null,
      sellday: null,
      banner_url: null,
      okazu: false,
      erogame: false,
      vndb_id: null,
    }]);
  });

  it('keeps a valid VNDB link on a top-ranked page row', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'],
      ['602', 'Linked', '', '', '', '80', '', '', '', '', '', '', '', 'v124'],
    ])));
    expect((await fetchEgsTopRankedPage(1, 10, 2)).rows[0]?.vndb_id).toBe('v124');
  });

  it('does not cache a top-ranked page when every parsed row has an invalid id', async () => {
    queueFetches(ok(tableHtml([['id'], ['NULL']])));
    expect((await fetchEgsTopRankedPage(1, 10, 1)).rows).toEqual([]);
    expect(db.prepare(`SELECT 1 FROM vndb_cache WHERE cache_key = 'egs:top-ranked:1:p1:10'`).get()).toBeUndefined();
  });

  it('rethrows when the fetch fails and there is no expired cache', async () => {
    mockProviderFetch.mockRejectedValue(new Error('down-and-empty'));
    await expect(fetchEgsTopRankedPage(2, 10, 10)).rejects.toThrow();
  });
});

describe('fetchEgsUserReviews', () => {
  it('returns [] for an empty username without fetching', async () => {
    expect(await fetchEgsUserReviews('   ')).toEqual([]);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('rejects a username with illegal characters before fetching', async () => {
    expect(await fetchEgsUserReviews('bad user!')).toEqual([]);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('maps review rows by header and skips rows without an id', async () => {
    queueFetches(ok(tableHtml([
      ['egs_id', 'tokuten', 'total_play_time', 'start_date', 'finish_date', 'timestamp', 'gamename'],
      ['10', '85', '12', '2020-01-01', '2020-02-01', '2020-02-02', 'Rev Game'],
      ['NULL', '50', '5', '', '', '', 'Skipped'],
    ])));
    const out = await fetchEgsUserReviews('user_a');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ egs_id: 10, tokuten: 85, total_play_time_hours: 12, start_date: '2020-01-01', gamename: 'Rev Game' });
  });

  it('defaults missing optional review cells and serves the cached result', async () => {
    queueFetches(ok(tableHtml([
      ['egs_id', 'tokuten', 'total_play_time', 'start_date', 'finish_date', 'timestamp', 'gamename'],
      ['11'],
    ])));
    expect(await fetchEgsUserReviews('cached_user')).toEqual([{
      egs_id: 11,
      gamename: '',
      tokuten: null,
      total_play_time_hours: null,
      start_date: null,
      finish_date: null,
      timestamp: null,
    }]);
    mockProviderFetch.mockReset();
    expect(await fetchEgsUserReviews('cached_user')).toHaveLength(1);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('caches an empty result on zero rows', async () => {
    queueFetches(ok(tableHtml([['egs_id', 'gamename']])));
    expect(await fetchEgsUserReviews('emptyuser')).toEqual([]);
    const row = db
      .prepare(`SELECT body FROM vndb_cache WHERE cache_key = 'egs:user-reviews:emptyuser'`)
      .get() as { body: string } | undefined;
    expect(row?.body).toBe('[]');
  });

  it('returns [] when the fetch throws', async () => {
    mockProviderFetch.mockRejectedValueOnce(new Error('boom'));
    expect(await fetchEgsUserReviews('throwuser')).toEqual([]);
  });
});

describe('applyManualEgsToVndb', () => {
  it('returns the input unchanged when there are no rows', () => {
    expect(applyManualEgsToVndb([])).toEqual([]);
  });

  it('overlays manual overrides and leaves unmapped rows alone', () => {
    db.prepare(`INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at) VALUES (10, 'v999', NULL, ?)`).run(Date.now());
    db.prepare(`INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at) VALUES (11, NULL, NULL, ?)`).run(Date.now());
    const rows = [
      { egs_id: 10, vndb_id: null },
      { egs_id: 11, vndb_id: 'v111' },
      { egs_id: 12, vndb_id: 'v222' },
    ];
    const out = applyManualEgsToVndb(rows);
    expect(out[0].vndb_id).toBe('v999');
    expect(out[1].vndb_id).toBeNull(); // explicit "no VNDB" override
    expect(out[2].vndb_id).toBe('v222'); // untouched
  });
});

describe('resolveEgsForVn', () => {
  it('short-circuits a synthetic egs_<id> VN to that EGS id', async () => {
    db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES ('egs_4242', 'Synthetic EGS-only', ?)`).run(Date.now());
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Synthetic EGS-only', '60', '8']])),
      ok(tableHtml([['total_play_time']])),
    );
    const res = await resolveEgsForVn('egs_4242');
    // The synthetic id is treated as a direct EGS id, so the returned source
    // mirrors the extlink path; persistence rewrites it to 'manual'.
    expect(res.source).toBe('extlink');
    expect(res.game?.id).toBe(4242);
    const row = db.prepare(`SELECT egs_id, source FROM egs_game WHERE vn_id = 'egs_4242'`).get() as { egs_id: number; source: string } | undefined;
    expect(row?.egs_id).toBe(4242);
    expect(row?.source).toBe('manual');
  });

  it('honours a manual-none pin without any fetch', async () => {
    seedVn('v100', 'Title V100');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v100', NULL, NULL, ?)`).run(Date.now());
    const res = await resolveEgsForVn('v100');
    expect(res).toEqual({ game: null, source: 'manual-none' });
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('honours a manual pin to a specific EGS id and persists it as manual', async () => {
    seedVn('v101', 'Title V101');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v101', 808, NULL, ?)`).run(Date.now());
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Pinned Game', '90', '50']])),
      ok(tableHtml([['total_play_time'], ['4']])),
    );
    const res = await resolveEgsForVn('v101');
    expect(res.source).toBe('manual');
    expect(res.game?.id).toBe(808);
    const row = db.prepare(`SELECT source FROM egs_game WHERE vn_id = 'v101'`).get() as { source: string } | undefined;
    expect(row?.source).toBe('manual');
  });

  it('falls back to the cached row when a manual-pinned id is unreachable', async () => {
    seedVn('v102', 'Title V102');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v102', 909, NULL, ?)`).run(Date.now());
    // Pre-seed a successful egs_game row so the unreachable path can fall back to it.
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v102', 909, 'Cached Pinned', 'manual', ?)`)
      .run(Date.now());
    queueFetches(() => new Response('rl', { status: 429 }));
    const res = await resolveEgsForVn('v102');
    expect(res.source).toBe('manual');
    expect(res.game?.id).toBe(909);
  });

  it('resolves via a VNDB release extlink (source: extlink)', async () => {
    seedVn('v103', 'Title V103');
    mockGetReleases.mockResolvedValue([
      { extlinks: [{ url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=4192', label: 'ErogameScape', name: '' }] },
    ] as never);
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Linked Via Extlink', '70', '12']])),
      ok(tableHtml([['total_play_time'], ['6']])),
    );
    const res = await resolveEgsForVn('v103');
    expect(res.source).toBe('extlink');
    expect(res.game?.id).toBe(4192);
  });

  it('falls back to a name search when no extlink is present', async () => {
    seedVn('v104', 'Title V104', 'Alt V104');
    mockGetReleases.mockResolvedValue([{ extlinks: [{ url: 'https://store.example/x', label: 'Other', name: '' }] }] as never);
    queueFetches(
      ok(tableHtml([['id'], ['1234']])), // searchEgsByName id lookup
      ok(tableHtml([['gamename', 'median', 'count2'], ['Found By Search', '65', '9']])),
      ok(tableHtml([['total_play_time'], ['3']])),
    );
    const res = await resolveEgsForVn('v104');
    expect(res.source).toBe('search');
    expect(res.game?.id).toBe(1234);
  });

  it('persists a negative result when a clean lookup finds nothing', async () => {
    seedVn('v105', 'Title V105', 'Alt V105');
    mockGetReleases.mockResolvedValue([] as never);
    queueFetches(ok(tableHtml([['id']]))); // search → zero rows
    const res = await resolveEgsForVn('v105');
    expect(res.game).toBeNull();
    expect(res.source).toBeNull();
    const row = db.prepare(`SELECT egs_id, source FROM egs_game WHERE vn_id = 'v105'`).get() as { egs_id: number | null; source: string | null } | undefined;
    expect(row).toBeDefined();
    expect(row?.egs_id).toBeNull();
  });

  it('preserves a prior successful match when a fresh lookup is unreachable', async () => {
    seedVn('v106', 'Title V106');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v106', 4242, 'Prior Match', 'extlink', ?)`)
      .run(Date.now() - 100 * 24 * 3600 * 1000); // stale enough to force re-resolve
    mockGetReleases.mockResolvedValue([
      { extlinks: [{ url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=4242', label: 'ErogameScape', name: '' }] },
    ] as never);
    queueFetches(() => new Response('rl', { status: 429 }));
    const res = await resolveEgsForVn('v106', { force: true });
    expect(res.game?.id).toBe(4242);
    expect(res.source).toBe('extlink');
  });

  it('returns the fresh cached row when it is recent (no fetch)', async () => {
    seedVn('v107', 'Title V107');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v107', 555, 'Recent Cache', 'search', ?)`)
      .run(Date.now());
    const res = await resolveEgsForVn('v107');
    expect(res.game?.id).toBe(555);
    expect(res.source).toBe('search');
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('reports no match without persisting when never matched and EGS is down', async () => {
    seedVn('v108', 'Title V108', 'Alt V108');
    mockGetReleases.mockResolvedValue([] as never);
    queueFetches(() => new Response('rl', { status: 429 })); // search throws EgsUnreachable
    const res = await resolveEgsForVn('v108');
    expect(res).toEqual({ game: null, source: null });
    const row = db.prepare(`SELECT 1 FROM egs_game WHERE vn_id = 'v108'`).get();
    expect(row).toBeUndefined();
  });
});

describe('linkEgsToVn', () => {
  it('fetches, persists as manual, and pins the override', async () => {
    seedVn('v200', 'Title V200');
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Manually Linked', '77', '20']])),
      ok(tableHtml([['total_play_time'], ['8']])),
    );
    const game = await linkEgsToVn('v200', 333);
    expect(game?.id).toBe(333);
    const link = db.prepare(`SELECT egs_id FROM vn_egs_link WHERE vn_id = 'v200'`).get() as { egs_id: number } | undefined;
    expect(link?.egs_id).toBe(333);
    const row = db.prepare(`SELECT source FROM egs_game WHERE vn_id = 'v200'`).get() as { source: string } | undefined;
    expect(row?.source).toBe('manual');
  });

  it('returns null and persists nothing when the game is absent', async () => {
    seedVn('v201', 'Title V201');
    queueFetches(ok(tableHtml([['gamename']]))); // header only → null
    const game = await linkEgsToVn('v201', 444);
    expect(game).toBeNull();
    const link = db.prepare(`SELECT 1 FROM vn_egs_link WHERE vn_id = 'v201'`).get();
    expect(link).toBeUndefined();
  });

  it('persists a synthetic EGS-only link without writing a VNDB override', async () => {
    seedVn('egs_445', 'Synthetic EGS');
    queueFetches(
      ok(tableHtml([['gamename'], ['Synthetic Manual']])),
      ok(tableHtml([['total_play_time']])),
    );
    expect((await linkEgsToVn('egs_445', 445))?.id).toBe(445);
    expect(db.prepare(`SELECT 1 FROM vn_egs_link WHERE vn_id = 'egs_445'`).get()).toBeUndefined();
  });

  it('persists each concrete EGS boolean value from manually linked games', async () => {
    for (const [vnId, egsId, okazu, erogame] of [['v202', 446, 't', 'f'], ['v203', 447, 'f', 't']] as const) {
      seedVn(vnId, `Title ${vnId}`);
      queueFetches(
        ok(tableHtml([['gamename', 'okazu', 'erogame'], [`Manual ${egsId}`, okazu, erogame]])),
        ok(tableHtml([['total_play_time']])),
      );
      expect((await linkEgsToVn(vnId, egsId))?.id).toBe(egsId);
    }
    const rows = db.prepare(`SELECT vn_id, okazu, erogame FROM egs_game WHERE vn_id IN ('v202', 'v203') ORDER BY vn_id`).all();
    expect(rows).toEqual([
      { vn_id: 'v202', okazu: 1, erogame: 0 },
      { vn_id: 'v203', okazu: 0, erogame: 1 },
    ]);
  });

  it('persists a decoded cached game without optional raw columns', async () => {
    seedVn('v204', 'Title V204');
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES (?, ?, NULL, NULL, ?, ?)`)
      .run('egs:game:448', JSON.stringify({
        id: 448,
        gamename: 'Cached without raw',
        gamename_furigana: null,
        brand_id: null,
        brand_name: null,
        model: null,
        description: null,
        image_url: '/api/egs-cover/448',
        okazu: null,
        erogame: null,
        median: null,
        average: null,
        dispersion: null,
        count: null,
        sellday: null,
        playtime_median_minutes: null,
        url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=448',
      }), now, now + 3_600_000);
    expect((await linkEgsToVn('v204', 448))?.id).toBe(448);
    expect(db.prepare(`SELECT raw_json FROM egs_game WHERE vn_id = 'v204'`).get()).toEqual({ raw_json: null });
  });
});

describe('clearEgsCache', () => {
  it('drops the egs_game row in auto mode', async () => {
    seedVn('v300', 'Title V300');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v300', 1, 'X', 'search', ?)`).run(Date.now());
    clearEgsCache('v300');
    expect(db.prepare(`SELECT 1 FROM egs_game WHERE vn_id = 'v300'`).get()).toBeUndefined();
  });

  it('sets a manual-none pin in manual-none mode', async () => {
    seedVn('v301', 'Title V301');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v301', 1, 'X', 'search', ?)`).run(Date.now());
    clearEgsCache('v301', 'manual-none');
    const link = db.prepare(`SELECT egs_id FROM vn_egs_link WHERE vn_id = 'v301'`).get() as { egs_id: number | null } | undefined;
    expect(link).toBeDefined();
    expect(link?.egs_id).toBeNull();
  });

  it('removes the override row in clear-manual mode', async () => {
    seedVn('v302', 'Title V302');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v302', 5, NULL, ?)`).run(Date.now());
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v302', 5, 'X', 'manual', ?)`).run(Date.now());
    clearEgsCache('v302', 'clear-manual');
    expect(db.prepare(`SELECT 1 FROM vn_egs_link WHERE vn_id = 'v302'`).get()).toBeUndefined();
  });

  it('skips the override layer for a synthetic egs_<id> VN', () => {
    db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES ('egs_77', 'Synthetic', ?)`).run(Date.now());
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('egs_77', 77, 'X', 'manual', ?)`).run(Date.now());
    clearEgsCache('egs_77', 'manual-none');
    expect(db.prepare(`SELECT 1 FROM egs_game WHERE vn_id = 'egs_77'`).get()).toBeUndefined();
  });
});

describe('cache decode resilience (via fetchEgsGame)', () => {
  it('ignores an unparseable cached body and re-fetches', async () => {
    // Seed a fresh cache row whose body is not valid JSON. readCache catches
    // the JSON.parse throw and returns null, so the function re-fetches.
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('egs:game:777', '{not json', NULL, NULL, ?, ?)`)
      .run(now, now + 3_600_000);
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Refetched', '50', '5']])),
      ok(tableHtml([['total_play_time']])),
    );
    const game = await fetchEgsGame(777);
    expect(game?.gamename).toBe('Refetched');
  });
});

describe('fetchEgsPlaytimeMedian branches (via fetchEgsGame)', () => {
  it('averages the two middle values for an even count', async () => {
    queueFetches(
      ok(tableHtml([['gamename', 'median', 'count2'], ['Even Playtime', '50', '5']])),
      // 4 values [10,12,14,16] → middle two (12,14) average 13h → 780 minutes.
      ok(tableHtml([['total_play_time'], ['10'], ['12'], ['14'], ['16']])),
    );
    const game = await fetchEgsGame(778);
    expect(game?.playtime_median_minutes).toBe(780);
  });

  it('falls back to gamelist median when the playtime query throws', async () => {
    mockProviderFetch
      .mockImplementationOnce(async () => ok(tableHtml([
        ['gamename', 'median', 'count2', 'total_play_time_median'],
        ['Playtime Throws', '50', '5', '9'],
      ])))
      .mockRejectedValueOnce(new Error('userreview down'));
    const game = await fetchEgsGame(779);
    // gamelist 9h → 540 minutes (playtime sub-fetch swallowed the error).
    expect(game?.playtime_median_minutes).toBe(540);
  });

  it('falls back to gamelist median when every userreview playtime is unusable', async () => {
    queueFetches(
      ok(tableHtml([['gamename', 'total_play_time_median'], ['No Valid Reviews', '4']])),
      ok(tableHtml([['total_play_time'], ['NULL'], ['0'], ['bad']])),
    );
    expect((await fetchEgsGame(780))?.playtime_median_minutes).toBe(240);
  });
});

describe('rowToGame raw_json round-trip (via resolveEgsForVn manual fallback)', () => {
  it('decodes a stored raw_json column into the game.raw map', async () => {
    seedVn('v400', 'Title V400');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v400', 4242, NULL, ?)`).run(Date.now());
    const rawJson = JSON.stringify({ genre: 'placeholder', dmm: null });
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, source, fetched_at) VALUES ('v400', 4242, 'Cached With Raw', ?, 'manual', ?)`)
      .run(rawJson, Date.now());
    queueFetches(() => new Response('rl', { status: 429 })); // pinned fetch unreachable
    const res = await resolveEgsForVn('v400');
    expect(res.source).toBe('manual');
    expect(res.game?.id).toBe(4242);
    expect(res.game?.raw).toMatchObject({ genre: 'placeholder', dmm: null });
  });

  it('keeps raw undefined when the stored raw_json is malformed', async () => {
    seedVn('v401', 'Title V401');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v401', 4242, NULL, ?)`).run(Date.now());
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, source, fetched_at) VALUES ('v401', 4242, 'Bad Raw', '{broken', 'manual', ?)`)
      .run(Date.now());
    queueFetches(() => new Response('rl', { status: 429 }));
    const res = await resolveEgsForVn('v401');
    expect(res.game?.id).toBe(4242);
    expect(res.game?.raw).toBeUndefined();
  });
});

describe('resolveEgsForVn additional branches', () => {
  it('returns {game:null, source:manual} when a pinned id is unreachable and no cached row exists', async () => {
    seedVn('v402', 'Title V402');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v402', 4242, NULL, ?)`).run(Date.now());
    queueFetches(() => new Response('rl', { status: 429 }));
    const res = await resolveEgsForVn('v402');
    expect(res).toEqual({ game: null, source: 'manual' });
  });

  it('returns a manual no-game result when a pinned fetch hits a non-classified HTTP error', async () => {
    seedVn('v403', 'Title V403');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v403', 4242, NULL, ?)`).run(Date.now());
    // A non-ok, non-429/403/5xx status (418) raises a plain Error inside
    // fetchTable; fetchOne swallows it and returns null, so fetchEgsGame
    // yields null and the manual-pin path reports no game.
    queueFetches(() => new Response('teapot', { status: 418 }));
    const res = await resolveEgsForVn('v403');
    expect(res).toEqual({ game: null, source: 'manual' });
  });

  it('maps an extlink-sourced fresh cache hit back to source:extlink', async () => {
    seedVn('v404', 'Title V404');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v404', 555, 'Fresh Extlink', 'extlink', ?)`)
      .run(Date.now());
    const res = await resolveEgsForVn('v404');
    expect(res.source).toBe('extlink');
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('maps a null-sourced fresh cache hit back to source:null', async () => {
    seedVn('v405', 'Title V405');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v405', 556, 'Fresh Unknown', NULL, ?)`)
      .run(Date.now());
    const res = await resolveEgsForVn('v405');
    expect(res.source).toBeNull();
    expect(res.game?.id).toBe(556);
  });

  it('preserves a prior manual-sourced match when a forced re-resolve finds nothing', async () => {
    seedVn('v406', 'Title V406', 'Alt V406');
    // Stale manual row; force re-resolve, releases empty, search returns nothing.
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES ('v406', 557, 'Prior Manual', 'manual', ?)`)
      .run(Date.now() - 100 * 24 * 3600 * 1000);
    mockGetReleases.mockResolvedValue([] as never);
    queueFetches(ok(tableHtml([['id']]))); // search → zero rows (clean)
    const res = await resolveEgsForVn('v406', { force: true });
    expect(res.source).toBe('manual');
    expect(res.game?.id).toBe(557);
  });

  it('skips the name-search fallback when allowSearch is false', async () => {
    seedVn('v407', 'Title V407', 'Alt V407');
    mockGetReleases.mockResolvedValue([] as never);
    const res = await resolveEgsForVn('v407', { allowSearch: false });
    expect(res.game).toBeNull();
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('tolerates getReleasesForVn throwing and falls through to name search', async () => {
    seedVn('v408', 'Title V408', 'Alt V408');
    mockGetReleases.mockRejectedValue(new Error('releases unavailable'));
    queueFetches(
      ok(tableHtml([['id'], ['9090']])),
      ok(tableHtml([['gamename', 'median', 'count2'], ['Recovered By Search', '60', '8']])),
      ok(tableHtml([['total_play_time'], ['5']])),
    );
    const res = await resolveEgsForVn('v408');
    expect(res.source).toBe('search');
    expect(res.game?.id).toBe(9090);
  });

  it('persists a clean negative for an invalid synthetic id without fetching', async () => {
    seedVn('egs_bad', 'Invalid Synthetic');
    expect(await resolveEgsForVn('egs_bad', { allowSearch: false })).toEqual({ game: null, source: null });
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('ignores matching extlinks without a game id', async () => {
    seedVn('v409', 'Title V409');
    mockGetReleases.mockResolvedValue([
      releaseWithExtlinks([{ url: 'https://erogamescape.dyndns.org/no-game', label: 'ErogameScape', name: '' }]),
    ]);
    expect(await resolveEgsForVn('v409', { allowSearch: false })).toEqual({ game: null, source: null });
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('ignores an extlink game id too large to represent as a finite number', async () => {
    seedVn('v94091', 'Title V94091');
    mockGetReleases.mockResolvedValue([
      releaseWithExtlinks([{ url: `https://erogamescape.dyndns.org/game.php?game=${'9'.repeat(400)}`, label: 'ErogameScape', name: '' }]),
    ]);
    expect(await resolveEgsForVn('v94091', { allowSearch: false })).toEqual({ game: null, source: null });
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('propagates an invalid manual id instead of swallowing a programming error', async () => {
    seedVn('v410', 'Title V410');
    db.prepare(`INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES ('v410', -1, NULL, ?)`).run(Date.now());
    await expect(resolveEgsForVn('v410')).rejects.toThrow(/invalid EGS SQL integer/);
  });

  it('propagates an invalid extlink id instead of swallowing a programming error', async () => {
    seedVn('v411', 'Title V411');
    mockGetReleases.mockResolvedValue([
      releaseWithExtlinks([{ url: 'https://erogamescape.dyndns.org/game.php?game=9999999999999999', label: 'ErogameScape', name: '' }]),
    ]);
    await expect(resolveEgsForVn('v411', { allowSearch: false })).rejects.toThrow(/invalid EGS SQL integer/);
  });

  it('persists a clean negative when the VN row is absent and no search probe exists', async () => {
    expect(await resolveEgsForVn('v412')).toEqual({ game: null, source: null });
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('propagates a plain name-search failure', async () => {
    seedVn('v413', 'Title V413');
    mockProviderFetch.mockResolvedValueOnce(new Response('teapot', { status: 418 }));
    await expect(resolveEgsForVn('v413')).rejects.toThrow(/EGS HTTP 418/);
  });

  it('preserves a prior search-sourced and null-sourced match after a clean miss', async () => {
    for (const [id, source] of [['v414', 'search'], ['v415', null]] as const) {
      seedVn(id, `Title ${id}`, `Alt ${id}`);
      db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, source, fetched_at) VALUES (?, 558, 'Prior', ?, ?)`)
        .run(id, source, Date.now() - 100 * 24 * 3600 * 1000);
      queueFetches(ok(tableHtml([['id']])));
      const res = await resolveEgsForVn(id, { force: true });
      expect(res.game?.id).toBe(558);
      expect(res.source).toBe(source);
    }
  });

  it('returns a recent cached negative as a null game', async () => {
    seedVn('v416', 'Title V416');
    db.prepare(`INSERT INTO egs_game (vn_id, egs_id, source, fetched_at) VALUES ('v416', NULL, NULL, ?)`).run(Date.now());
    expect(await resolveEgsForVn('v416')).toEqual({ game: null, source: null });
  });

  it('projects a sparse recent cached row and each stored boolean value', async () => {
    for (const [id, okazu, erogame] of [['v417', 0, 1], ['v418', 1, 0]] as const) {
      seedVn(id, `Title ${id}`);
      db.prepare(`INSERT INTO egs_game (vn_id, egs_id, gamename, okazu, erogame, source, fetched_at) VALUES (?, 559, NULL, ?, ?, 'manual', ?)`)
        .run(id, okazu, erogame, Date.now());
      const res = await resolveEgsForVn(id);
      expect(res.source).toBe('manual');
      expect(res.game?.gamename).toBe('');
      expect(res.game?.okazu).toBe(Boolean(okazu));
      expect(res.game?.erogame).toBe(Boolean(erogame));
    }
  });

  it('handles an extlink whose EGS game row is absent', async () => {
    seedVn('v419', 'Title V419');
    mockGetReleases.mockResolvedValue([
      releaseWithExtlinks([{ url: 'https://erogamescape.dyndns.org/game.php?game=419', label: 'ErogameScape', name: '' }]),
    ]);
    queueFetches(ok(tableHtml([['gamename']])));
    expect(await resolveEgsForVn('v419', { allowSearch: false })).toEqual({ game: null, source: null });
  });
});

describe('bulk + page cache-hit short-circuits', () => {
  it('serves a non-empty top-ranked cache hit without fetching', async () => {
    queueFetches(ok(tableHtml([
      ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'],
      ['700', 'Top Cached', 'NULL', 'NULL', 'NULL', '90', 'NULL', '88', '40', 'NULL', 'NULL', 'f', 'f', ''],
    ])));
    const first = await fetchEgsTopRanked(100, 10);
    expect(first).toHaveLength(1);
    mockProviderFetch.mockReset();
    const second = await fetchEgsTopRanked(100, 10);
    expect(second).toHaveLength(1);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('serves a non-empty anticipated-page cache hit without fetching', async () => {
    const header = ['id', 'gamename', 'sellday', 'brand_name', 'vndb', 'will_buy', 'probably', 'watching'];
    queueFetches(ok(tableHtml([header, ['800', 'Pg Cached', '2099-01-01', 'NULL', '', '3', '1', '0']])));
    const first = await fetchEgsAnticipatedPage(1, 10);
    expect(first.rows).toHaveLength(1);
    mockProviderFetch.mockReset();
    const second = await fetchEgsAnticipatedPage(1, 10);
    expect(second.rows).toHaveLength(1);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });

  it('serves a non-empty top-ranked-page cache hit without fetching', async () => {
    const header = ['id', 'gamename', 'furigana', 'brand_id', 'brand_name', 'median', 'median2', 'average2', 'count2', 'sellday', 'banner_url', 'okazu', 'erogame', 'vndb'];
    queueFetches(ok(tableHtml([header, ['900', 'TP Cached', 'NULL', 'NULL', 'NULL', '90', 'NULL', '88', '40', 'NULL', 'NULL', 'f', 'f', '']])));
    const first = await fetchEgsTopRankedPage(1, 10, 10);
    expect(first.rows).toHaveLength(1);
    mockProviderFetch.mockReset();
    const second = await fetchEgsTopRankedPage(1, 10, 10);
    expect(second.rows).toHaveLength(1);
    expect(mockProviderFetch).not.toHaveBeenCalled();
  });
});
