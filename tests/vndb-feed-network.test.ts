/**
 * Hermetic coverage for the discovery feeds that hit VNDB through the real
 * `cachedFetch`: `vndb-recommend.ts` (the recommendation `/vn` wrapper),
 * `top-ranked.ts` (paginated top-rated pulls + the stale-while-error page),
 * and `upcoming.ts` (collection-watched + global upcoming releases).
 *
 * The single network primitive (`providerFetch`) is mocked; the 1 req/s
 * throttle's sleeps are bypassed (covered in `vndb-throttle-runtime.test.ts`).
 * The cache layer and every feed decoder run for real. `upcoming`'s producer
 * watch-list is seeded into the per-worker SQLite via genuine db helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerFetchMock } = vi.hoisted(() => ({ providerFetchMock: vi.fn() }));

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

vi.mock('@/lib/vndb-throttle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-throttle')>();
  const { providerFetch } = await import('@/lib/proxy-fetch');
  const { isAllowedHttpTarget } = await import('@/lib/url-allowlist');
  return {
    ...actual,
    throttledFetch: vi.fn(async (url: string, init?: RequestInit, provider = 'vndb') => {
      if (!isAllowedHttpTarget(url)) {
        throw new Error(`vndb-throttle: refusing fetch to non-allowlisted URL ${url}`);
      }
      return providerFetch(url, init ?? {}, provider as never);
    }),
  };
});

import { vndbAdvancedSearchRaw } from '@/lib/vndb-recommend';
import { fetchVndbTopRanked, fetchVndbTopRankedPage } from '@/lib/top-ranked';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection } from '@/lib/upcoming';
import { addToCollection, clearCache, putCacheRow, upsertVn } from '@/lib/db';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A `/vn` row valid for the top-ranked + recommendation decoders. */
function vnRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `vn-${id}`,
    alttitle: null,
    released: '2024-01-01',
    image: { url: `https://t.vndb.org/${id}.jpg`, thumbnail: `https://t.vndb.org/${id}.t.jpg`, sexual: 0 },
    rating: 85,
    votecount: 300,
    length_minutes: 700,
    languages: ['ja'],
    platforms: ['win'],
    developers: [{ id: 'p90001', name: 'studio-x' }],
    ...over,
  };
}

/** A `/release` row valid for the upcoming decoder. */
function releaseRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `rel-${id}`,
    alttitle: null,
    released: '2099-01-01',
    languages: [{ lang: 'ja' }],
    platforms: ['win'],
    patch: false,
    freeware: false,
    has_ero: false,
    producers: [{ id: 'p90001', name: 'studio-x', developer: true }],
    vns: [{ id: 'v90001', title: 'vn-v90001', image: null }],
    ...over,
  };
}

beforeEach(() => {
  clearCache();
  providerFetchMock.mockReset();
});

afterEach(() => {
  providerFetchMock.mockReset();
});

describe('vndbAdvancedSearchRaw', () => {
  it('posts the recommendation field set and maps hits', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: [vnRow('v90001')] }));
    const out = await vndbAdvancedSearchRaw({ filters: ['tag', '=', 'g9001'] });
    expect(out[0].id).toBe('v90001');
    const init = providerFetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.sort).toBe('rating');
    expect(body.reverse).toBe(true);
  });

  it('clamps the requested result count to 100', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await vndbAdvancedSearchRaw({ filters: ['id', '=', 'v90001'], results: 9000 });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.results).toBe(100);
  });

  it('drops malformed rows via the decoder', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [vnRow('v90002'), { id: 'not-a-vn' }] }),
    );
    const out = await vndbAdvancedSearchRaw({ filters: ['tag', '=', 'g9002'] });
    expect(out.map((h) => h.id)).toEqual(['v90002']);
  });
});

describe('fetchVndbTopRanked', () => {
  it('aggregates pages until the requested size is met and sorts by rating', async () => {
    providerFetchMock
      .mockResolvedValueOnce(
        jsonResponse({ results: [vnRow('v90010', { rating: 80 }), vnRow('v90011', { rating: 90 })], more: true }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [vnRow('v90012', { rating: 85 })], more: false }));
    const out = await fetchVndbTopRanked(10);
    // Clamp lifts the minimum to 10 results; both pages were consulted.
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
    // Output is rating-descending regardless of page arrival order.
    expect(out.map((v) => v.id)).toEqual(['v90011', 'v90012', 'v90010']);
  });

  it('stops after the first page when more=false', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: [vnRow('v90020')], more: false }));
    const out = await fetchVndbTopRanked(10);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
  });

  it('passes the votecount floor into the filter', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: [], more: false }));
    await fetchVndbTopRanked(10, 250);
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['votecount', '>=', 250]);
  });

  it('deduplicates rows and stops as soon as the clamped limit is reached', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => vnRow(`v901${String(index).padStart(2, '0')}`, { rating: null }));
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [rows[0], rows[0], ...rows.slice(1)], more: true }),
    );

    const out = await fetchVndbTopRanked(10);

    expect(out).toHaveLength(10);
    expect(providerFetchMock).toHaveBeenCalledOnce();
  });
});

describe('fetchVndbTopRankedPage', () => {
  it('clamps page + pageSize and reports hasMore', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: [vnRow('v90030')], more: true }));
    const out = await fetchVndbTopRankedPage(0, 5, 50);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(10);
    expect(out.hasMore).toBe(true);
    expect(out.rows.map((r) => r.id)).toEqual(['v90030']);
    expect(out.stale).toBeFalsy();
  });

  it('surfaces stale rows when the upstream fetch fails over a cached page', async () => {
    // Pre-seed an expired cache row for the exact page key, then make the
    // refresh fail so cachedFetch returns the stale body with stale=true.
    const { createHash } = await import('node:crypto');
    const minVotes = 50;
    const safePage = 2;
    const safeSize = 50;
    const body = {
      filters: ['votecount', '>=', minVotes],
      fields: [
        'title', 'alttitle', 'released', 'image.url', 'image.thumbnail', 'image.sexual',
        'rating', 'votecount', 'length_minutes', 'languages', 'platforms', 'developers{id,name}',
      ].join(', '),
      sort: 'rating',
      reverse: true,
      results: safeSize,
      page: safePage,
    };
    const pathTag = `POST /vn:top-ranked:${minVotes}:p${safePage}:${safeSize}`;
    const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: `${pathTag}|POST|${hash}`,
      body: JSON.stringify({ results: [vnRow('v90040')], more: false }),
      etag: null,
      last_modified: null,
      fetched_at: past,
      expires_at: past + 1,
    });
    providerFetchMock.mockRejectedValueOnce(new Error('vndb 503'));
    const out = await fetchVndbTopRankedPage(safePage, safeSize, minVotes);
    expect(out.stale).toBe(true);
    expect(out.rows.map((r) => r.id)).toEqual(['v90040']);
    expect(out.fetchedAt).toBe(past);
  });
});

describe('fetchUpcomingForCollection', () => {
  it('returns an empty list and issues no fetch when no collected VN has a developer', async () => {
    // A collected VN with no developers JSON → no watched producer ids.
    upsertVn({ id: 'v90500', title: 'vn-v90500', languages: ['ja'] });
    addToCollection('v90500', {});
    const out = await fetchUpcomingForCollection();
    expect(out).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('queries upcoming releases for a watched developer and orders by date', async () => {
    upsertVn({
      id: 'v90501',
      title: 'vn-v90501',
      languages: ['ja'],
      developers: [{ id: 'p90001', name: 'studio-x' }],
    });
    addToCollection('v90501', {});
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          releaseRow('r90002', { released: '2099-03-01' }),
          releaseRow('r90001', { released: '2099-01-01' }),
        ],
        more: false,
      }),
    );
    const out = await fetchUpcomingForCollection();
    expect(out.map((r) => r.id)).toEqual(['r90001', 'r90002']);
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    // Single watched producer → single-predicate producer filter under `and`.
    expect(body.filters[0]).toBe('and');
    expect(body.filters[2]).toEqual(['producer', '=', ['id', '=', 'p90001']]);
  });

  it('filters malformed developer ids, queries multiple watched producers, and deduplicates releases', async () => {
    upsertVn({
      id: 'v90502',
      title: 'vn-v90502',
      languages: ['ja'],
      developers: [
        { id: 'bad', name: 'invalid' },
        { id: 'p90001', name: 'studio-x' },
        { id: 'p90002', name: 'studio-y' },
      ],
    });
    addToCollection('v90502', {});
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [releaseRow('r90003'), releaseRow('r90003')],
        more: false,
      }),
    );

    const out = await fetchUpcomingForCollection();

    expect(out.map((row) => row.id)).toEqual(['r90003']);
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters[2][0]).toBe('or');
    expect(JSON.stringify(body.filters[2])).not.toContain('bad');
  });
});

describe('fetchAllUpcomingFromVndb', () => {
  it('builds a bounded released-range filter and dedupes across pages', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [releaseRow('r90010')], more: true }))
      .mockResolvedValueOnce(jsonResponse({ results: [releaseRow('r90010'), releaseRow('r90011')], more: false }));
    const out = await fetchAllUpcomingFromVndb(50);
    expect(out.map((r) => r.id)).toEqual(['r90010', 'r90011']);
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters[0]).toBe('and');
    expect(body.filters[1][0]).toBe('released');
    expect(body.filters[1][1]).toBe('>=');
    expect(body.filters[2][1]).toBe('<=');
  });

  it('stops paginating when a page reports more=false', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: [releaseRow('r90020')], more: false }));
    const out = await fetchAllUpcomingFromVndb(50);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
  });

  it('stops inside a page as soon as the requested limit is reached', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: Array.from({ length: 60 }, (_, index) => releaseRow(`r91${String(index).padStart(3, '0')}`)),
        more: true,
      }),
    );

    const out = await fetchAllUpcomingFromVndb(50);

    expect(out).toHaveLength(50);
    expect(providerFetchMock).toHaveBeenCalledOnce();
  });
});
