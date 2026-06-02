/**
 * Hermetic coverage for `src/lib/vndb.ts`.
 *
 * The single outbound network primitive (`providerFetch` in
 * `@/lib/proxy-fetch`) is replaced with a spy. Each test drives the real
 * `cachedFetch` / `throttledFetch` machinery and the structural decoders,
 * handing back synthetic VNDB Kana API JSON. No real token, host, or VN
 * name appears anywhere — ids are `v9xxxx` / `p9xxxx` / `c9xxxx` and titles
 * are placeholders.
 *
 * The mirror fallback stays disabled (the default `vndb_backup_enabled`),
 * so `providerFetch` is the only fetch path. We pin a fake env token so
 * the auth-bearing helpers run their happy path.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerFetchMock } = vi.hoisted(() => ({ providerFetchMock: vi.fn() }));

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

/**
 * The 1 req/s rate limiter is exercised separately in
 * `vndb-throttle-runtime.test.ts`. Here we bypass its inter-request sleeps
 * so the mapping assertions stay fast, while still running the SSRF gate
 * and delegating to the mocked `providerFetch`. The cache layer
 * (`cachedFetch`) and every decoder remain real.
 */
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

import {
  addToVndbWishlist,
  advancedSearchVn,
  deleteUlistEntry,
  fetchAuthenticatedWishlist,
  fetchStaffVnList,
  fetchUlistByLabel,
  fetchUlistEntry,
  fetchUlistLabels,
  fetchVaVnList,
  fetchVnCovers,
  getAuthInfo,
  getCharacter,
  getCharactersForVn,
  getGlobalStats,
  getProducer,
  getQuotesForVn,
  getRandomQuote,
  getRandomQuoteForVns,
  getRelease,
  getReleasesForVn,
  getStaff,
  getTag,
  getTrait,
  getVn,
  lookupUsers,
  patchUlistEntry,
  refreshVn,
  removeFromVndbWishlist,
  searchCharacters,
  searchStaff,
  searchTags,
  searchTraits,
  searchVn,
} from '@/lib/vndb';
import { clearCache, setAppSetting } from '@/lib/db';

const FAKE_TOKEN = 'fake-test-token-not-a-real-vndb-credential';
const ORIGINAL_TOKEN = process.env.VNDB_TOKEN;

/** Build a JSON `Response` with the VNDB content-type. */
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A VNDB list envelope with one or more synthetic rows. */
function envelope<T>(results: T[], more = false): { results: T[]; more: boolean } {
  return { results, more };
}

/** Minimal valid `/vn` detail row the strict decoder accepts. */
function vnDetailRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `vn-${id}`,
    alttitle: null,
    olang: 'ja',
    released: '2024-01-01',
    languages: ['ja'],
    platforms: ['win'],
    length: 2,
    length_minutes: 600,
    rating: 75,
    votecount: 120,
    description: 'placeholder description',
    image: null,
    developers: [],
    tags: [],
    screenshots: [],
    ...over,
  };
}

/** Minimal valid search/cover row. */
function searchRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `vn-${id}`,
    alttitle: null,
    released: '2024-01-01',
    image: { url: `https://t.vndb.org/${id}.jpg`, thumbnail: `https://t.vndb.org/${id}.t.jpg` },
    rating: 80,
    votecount: 200,
    length_minutes: 700,
    languages: ['ja'],
    platforms: ['win'],
    developers: [{ id: 'p90001', name: 'studio-x' }],
    ...over,
  };
}

beforeAll(() => {
  process.env.VNDB_TOKEN = FAKE_TOKEN;
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.VNDB_TOKEN;
  else process.env.VNDB_TOKEN = ORIGINAL_TOKEN;
  vi.restoreAllMocks();
});

beforeEach(() => {
  clearCache();
  setAppSetting('vndb_token', null);
  providerFetchMock.mockReset();
});

afterEach(() => {
  providerFetchMock.mockReset();
});

describe('searchVn', () => {
  it('routes a free-text query through the search filter and maps rows', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([searchRow('v90001')])));
    const r = await searchVn('some title');
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    const init = providerFetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.filters).toEqual(['search', '=', 'some title']);
    expect(body.sort).toBe('searchrank');
    expect(r.results[0].id).toBe('v90001');
  });

  it('detects a bare VN id and pins it to the id filter + id sort', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([searchRow('v90017')])));
    await searchVn('V90017');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['id', '=', 'v90017']);
    expect(body.sort).toBe('id');
  });
});

describe('advancedSearchVn', () => {
  it('composes a single-predicate filter without wrapping in `and`', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([searchRow('v90002')])));
    await advancedSearchVn({ q: 'query' });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['search', '=', 'query']);
  });

  it('wraps multiple clauses in `and`, expands a length range to `or`, and clamps results', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    await advancedSearchVn({
      langs: ['ja', 'en'],
      platforms: ['win'],
      lengthMin: 2,
      lengthMax: 4,
      yearMin: 2020,
      yearMax: 2022,
      ratingMin: 70,
      hasScreenshot: true,
      hasReview: true,
      hasAnime: true,
      results: 500,
    });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters[0]).toBe('and');
    expect(body.results).toBe(100);
    const langClause = body.filters.find((c: unknown[]) => Array.isArray(c) && c[0] === 'or' && (c[1] as unknown[])[0] === 'lang');
    expect(langClause).toBeTruthy();
    const lengthClause = body.filters.find(
      (c: unknown[]) => Array.isArray(c) && c[0] === 'or' && (c[1] as unknown[])[0] === 'length',
    );
    expect((lengthClause as unknown[]).length).toBe(4);
    expect(body.filters).toContainEqual(['released', '>=', '2020-01-01']);
    expect(body.filters).toContainEqual(['released', '<=', '2022-12-31']);
  });

  it('emits no filters when every clause is empty', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    await advancedSearchVn({});
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toBeUndefined();
    expect(body.sort).toBe('rating');
  });

  it('collapses a single-value length range to an equality clause', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    await advancedSearchVn({ lengthMin: 3, lengthMax: 3 });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['length', '=', 3]);
  });

  it('supports single-value list filters, one-sided length bounds, and an empty inverted range', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    await advancedSearchVn({ langs: ['ja'], lengthMax: 2 });
    await advancedSearchVn({ lengthMin: 4 });
    await advancedSearchVn({ lengthMin: 5, lengthMax: 1 });
    const bodies = providerFetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].filters).toContainEqual(['lang', '=', 'ja']);
    expect(bodies[0].filters).toContainEqual(['or', ['length', '=', 1], ['length', '=', 2]]);
    expect(bodies[1].filters).toEqual(['or', ['length', '=', 4], ['length', '=', 5]]);
    expect(bodies[2].filters).toBeUndefined();
  });
});

describe('getVn / refreshVn', () => {
  it('returns the first result and caches it', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([vnDetailRow('v90003')])));
    const vn = await getVn('v90003');
    expect(vn?.id).toBe('v90003');
    expect(vn?.title).toBe('vn-v90003');
    // A second call is served from cache (no new fetch).
    const again = await getVn('v90003');
    expect(again?.id).toBe('v90003');
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when VNDB knows no such id (empty results)', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getVn('v90404')).toBeNull();
  });

  it('refreshVn resolves to a VN payload after invalidation', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse(envelope([vnDetailRow('v90005')])));
    await getVn('v90005');
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    const refreshed = await refreshVn('v90005');
    expect(refreshed?.id).toBe('v90005');
  });
});

describe('getProducer', () => {
  it('maps a producer row', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse(
        envelope([
          { id: 'p90001', name: 'studio-x', original: null, aliases: [], lang: 'ja', type: 'co', description: null, extlinks: [] },
        ]),
      ),
    );
    const p = await getProducer('p90001');
    expect(p?.id).toBe('p90001');
    expect(p?.type).toBe('co');
  });

  it('returns null on an empty envelope', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getProducer('p90404')).toBeNull();
  });
});

describe('character helpers', () => {
  const charRow = (id: string) => ({
    id,
    name: `char-${id}`,
    original: null,
    aliases: [],
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: null,
    gender: null,
    vns: [],
    traits: [],
  });

  it('getCharactersForVn short-circuits for non-VNDB ids without a fetch', async () => {
    expect(await getCharactersForVn('egs_42')).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('getCharactersForVn maps results for a real id', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([charRow('c90001')])));
    const chars = await getCharactersForVn('v90010');
    expect(chars.map((c) => c.id)).toEqual(['c90001']);
  });

  it('getCharacter returns null on empty results', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getCharacter('c90404')).toBeNull();
  });

  it('searchCharacters composes range + categorical filters', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([charRow('c90002')])));
    await searchCharacters('name', { ageMin: 18, heightMin: 150, blood: 'a', sex: 'f', role: 'main' });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters[0]).toBe('and');
    expect(body.filters).toContainEqual(['age', '>=', 18]);
    expect(body.filters).toContainEqual(['blood_type', '=', 'a']);
  });

  it('searchCharacters with no query and no filters omits the filter key', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    await searchCharacters('');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toBeUndefined();
    expect(body.sort).toBe('id');
  });

  it('searchCharacters supports an id query, every numeric upper bound, and a single text filter', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    await searchCharacters('C90003', {
      ageMax: 30,
      heightMax: 180,
      bustMin: 70,
      bustMax: 100,
      waistMin: 50,
      waistMax: 80,
      hipsMin: 75,
      hipsMax: 110,
      results: 200,
    });
    await searchCharacters('plain text');
    const first = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((providerFetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.filters).toContainEqual(['id', '=', 'c90003']);
    expect(first.filters).toContainEqual(['hips', '<=', 110]);
    expect(first.results).toBe(100);
    expect(second.filters).toEqual(['search', '=', 'plain text']);
    expect(second.sort).toBe('searchrank');
  });
});

describe('staff helpers', () => {
  it('searchStaff with an id pins the id filter', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    await searchStaff('s90001');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toContainEqual(['id', '=', 's90001']);
    expect(body.filters).toContainEqual(['ismain', '=', 1]);
  });

  it('getStaff returns null on empty results', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getStaff('s90404')).toBeNull();
  });

  it('searchStaff supports text and optional filters or no filters at all', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    await searchStaff('writer', { mainOnly: false, role: 'scenario', lang: 'ja', vn: 'v90001', results: 200 });
    await searchStaff('', { mainOnly: false });
    const first = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((providerFetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.filters).toContainEqual(['search', '=', 'writer']);
    expect(first.filters).toContainEqual(['role', '=', 'scenario']);
    expect(first.filters).toContainEqual(['lang', '=', 'ja']);
    expect(first.filters).toContainEqual(['vn', '=', ['id', '=', 'v90001']]);
    expect(first.results).toBe(100);
    expect(first.sort).toBe('searchrank');
    expect(second.filters).toBeUndefined();
  });

  it('searchStaff collapses its default main-only filter to one predicate', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    await searchStaff('');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['ismain', '=', 1]);
  });

  it('fetchStaffVnList paginates until more=false and keeps only this staff\'s roles', async () => {
    const row = (vid: string) => ({
      id: vid,
      title: `vn-${vid}`,
      alttitle: null,
      released: '2024-01-01',
      rating: 70,
      image: { url: 'https://t.vndb.org/x.jpg', thumbnail: 'https://t.vndb.org/x.t.jpg' },
      staff: [
        { id: 's90001', role: 'scenario', note: null },
        { id: 's90999', role: 'art', note: 'other' },
      ],
    });
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse({ ...envelope([row('v90100')], true) }))
      .mockResolvedValueOnce(jsonResponse({ ...envelope([row('v90101')], false) }));
    const out = await fetchStaffVnList('s90001');
    expect(out.map((v) => v.id)).toEqual(['v90100', 'v90101']);
    expect(out[0].roles).toEqual([{ role: 'scenario', note: null }]);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetchVaVnList collects the voiced characters for the staff id', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse(
        envelope([
          {
            id: 'v90200',
            title: 'vn-v90200',
            alttitle: null,
            released: '2024-01-01',
            rating: 70,
            image: null,
            va: [
              {
                staff: { id: 's90001' },
                note: null,
                character: { id: 'c90001', name: 'char', original: null, image: { url: 'https://t.vndb.org/c.jpg' } },
              },
            ],
          },
        ]),
      ),
    );
    const out = await fetchVaVnList('s90001');
    expect(out[0].characters[0].id).toBe('c90001');
  });

  it('credit lists skip unrelated rows and preserve null image fallbacks', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse(envelope([
        {
          id: 'v90210',
          title: 'staff-empty',
          alttitle: null,
          released: null,
          rating: null,
          image: null,
          staff: [{ id: 's90999', role: 'art', note: null }],
        },
        {
          id: 'v90211',
          title: 'staff-match',
          alttitle: null,
          released: null,
          rating: null,
          image: null,
          staff: [{ id: 's90001', role: 'scenario', note: null }],
        },
      ])))
      .mockResolvedValueOnce(jsonResponse(envelope([
        {
          id: 'v90212',
          title: 'va-empty',
          alttitle: null,
          released: null,
          rating: null,
          image: null,
          va: [{ staff: { id: 's90999' }, note: null, character: { id: 'c90999', name: 'other', original: null, image: null } }],
        },
        {
          id: 'v90213',
          title: 'va-match',
          alttitle: null,
          released: null,
          rating: null,
          image: null,
          va: [{ staff: { id: 's90001' }, note: null, character: { id: 'c90001', name: 'match', original: null, image: null } }],
        },
      ])));
    const staff = await fetchStaffVnList('s90001');
    const va = await fetchVaVnList('s90001');
    expect(staff).toEqual([expect.objectContaining({ id: 'v90211', image_url: null, image_thumb: null })]);
    expect(va).toEqual([expect.objectContaining({
      id: 'v90213',
      image_url: null,
      image_thumb: null,
      characters: [expect.objectContaining({ image_url: null })],
    })]);
  });

  it('fetchVaVnList continues while VNDB reports more pages', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse({ ...envelope([], true) }))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await fetchVaVnList('s90001')).toEqual([]);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('tag + trait helpers', () => {
  const tagRow = (id: string) => ({
    id,
    name: `tag-${id}`,
    aliases: [],
    description: null,
    category: 'cont',
    searchable: true,
    applicable: true,
    vn_count: 10,
  });
  const traitRow = (id: string) => ({
    id,
    name: `trait-${id}`,
    aliases: [],
    description: null,
    searchable: true,
    applicable: true,
    sexual: false,
    group_id: null,
    group_name: null,
    char_count: 5,
  });

  it('searchTags appends a category filter and sorts by searchrank for text', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([tagRow('g90001')])));
    await searchTags('blood', { category: 'cont' });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toContainEqual(['category', '=', 'cont']);
    expect(body.sort).toBe('searchrank');
  });

  it('getTag returns null on empty results', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getTag('g90404')).toBeNull();
  });

  it('searchTraits maps rows and sorts by char_count for empty query', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([traitRow('i90001')])));
    const out = await searchTraits('');
    expect(out[0].id).toBe('i90001');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.sort).toBe('char_count');
  });

  it('getTrait returns null on empty results', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getTrait('i90404')).toBeNull();
  });

  it('searchTags and searchTraits cover id and empty-query request shapes', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    await searchTags('G90001');
    await searchTags('');
    await searchTraits('I90001');
    await searchTraits('personality');
    const bodies = providerFetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].filters).toContainEqual(['id', '=', 'g90001']);
    expect(bodies[1].filters).toBeUndefined();
    expect(bodies[2].filters).toEqual(['id', '=', 'i90001']);
    expect(bodies[3].filters).toEqual(['search', '=', 'personality']);
    expect(bodies[3].sort).toBe('searchrank');
  });
});

describe('release helpers', () => {
  const relRow = (id: string) => ({
    id,
    title: `rel-${id}`,
    alttitle: null,
    languages: [{ lang: 'ja', title: `rel-${id}`, latin: null, mtl: false, main: true }],
    platforms: ['win'],
    media: [],
    released: '2024-01-01',
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
    extlinks: [],
    vns: [{ id: 'v90300', rtype: 'complete' }],
    images: [],
  });

  it('getReleasesForVn short-circuits for non-VNDB ids', async () => {
    expect(await getReleasesForVn('egs_7')).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('getReleasesForVn maps rows for a real id', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([relRow('r90001')])));
    const rels = await getReleasesForVn('v90300');
    expect(rels[0].id).toBe('r90001');
  });

  it('getRelease returns null on empty results', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getRelease('r90404')).toBeNull();
  });
});

describe('quote helpers', () => {
  const quoteRow = (id: string) => ({
    id,
    quote: 'placeholder quote',
    score: 3,
    vn: { id: 'v90400', title: 'vn-v90400' },
    character: null,
  });

  it('getRandomQuote returns the first quote and is never cached (TTL 0)', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse(envelope([quoteRow('q1')])));
    await getRandomQuote();
    await getRandomQuote();
    // TTL is 0 → every call hits upstream.
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('getRandomQuoteForVns returns null when no id is a real VNDB id', async () => {
    expect(await getRandomQuoteForVns(['egs_1', 'not-an-id'])).toBeNull();
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('getRandomQuoteForVns filters to a VNDB id and queries', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([quoteRow('q2')])));
    const q = await getRandomQuoteForVns(['v90400']);
    expect(q?.id).toBe('q2');
  });

  it('returns null when random quote queries receive an empty envelope', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await getRandomQuote()).toBeNull();
    expect(await getRandomQuoteForVns(['v90400'])).toBeNull();
  });

  it('getQuotesForVn short-circuits for non-VNDB ids', async () => {
    expect(await getQuotesForVn('egs_9')).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });
});

describe('stats + auth + user', () => {
  it('getGlobalStats maps the counters payload', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ chars: 1, producers: 2, releases: 3, staff: 4, tags: 5, traits: 6, vn: 7 }),
    );
    const s = await getGlobalStats();
    expect(s.vn).toBe(7);
    // GET request, no body.
    expect((providerFetchMock.mock.calls[0][1] as RequestInit).method).toBe('GET');
  });

  it('prefers a trimmed DB-stored token over the environment token', async () => {
    setAppSetting('vndb_token', '  stored-test-token  ');
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ chars: 1, producers: 2, releases: 3, staff: 4, tags: 5, traits: 6, vn: 7 }),
    );
    await getGlobalStats();
    expect(new Headers((providerFetchMock.mock.calls[0][1] as RequestInit).headers).get('Authorization')).toBe(
      'Token stored-test-token',
    );
  });

  it('getAuthInfo returns the decoded auth payload when a token is configured', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'u9001', username: 'tester', permissions: ['listread', 'listwrite'] }),
    );
    const auth = await getAuthInfo();
    expect(auth?.username).toBe('tester');
  });

  it('getAuthInfo swallows an upstream error and returns null', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    expect(await getAuthInfo()).toBeNull();
  });

  it('lookupUsers builds repeated q params and maps null misses', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ alice: { id: 'u1', username: 'alice' }, bob: null }),
    );
    const out = await lookupUsers(['alice', 'bob']);
    expect(out.alice?.username).toBe('alice');
    expect(out.bob).toBeNull();
    const url = String(providerFetchMock.mock.calls[0][0]);
    expect(url).toContain('q=alice');
    expect(url).toContain('q=bob');
  });
});

describe('fetchVnCovers', () => {
  it('returns an empty map when no id is a real VNDB id (no fetch)', async () => {
    const out = await fetchVnCovers(['egs_1', 'garbage']);
    expect(out.size).toBe(0);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('builds a single-predicate filter when exactly one id is supplied', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse(envelope([{ id: 'v90500', image: { url: 'https://t.vndb.org/v90500.jpg', sexual: 0 } }])),
    );
    const out = await fetchVnCovers(['v90500', 'v90500']);
    expect(out.get('v90500')?.url).toBe('https://t.vndb.org/v90500.jpg');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['id', '=', 'v90500']);
  });

  it('uses an `or` filter for several ids and skips rows without an image', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse(
        envelope([
          { id: 'v90500', image: { url: 'https://t.vndb.org/v90500.jpg', sexual: 0 } },
          { id: 'v90501', image: null },
        ]),
      ),
    );
    const out = await fetchVnCovers(['v90500', 'v90501']);
    expect(out.get('v90500')?.url).toBe('https://t.vndb.org/v90500.jpg');
    expect(out.has('v90501')).toBe(false);
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters[0]).toBe('or');
  });

  it('swallows an upstream error and returns an empty map', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500));
    const out = await fetchVnCovers(['v90600', 'v90601']);
    expect(out.size).toBe(0);
  });

  it('preserves null thumbnail and sexual defaults for sparse images', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse(envelope([{ id: 'v90610', image: { url: 'https://t.vndb.org/v90610.jpg' } }])),
    );
    expect((await fetchVnCovers(['v90610'])).get('v90610')).toEqual({
      url: 'https://t.vndb.org/v90610.jpg',
      thumbnail: null,
      sexual: null,
    });
  });
});

describe('ulist read + write', () => {
  const ulistRow = (id: string, labels: number[]) => ({
    id,
    added: 1,
    voted: null,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: labels.map((l) => ({ id: l, label: `label-${l}` })),
    vn: {
      id,
      title: `vn-${id}`,
      alttitle: null,
      released: '2024-01-01',
      rating: 70,
      votecount: 100,
      length_minutes: 600,
      languages: ['ja'],
      platforms: ['win'],
      image: null,
      developers: [],
    },
  });

  it('fetchUlistByLabel posts the user + label filter', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([ulistRow('v90700', [5])])));
    const r = await fetchUlistByLabel('u9001', 5);
    expect(r.results[0].labels[0].id).toBe(5);
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.user).toBe('u9001');
    expect(body.filters).toEqual(['label', '=', 5]);
  });

  it('fetchAuthenticatedWishlist paginates and aggregates', async () => {
    providerFetchMock
      // getAuthInfo
      .mockResolvedValueOnce(jsonResponse({ id: 'u9001', username: 'tester', permissions: ['listread'] }))
      // page 1 (more=true)
      .mockResolvedValueOnce(jsonResponse({ ...envelope([ulistRow('v90800', [5])], true) }))
      // page 2 (more=false)
      .mockResolvedValueOnce(jsonResponse({ ...envelope([ulistRow('v90801', [5])], false) }));
    const out = await fetchAuthenticatedWishlist();
    expect(Array.isArray(out)).toBe(true);
    expect((out as { id: string }[]).map((e) => e.id)).toEqual(['v90800', 'v90801']);
  });

  it('fetchAuthenticatedWishlist returns needsAuth when no token is configured', async () => {
    setAppSetting('vndb_token', null);
    delete process.env.VNDB_TOKEN;
    await expect(fetchAuthenticatedWishlist()).resolves.toEqual({ needsAuth: true });
    process.env.VNDB_TOKEN = FAKE_TOKEN;
  });

  it('fetchUlistEntry returns null when the entry is absent', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'u9001', username: 'tester', permissions: ['listread'] }))
      .mockResolvedValueOnce(jsonResponse(envelope([])));
    expect(await fetchUlistEntry('v90900')).toBeNull();
  });

  it('fetchUlistLabels maps the labels list', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ labels: [{ id: 5, label: 'Wishlist', private: false, count: 3 }] }),
    );
    const out = await fetchUlistLabels();
    expect(out).toEqual([{ id: 5, label: 'Wishlist', private: false, count: 3 }]);
  });

  it('addToVndbWishlist PATCHes labels_set and invalidates the ulist cache', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    const r = await addToVndbWishlist('v91000');
    expect(r).toEqual({ ok: true });
    const init = providerFetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ labels_set: [5] });
  });

  it('removeFromVndbWishlist PATCHes labels_unset', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await removeFromVndbWishlist('v91001');
    expect(JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      labels_unset: [5],
    });
  });

  it('patchUlistEntry forwards the patch body verbatim', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await patchUlistEntry('v91002', { vote: 80, labels_set: [1] });
    expect(JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      vote: 80,
      labels_set: [1],
    });
  });

  it('deleteUlistEntry issues a DELETE', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await deleteUlistEntry('v91003');
    expect((providerFetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('write helpers reject a non-VNDB id before any fetch', async () => {
    await expect(addToVndbWishlist('egs_1')).rejects.toThrow(/invalid vn id/);
    await expect(patchUlistEntry('garbage', {})).rejects.toThrow(/invalid vn id/);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('a non-OK PATCH surfaces a sanitised error', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('line1\nline2', { status: 403 }));
    await expect(addToVndbWishlist('v91004')).rejects.toThrow(/403/);
  });

  it('surfaces list mutation errors even when reading the upstream body fails', async () => {
    const failingBody = (status: number) => {
      const response = new Response('', { status });
      vi.spyOn(response, 'text').mockRejectedValue(new Error('unreadable'));
      return response;
    };
    providerFetchMock
      .mockResolvedValueOnce(failingBody(500))
      .mockResolvedValueOnce(failingBody(500))
      .mockResolvedValueOnce(failingBody(500))
      .mockResolvedValueOnce(failingBody(500));
    await expect(addToVndbWishlist('v91010')).rejects.toThrow(/500/);
    await expect(removeFromVndbWishlist('v91011')).rejects.toThrow(/500/);
    await expect(patchUlistEntry('v91012', {})).rejects.toThrow(/500/);
    await expect(deleteUlistEntry('v91013')).rejects.toThrow(/500/);
  });

  it('fetchUlistEntry and deleteUlistEntry reject invalid VN ids before mutation', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'u9001', username: 'tester', permissions: ['listread'] }),
    );
    await expect(fetchUlistEntry('bad-id')).rejects.toThrow(/invalid vn id/);
    await expect(deleteUlistEntry('bad-id')).rejects.toThrow(/invalid vn id/);
  });
});

describe('error + malformed response branches', () => {
  it('a non-OK detail fetch rejects (no cache fallback)', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad request' }, 400));
    await expect(getVn('v92000')).rejects.toThrow(/400/);
  });

  it('a malformed envelope (results not an array) rejects via the decoder', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ results: 'oops', more: false }));
    await expect(getVn('v92001')).rejects.toThrow(/invalid payload shape/);
  });

  it('a non-JSON body rejects with a typed error', async () => {
    providerFetchMock.mockResolvedValueOnce(
      new Response('<html>error</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(getVn('v92002')).rejects.toThrow(/non-JSON response/);
  });
});
