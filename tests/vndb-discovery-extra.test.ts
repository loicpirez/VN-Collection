/**
 * Supplementary hermetic coverage for `src/lib/vndb.ts` discovery + cache-read
 * helpers not exercised in `vndb-network-mapping.test.ts`:
 * `getCharactersForTrait*`, `fetchTopVnsByTag`, the no-network cache readers
 * (`readCachedCharactersForVn[s]`), `getQuotesForVn`/`getSchema`, and the
 * `needsAuth` / error branches of the ulist write helpers.
 *
 * The single network primitive (`providerFetch`) is mocked; the 1 req/s
 * throttle's sleeps are bypassed. The cache layer + decoders run for real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  addToVndbWishlist,
  deleteUlistEntry,
  fetchTopVnsByTag,
  fetchUlistEntry,
  fetchUlistLabels,
  getCharactersForTrait,
  getCharactersForTraitInVns,
  getCharactersForVn,
  getQuotesForVn,
  getSchema,
  patchUlistEntry,
  readCachedCharactersForVn,
  readCachedCharactersForVns,
  removeFromVndbWishlist,
} from '@/lib/vndb';
import { clearCache, setAppSetting } from '@/lib/db';

const FAKE_TOKEN = 'fake-test-token-not-a-real-vndb-credential';
const ORIGINAL_TOKEN = process.env.VNDB_TOKEN;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function envelope<T>(results: T[], more = false): { results: T[]; more: boolean } {
  return { results, more };
}

function charRow(id: string): Record<string, unknown> {
  return {
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
  };
}

function searchRow(id: string): Record<string, unknown> {
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
    developers: [],
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
  providerFetchMock.mockReset();
  setAppSetting('vndb_token', FAKE_TOKEN);
});

afterEach(() => {
  providerFetchMock.mockReset();
});

describe('getQuotesForVn', () => {
  it('maps the quotes envelope for a real VN id', async () => {
    providerFetchMock.mockResolvedValueOnce(
      jsonResponse(envelope([{ id: 'q1', quote: 'placeholder', score: 3, vn: { id: 'v90001', title: 'vn-v90001' }, character: null }])),
    );
    const out = await getQuotesForVn('v90001');
    expect(out[0].id).toBe('q1');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.sort).toBe('score');
  });
});

describe('getSchema', () => {
  it('returns the raw schema payload unchanged (no decoder)', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ api: { fields: ['x'] } }));
    const schema = await getSchema();
    expect(schema).toEqual({ api: { fields: ['x'] } });
    expect((providerFetchMock.mock.calls[0][1] as RequestInit).method).toBe('GET');
  });
});

describe('fetchTopVnsByTag', () => {
  it('builds the [tagId, maxSpoiler, minTagLevel] filter tuple', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([searchRow('v90010')])));
    const r = await fetchTopVnsByTag('G9001', { spoiler: 1, lieThreshold: 1.2 });
    expect(r.results[0].id).toBe('v90010');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['tag', '=', ['g9001', 1, 1.2]]);
    expect(body.sort).toBe('rating');
  });
});

describe('trait → character helpers', () => {
  it('getCharactersForTrait applies the [traitId, maxSpoiler] tuple by default', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([charRow('c90001')])));
    const out = await getCharactersForTrait('i9001');
    expect(out[0].id).toBe('c90001');
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['trait', '=', ['i9001', 0]]);
  });

  it('getCharactersForTrait drops the spoiler cap when includeSpoiler is set', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([charRow('c90002')])));
    await getCharactersForTrait('i9002', { includeSpoiler: true });
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters).toEqual(['trait', '=', 'i9002']);
  });

  it('getCharactersForTraitInVns returns [] for an empty / non-VNDB id set without a fetch', async () => {
    const out = await getCharactersForTraitInVns('i9003', ['egs_1', 'garbage']);
    expect(out).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('getCharactersForTraitInVns paginates a VN chunk and dedupes by character id', async () => {
    providerFetchMock
      .mockResolvedValueOnce(jsonResponse({ ...envelope([charRow('c90010')], true) }))
      .mockResolvedValueOnce(jsonResponse({ ...envelope([charRow('c90010'), charRow('c90011')], false) }));
    const out = await getCharactersForTraitInVns('i9004', ['v90020', 'v90021']);
    expect(out.map((c) => c.id).sort()).toEqual(['c90010', 'c90011']);
    // Two pages were consulted (more=true then more=false).
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
    // Multi-id VN set → `or` of id predicates nested under `and` with the trait.
    const body = JSON.parse(String((providerFetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.filters[0]).toBe('and');
  });
});

describe('cache-read helpers (no network)', () => {
  it('readCachedCharactersForVn returns [] before anything is cached', () => {
    expect(readCachedCharactersForVn('v90030')).toEqual([]);
  });

  it('readCachedCharactersForVn reads back what getCharactersForVn persisted', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([charRow('c90030')])));
    await getCharactersForVn('v90031');
    const cached = readCachedCharactersForVn('v90031');
    expect(cached.map((c) => c.id)).toEqual(['c90030']);
  });

  it('readCachedCharactersForVns maps hits and leaves misses as empty arrays', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse(envelope([charRow('c90040')])));
    await getCharactersForVn('v90040');
    const map = readCachedCharactersForVns(['v90040', 'v90041']);
    expect(map.get('v90040')?.map((c) => c.id)).toEqual(['c90040']);
    expect(map.get('v90041')).toEqual([]);
  });
});

describe('ulist write helpers — needsAuth + error branches', () => {
  beforeEach(() => {
    // Force the no-token state by clearing both the DB-stored token and env.
    setAppSetting('vndb_token', null);
    delete process.env.VNDB_TOKEN;
  });
  afterEach(() => {
    process.env.VNDB_TOKEN = FAKE_TOKEN;
  });

  it('addToVndbWishlist returns needsAuth and never fetches when no token is set', async () => {
    expect(await addToVndbWishlist('v90050')).toEqual({ needsAuth: true });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('removeFromVndbWishlist returns needsAuth without a token', async () => {
    expect(await removeFromVndbWishlist('v90051')).toEqual({ needsAuth: true });
  });

  it('patchUlistEntry returns needsAuth without a token', async () => {
    expect(await patchUlistEntry('v90052', { vote: 70 })).toEqual({ needsAuth: true });
  });

  it('deleteUlistEntry returns needsAuth without a token', async () => {
    expect(await deleteUlistEntry('v90053')).toEqual({ needsAuth: true });
  });

  it('fetchUlistLabels returns needsAuth without a token', async () => {
    expect(await fetchUlistLabels()).toEqual({ needsAuth: true });
  });

  it('fetchUlistEntry returns needsAuth without a token (auth lookup fails first)', async () => {
    // getAuthInfo() returns null with no token → needsAuth, no ulist fetch.
    expect(await fetchUlistEntry('v90054')).toEqual({ needsAuth: true });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });
});

describe('ulist write helpers — surfaced upstream errors', () => {
  it('patchUlistEntry throws on a non-OK response with a sanitised body', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('denied\nrow2', { status: 403 }));
    await expect(patchUlistEntry('v90060', { vote: 80 })).rejects.toThrow(/403/);
  });

  it('deleteUlistEntry throws on a non-OK response', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response('gone', { status: 500 }));
    await expect(deleteUlistEntry('v90061')).rejects.toThrow(/500/);
  });
});
