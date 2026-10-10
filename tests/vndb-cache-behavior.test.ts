/**
 * Hermetic coverage for `src/lib/vndb-cache.ts`.
 *
 * Drives the real `cachedFetch` lifecycle: cache HIT before expiry, MISS +
 * write, conditional 304 revalidation, stale-while-error fallback, the
 * in-flight de-dupe map, the TTL<=0 bypass, the response byte cap, the
 * non-OK / non-JSON / decoder-null error branches, and the mirror fallback.
 *
 * The single network primitive (`providerFetch`) is mocked. The 1 req/s
 * throttle's inter-request sleeps are bypassed (covered separately in
 * `vndb-throttle-runtime.test.ts`); the SSRF gate inside `doFetch` stays
 * real. `assertNoPrivateIpRebind` is stubbed so the mirror path never does
 * a live DNS lookup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerFetchMock, assertNoRebindMock } = vi.hoisted(() => ({
  providerFetchMock: vi.fn(),
  assertNoRebindMock: vi.fn(),
}));

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

vi.mock('@/lib/url-allowlist', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/url-allowlist')>();
  return { ...actual, assertNoPrivateIpRebind: assertNoRebindMock };
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

import { createHash } from 'node:crypto';
import {
  cachedFetch,
  invalidateAllCache,
  invalidateByPath,
  invalidateByPatterns,
  invalidateKey,
  readCachedJson,
  readCachedJsonEntry,
  readCachedJsonMany,
  TTL,
  type CachedFetchOptions,
} from '@/lib/vndb-cache';
import { clearCache, getCacheRow, putCacheRow, setAppSetting } from '@/lib/db';
import { getCacheRepository } from '@/lib/db/repositories/cache';
import * as cacheRepositoryModule from '@/lib/db/repositories/cache';
import * as databaseConfigModule from '@/lib/db/postgres-config';

const PRIMARY = 'https://api.vndb.org/kana';

/** Recreate the private `<pathTag>|<METHOD>|<body-hash>` cache-key shape. */
function cacheKey(pathTag: string, method: string, body?: unknown): string {
  if (!body) return `${pathTag}|${method}|`;
  const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return `${pathTag}|${method}|${hash}`;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Identity decoder used by most tests; a `null` return signals invalid. */
const passthrough = (v: unknown) => v as { ok: number };

beforeEach(() => {
  clearCache();
  providerFetchMock.mockReset();
  assertNoRebindMock.mockReset();
  assertNoRebindMock.mockResolvedValue(undefined);
  setAppSetting('vndb_backup_enabled', null);
  setAppSetting('vndb_backup_url', null);
});

afterEach(() => {
  providerFetchMock.mockReset();
});

describe('cache miss → write → hit', () => {
  it('fetches on miss, persists, then serves the second call from cache', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }, 200, { etag: 'W/"abc"' }));
    const init = { method: 'POST', body: JSON.stringify({ q: 1 }), __pathTag: 'POST /vn' };
    const first = await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    expect(first.fromCache).toBe(false);
    expect(first.status).toBe(200);

    const second = await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    expect(second.fromCache).toBe(true);
    expect(second.status).toBe(200);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);

    // The persisted row carries the etag from the upstream response.
    const row = getCacheRow(cacheKey('POST /vn', 'POST', { q: 1 }));
    expect(row?.etag).toBe('W/"abc"');
  });
});

describe('forced refresh retains valid cached data', () => {
  it('revalidates a fresh row instead of serving it through stale-while-revalidate', async () => {
    const init = { method: 'POST', body: JSON.stringify({ forced: 1 }), __pathTag: 'POST /vn' };
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }, 200, { etag: 'valid' }));
    await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 2 }));

    const refreshed = await cachedFetch(`${PRIMARY}/vn`, init, {
      ttlMs: TTL.vnDetail, forceRefresh: true, staleWhileRevalidate: true,
    });

    expect(refreshed).toMatchObject({ data: { ok: 2 }, fromCache: false, status: 200 });
    expect(new Headers(providerFetchMock.mock.calls[1][1].headers).get('If-None-Match')).toBe('valid');
    expect(await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail })).toMatchObject({ data: { ok: 2 }, fromCache: true });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a fresh snapshot and its timestamps if forced refresh fails', async () => {
    const init = { method: 'POST', body: JSON.stringify({ forced: 2 }), __pathTag: 'POST /vn' };
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 3 }));
    const original = await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    const key = cacheKey('POST /vn', 'POST', { forced: 2 });
    const row = getCacheRow(key);
    providerFetchMock.mockRejectedValueOnce(new Error('upstream unavailable'));

    expect(await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail, forceRefresh: true })).toMatchObject({
      data: { ok: 3 }, fromCache: true, stale: true, cachedAt: original.cachedAt,
    });
    expect(getCacheRow(key)).toEqual(row);
  });
});

describe('TTL <= 0 bypass', () => {
  it('never reads or writes the cache when ttlMs is 0', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse({ ok: 2 }));
    const init = { method: 'POST', body: JSON.stringify({ r: 1 }), __pathTag: 'POST /quote' };
    await cachedFetch(`${PRIMARY}/quote`, init, { ttlMs: 0 });
    await cachedFetch(`${PRIMARY}/quote`, init, { ttlMs: 0 });
    // Both calls hit upstream; nothing was written.
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('expired cache + 304 revalidation', () => {
  it('sends If-None-Match and refreshes timestamps on 304', async () => {
    // Seed an expired row carrying an etag.
    const key = cacheKey('POST /vn', 'POST', { k: 7 });
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: key,
      body: JSON.stringify({ ok: 9 }),
      etag: 'W/"v9"',
      last_modified: null,
      fetched_at: past,
      expires_at: past + 1,
    });
    providerFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const init = { method: 'POST', body: JSON.stringify({ k: 7 }), __pathTag: 'POST /vn' };
    const r = await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    expect(r.status).toBe(304);
    expect(r.fromCache).toBe(true);
    expect((r.data as { ok: number }).ok).toBe(9);
    // The conditional header was sent.
    const sentHeaders = new Headers((providerFetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(sentHeaders.get('If-None-Match')).toBe('W/"v9"');
    // Expiry was bumped into the future.
    expect(getCacheRow(key)!.expires_at).toBeGreaterThan(Date.now());
  });

  it('refetches a corrupt cached body without conditional validators', async () => {
    const key = cacheKey('POST /vn', 'POST', { k: 8 });
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: key,
      body: '{bad',
      etag: null,
      last_modified: 'Wed, 01 Jan 2025 00:00:00 GMT',
      fetched_at: past,
      expires_at: past + 1,
    });
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 8 }));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: JSON.stringify({ k: 8 }), __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail }),
    ).resolves.toMatchObject({ data: { ok: 8 }, fromCache: false });
    const sentHeaders = new Headers((providerFetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(sentHeaders.has('If-Modified-Since')).toBe(false);
    expect(JSON.parse(getCacheRow(key)!.body)).toEqual({ ok: 8 });
  });

  it('preserves timestamps when a revalidated body no longer passes its decoder', async () => {
    const key = cacheKey('POST /vn', 'POST', { k: 9 });
    const past = Date.now() - 10_000;
    putCacheRow({ cache_key: key, body: '{"ok":9}', etag: 'etag', last_modified: null, fetched_at: past, expires_at: past + 1 });
    const decoder = vi.fn<NonNullable<CachedFetchOptions<{ ok: number }>['decode']>>()
      .mockReturnValueOnce({ ok: 9 }).mockReturnValueOnce(null).mockReturnValueOnce(null);
    providerFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(cachedFetch(`${PRIMARY}/vn`, {
      method: 'POST', body: JSON.stringify({ k: 9 }), __pathTag: 'POST /vn',
    }, { ttlMs: TTL.vnDetail, decode: decoder, staleWhileError: false })).rejects.toThrow(/corrupt cache body/);
    expect(getCacheRow(key)?.fetched_at).toBe(past);
    expect(getCacheRow(key)?.expires_at).toBe(past + 1);
  });

  it('revalidates a usable Last-Modified response and reports the new cache timestamp', async () => {
    const key = cacheKey('POST /vn', 'POST', { k: 10 });
    const past = Date.now() - 10_000;
    putCacheRow({ cache_key: key, body: '{"ok":10}', etag: null, last_modified: 'Wed, 01 Jan 2025 00:00:00 GMT', fetched_at: past, expires_at: past + 1 });
    providerFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const result = await cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: JSON.stringify({ k: 10 }), __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail });
    expect(new Headers(providerFetchMock.mock.calls[0][1].headers).get('If-Modified-Since')).toBe('Wed, 01 Jan 2025 00:00:00 GMT');
    expect(result.cachedAt).toBe(getCacheRow(key)?.fetched_at);
    expect(result.cachedAt).toBeGreaterThan(past);
  });
});

describe('stale-while-error fallback', () => {
  it('returns the stale cached body when the refresh throws', async () => {
    const key = cacheKey('POST /vn', 'POST', { s: 1 });
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: key,
      body: JSON.stringify({ ok: 5 }),
      etag: null,
      last_modified: null,
      fetched_at: past,
      expires_at: past + 1,
    });
    providerFetchMock.mockRejectedValueOnce(new Error('network down'));
    const init = { method: 'POST', body: JSON.stringify({ s: 1 }), __pathTag: 'POST /vn' };
    const r = await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    expect(r.stale).toBe(true);
    expect(r.status).toBe(0);
    expect((r.data as { ok: number }).ok).toBe(5);
  });

  it('re-throws when there is no cached row to fall back to', async () => {
    providerFetchMock.mockRejectedValueOnce(new Error('network down'));
    const init = { method: 'POST', body: JSON.stringify({ s: 2 }), __pathTag: 'POST /vn' };
    await expect(cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail })).rejects.toThrow(/network down/);
  });

  it('re-throws the upstream failure when the stale cached row is corrupt', async () => {
    const key = cacheKey('POST /vn', 'POST', { s: 3 });
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: key,
      body: '{bad',
      etag: null,
      last_modified: null,
      fetched_at: past,
      expires_at: past + 1,
    });
    providerFetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: JSON.stringify({ s: 3 }), __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail }),
    ).rejects.toThrow(/network down/);
  });
});

describe('stale-while-revalidate', () => {
  it('returns a valid expired row immediately and coalesces one background refresh', async () => {
    const key = cacheKey('POST /vn:swr', 'POST', { s: 4 });
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: key,
      body: JSON.stringify({ ok: 5 }),
      etag: null,
      last_modified: null,
      fetched_at: past,
      expires_at: past + 1,
    });
    let resolveFetch: (response: Response) => void = () => undefined;
    providerFetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const init = { method: 'POST', body: JSON.stringify({ s: 4 }), __pathTag: 'POST /vn:swr' };

    const first = await cachedFetch(`${PRIMARY}/vn`, init, {
      ttlMs: TTL.vnDetail,
      staleWhileRevalidate: true,
    });
    const second = await cachedFetch(`${PRIMARY}/vn`, init, {
      ttlMs: TTL.vnDetail,
      staleWhileRevalidate: true,
    });

    expect(first).toMatchObject({ data: { ok: 5 }, fromCache: true, stale: true, status: 0 });
    expect(second).toMatchObject({ data: { ok: 5 }, fromCache: true, stale: true, status: 0 });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());

    resolveFetch(jsonResponse({ ok: 6 }));
    await vi.waitFor(() => expect(JSON.parse(getCacheRow(key)!.body)).toEqual({ ok: 6 }));
  });

  it('waits for upstream when the expired row cannot be decoded', async () => {
    const key = cacheKey('POST /vn:swr-corrupt', 'POST', { s: 5 });
    const past = Date.now() - 10_000;
    putCacheRow({
      cache_key: key,
      body: '{bad',
      etag: null,
      last_modified: null,
      fetched_at: past,
      expires_at: past + 1,
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 7 }));

    const result = await cachedFetch(
      `${PRIMARY}/vn`,
      { method: 'POST', body: JSON.stringify({ s: 5 }), __pathTag: 'POST /vn:swr-corrupt' },
      { ttlMs: TTL.vnDetail, staleWhileRevalidate: true },
    );

    expect(result).toMatchObject({ data: { ok: 7 }, fromCache: false, status: 200 });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});

describe('in-flight de-dupe', () => {
  it('starts a new request after invalidation and does not persist the older response', async () => {
    let resolveOld: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    const body = { id: 'invalidation-race' };
    const init = { method: 'POST', body: JSON.stringify(body), __pathTag: 'POST /vn' };
    const oldRequest = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());

    await invalidateKey('POST', 'POST /vn', body);
    const newRequest = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await expect(newRequest).resolves.toMatchObject({ data: { ok: 2 } });
    resolveOld(jsonResponse({ ok: 1 }));

    await expect(oldRequest).resolves.toMatchObject({ data: { ok: 1 } });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
    expect(await readCachedJson('POST', 'POST /vn', body, passthrough)).toEqual({ ok: 2 });
  });

  it.each(['path', 'patterns', 'all'] as const)('detaches pending requests on %s invalidation', async (kind) => {
    let resolveOld: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    const path = 'POST /vn:producer:p90001';
    const init = { method: 'POST', __pathTag: path };
    const oldRequest = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());

    if (kind === 'path') await invalidateByPath(path);
    else if (kind === 'patterns') await invalidateByPatterns(['POST /vn:producer:p9000_|%']);
    else await invalidateAllCache();

    await expect(cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail })).resolves.toMatchObject({ data: { ok: 2 } });
    resolveOld(jsonResponse({ ok: 1 }));
    await oldRequest;
    expect(await readCachedJson('POST', path, undefined, passthrough)).toEqual({ ok: 2 });
  });

  it('preserves pending requests outside the invalidated pattern, including regex characters', async () => {
    let resolveOld: (response: Response) => void = () => {};
    providerFetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }));
    const path = 'POST /vn:producer:p90002[?]';
    const init = { method: 'POST', __pathTag: path };
    const active = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    await invalidateByPatterns(['POST /vn:producer:p90001[?]|%', 'POST /other%']);
    await invalidateByPatterns([]);
    resolveOld(jsonResponse({ ok: 2 }));
    await active;
    expect(await readCachedJson('POST', path, undefined, passthrough)).toEqual({ ok: 2 });
  });

  it('uses the SQLite literal-prefix case matching for pending requests', async () => {
    let resolveOld: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    const path = 'POST /VN:prefix-case';
    const init = { method: 'POST', __pathTag: path };
    const oldRequest = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    await invalidateByPath('POST /vn:prefix-case');
    await expect(cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail })).resolves.toMatchObject({ data: { ok: 2 } });
    resolveOld(jsonResponse({ ok: 1 }));
    await oldRequest;
    expect(await readCachedJson('POST', path, undefined, passthrough)).toEqual({ ok: 2 });
  });

  it('uses PostgreSQL case-sensitive and escaped LIKE matching for pending requests', async () => {
    let resolveFirst: (response: Response) => void = () => {};
    let resolveSecond: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    const firstPath = 'POST /VN:literal_';
    const secondPath = 'POST /vn:literalx';
    const first = cachedFetch(`${PRIMARY}/vn`, { method: 'POST', __pathTag: firstPath }, { ttlMs: TTL.vnDetail });
    const second = cachedFetch(`${PRIMARY}/vn`, { method: 'POST', __pathTag: secondPath }, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledTimes(2));
    const repository = getCacheRepository();
    const configuration = databaseConfigModule.readDatabaseConfig({
      DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgresql://127.0.0.1/cache-test',
    });
    const configSpy = vi.spyOn(databaseConfigModule, 'readDatabaseConfig').mockReturnValue(configuration);
    const repoSpy = vi.spyOn(cacheRepositoryModule, 'getCacheRepository').mockReturnValue(repository);
    const deleteSpy = vi.spyOn(repository, 'deleteByPatterns').mockResolvedValue(0);
    try {
      await invalidateByPatterns(['POST /vn:literal\\_|%']);
      await invalidateByPatterns(['POST /VN:literal\\_|%']);
      await invalidateByPatterns(['POST /missing\\']);
    } finally {
      deleteSpy.mockRestore();
      repoSpy.mockRestore();
      configSpy.mockRestore();
    }
    resolveFirst(jsonResponse({ ok: 1 }));
    resolveSecond(jsonResponse({ ok: 2 }));
    await Promise.all([first, second]);
    expect(await readCachedJson('POST', firstPath, undefined, passthrough)).toBeNull();
    expect(await readCachedJson('POST', secondPath, undefined, passthrough)).toEqual({ ok: 2 });
  });

  it('does not let a late 304 touch a replacement snapshot', async () => {
    const path = 'POST /vn:late-304';
    const key = cacheKey(path, 'POST');
    putCacheRow({ cache_key: key, body: '{"ok":1}', etag: 'old', last_modified: null, fetched_at: 1, expires_at: 2 });
    let resolveOld: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    const init = { method: 'POST', __pathTag: path };
    const oldRequest = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    await invalidateKey('POST', path);
    await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    const replacement = getCacheRow(key);
    resolveOld(new Response(null, { status: 304 }));
    await expect(oldRequest).resolves.toMatchObject({ data: { ok: 1 }, status: 304 });
    expect(getCacheRow(key)).toEqual(replacement);
  });

  it('keeps the replacement shared when an invalidated subscriber aborts', async () => {
    let resolveOld: (response: Response) => void = () => {};
    let resolveNew: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveNew = resolve; }));
    const controller = new AbortController();
    const init = { method: 'POST', __pathTag: 'POST /vn:invalidated-abort' };
    const oldRequest = cachedFetch(`${PRIMARY}/vn`, { ...init, signal: controller.signal }, { ttlMs: TTL.vnDetail });
    const settlement = expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    await invalidateKey('POST', init.__pathTag);
    const replacement = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledTimes(2));
    controller.abort();
    await settlement;
    const sharedReplacement = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    resolveOld(jsonResponse({ ok: 1 }));
    resolveNew(jsonResponse({ ok: 2 }));
    await expect(replacement).resolves.toMatchObject({ data: { ok: 2 } });
    await expect(sharedReplacement).resolves.toMatchObject({ data: { ok: 2 } });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a cache lookup invalidated while the database read is running', async () => {
    const path = 'POST /vn:lookup-invalidation';
    const key = cacheKey(path, 'POST');
    putCacheRow({ cache_key: key, body: '{"ok":1}', etag: null, last_modified: null, fetched_at: 1, expires_at: Date.now() + 10000 });
    const repository = getCacheRepository();
    const oldRow = getCacheRow(key);
    const getSpy = vi.spyOn(repository, 'get').mockImplementationOnce(async () => {
      await invalidateKey('POST', path);
      return oldRow;
    });
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    try {
      await expect(cachedFetch(`${PRIMARY}/vn`, { method: 'POST', __pathTag: path }, { ttlMs: TTL.vnDetail })).resolves.toMatchObject({ data: { ok: 2 }, fromCache: false });
      expect(getSpy).toHaveBeenCalledTimes(2);
    } finally {
      getSpy.mockRestore();
    }
  });

  it('orders invalidation after an asynchronous cache write already in progress', async () => {
    const repository = getCacheRepository();
    const originalPut = repository.put.bind(repository);
    let completePut: () => void = () => {};
    const putSpy = vi.spyOn(repository, 'put').mockImplementationOnce(async (row) => {
      await new Promise<void>((resolve) => { completePut = resolve; });
      await originalPut(row);
    });
    const path = 'POST /vn:put-invalidation';
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const request = cachedFetch(`${PRIMARY}/vn`, { method: 'POST', __pathTag: path }, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(putSpy).toHaveBeenCalledOnce());
    const invalidation = invalidateKey('POST', path);
    completePut();
    await Promise.all([request, invalidation]);
    putSpy.mockRestore();
    expect(getCacheRow(cacheKey(path, 'POST'))).toBeNull();
  });

  it('recovers the mutation queue after an invalidation fails', async () => {
    const repository = getCacheRepository();
    const deleteSpy = vi.spyOn(repository, 'deleteKey').mockRejectedValueOnce(new Error('database unavailable'));
    await expect(invalidateKey('POST', 'POST /vn:queue-failure')).rejects.toThrow('database unavailable');
    deleteSpy.mockRestore();
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    await expect(cachedFetch(`${PRIMARY}/vn`, { method: 'POST', __pathTag: 'POST /vn:queue-failure' }, { ttlMs: TTL.vnDetail })).resolves.toMatchObject({ data: { ok: 2 } });
  });

  it('coalesces two concurrent identical requests into one fetch', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    providerFetchMock.mockImplementationOnce(
      () => new Promise<Response>((res) => { resolveFetch = res; }),
    );
    const init = { method: 'POST', body: JSON.stringify({ d: 1 }), __pathTag: 'POST /vn' };
    const p1 = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    const p2 = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    resolveFetch(jsonResponse({ ok: 1 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps one shared fetch alive when only one consumer aborts', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const captured: { signal: AbortSignal | null } = { signal: null };
    providerFetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      captured.signal = init?.signal ?? null;
      return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const base = { method: 'POST', body: JSON.stringify({ d: 2 }), __pathTag: 'POST /vn' };
    const first = cachedFetch(`${PRIMARY}/vn`, { ...base, signal: firstController.signal }, { ttlMs: TTL.vnDetail });
    const second = cachedFetch(`${PRIMARY}/vn`, { ...base, signal: secondController.signal }, { ttlMs: TTL.vnDetail });
    const firstSettlement = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());

    firstController.abort();
    await firstSettlement;
    expect(captured.signal?.aborted).toBe(false);
    resolveFetch(jsonResponse({ ok: 2 }));
    await expect(second).resolves.toMatchObject({ status: 200 });
  });

  it('aborts upstream and permits a fresh request when every consumer leaves', async () => {
    const captured: { signal: AbortSignal | null } = { signal: null };
    providerFetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      captured.signal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    });
    const controller = new AbortController();
    const base = { method: 'POST', body: JSON.stringify({ d: 3 }), __pathTag: 'POST /vn' };
    const abandoned = cachedFetch(`${PRIMARY}/vn`, { ...base, signal: controller.signal }, { ttlMs: TTL.vnDetail });
    const settlement = expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());

    controller.abort();
    await settlement;
    expect(captured.signal?.aborted).toBe(true);

    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 3 }));
    await expect(cachedFetch(`${PRIMARY}/vn`, base, { ttlMs: TTL.vnDetail })).resolves.toMatchObject({ status: 200 });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes a non-Error reason for an already-aborted caller', async () => {
    const controller = new AbortController();
    controller.abort('route disposed');

    await expect(cachedFetch(
      `${PRIMARY}/vn`,
      { method: 'POST', body: JSON.stringify({ d: 4 }), __pathTag: 'POST /vn:already-aborted', signal: controller.signal },
      { ttlMs: TTL.vnDetail },
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('rejects an already-aborted subscriber without canceling the active consumer', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    providerFetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const base = { method: 'POST', body: JSON.stringify({ d: 5 }), __pathTag: 'POST /vn:late-aborted' };
    const active = cachedFetch(`${PRIMARY}/vn`, base, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    const controller = new AbortController();
    controller.abort('route disposed');
    const rejected = cachedFetch(`${PRIMARY}/vn`, { ...base, signal: controller.signal }, { ttlMs: TTL.vnDetail });

    await expect(rejected).rejects.toMatchObject({ name: 'AbortError' });
    resolveFetch(jsonResponse({ ok: 5 }));
    await expect(active).resolves.toMatchObject({ data: { ok: 5 } });
  });

  it('rejects a caller aborted while its cache lookup is in progress', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    providerFetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const base = { method: 'POST', body: JSON.stringify({ d: 7 }), __pathTag: 'POST /vn:lookup-abort' };
    const active = cachedFetch(`${PRIMARY}/vn`, base, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());

    const controller = new AbortController();
    const repository = getCacheRepository();
    const get = vi.spyOn(repository, 'get').mockImplementationOnce(async () => {
      controller.abort('route disposed');
      return null;
    });
    const aborted = cachedFetch(`${PRIMARY}/vn`, { ...base, signal: controller.signal }, { ttlMs: TTL.vnDetail });
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    get.mockRestore();

    resolveFetch(jsonResponse({ ok: 7 }));
    await expect(active).resolves.toMatchObject({ data: { ok: 7 } });
  });

  it('does not let an abandoned completion clear its replacement request', async () => {
    let resolveOld: (response: Response) => void = () => {};
    let resolveNew: (response: Response) => void = () => {};
    providerFetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveNew = resolve; }));
    const base = { method: 'POST', body: JSON.stringify({ d: 6 }), __pathTag: 'POST /vn:replacement' };
    const controller = new AbortController();
    const oldRequest = cachedFetch(`${PRIMARY}/vn`, { ...base, signal: controller.signal }, { ttlMs: TTL.vnDetail });
    const oldSettlement = expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await oldSettlement;

    const replacement = cachedFetch(`${PRIMARY}/vn`, base, { ttlMs: TTL.vnDetail });
    const sharedReplacement = cachedFetch(`${PRIMARY}/vn`, base, { ttlMs: TTL.vnDetail });
    await vi.waitFor(() => expect(providerFetchMock).toHaveBeenCalledTimes(2));
    resolveOld(jsonResponse({ ok: 4 }));
    resolveNew(jsonResponse({ ok: 6 }));

    await expect(replacement).resolves.toMatchObject({ data: { ok: 6 } });
    await expect(sharedReplacement).resolves.toMatchObject({ data: { ok: 6 } });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('corrupt cache body is treated as a miss', () => {
  it('refetches when the fresh cache row fails to parse', async () => {
    const key = cacheKey('POST /vn', 'POST', { c: 1 });
    putCacheRow({
      cache_key: key,
      body: '{ not json',
      etag: null,
      last_modified: null,
      fetched_at: Date.now(),
      expires_at: Date.now() + 60_000,
    });
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 11 }));
    const init = { method: 'POST', body: JSON.stringify({ c: 1 }), __pathTag: 'POST /vn' };
    const r = await cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    // The corrupt row did not satisfy the hit; upstream was consulted.
    expect(r.fromCache).toBe(false);
    expect((r.data as { ok: number }).ok).toBe(11);
  });
});

describe('error branches', () => {
  it('throws on a non-OK upstream status', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad' }, 400));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{}', __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/400/);
  });

  it('throws on a non-JSON 200 body', async () => {
    providerFetchMock.mockResolvedValueOnce(
      new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{}', __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail }),
    ).rejects.toThrow(/non-JSON response/);
  });

  it('throws when the decoder rejects the payload shape', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{}', __pathTag: 'POST /vn' }, {
        ttlMs: TTL.vnDetail,
        decode: () => null,
      }),
    ).rejects.toThrow(/invalid payload shape/);
  });

  it('refuses a non-allowlisted URL before any fetch', async () => {
    await expect(
      cachedFetch('http://127.0.0.1/kana/vn', { __pathTag: 'GET /vn' }, { ttlMs: TTL.vnDetail }),
    ).rejects.toThrow(/refusing fetch to non-allowlisted URL/);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized response via the byte cap', async () => {
    // content-length above the 32 MiB cap → readResponseTextWithCap returns null.
    providerFetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-length': String(40 * 1024 * 1024) } }),
    );
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{}', __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/exceeded/);
  });

  it('rejects a streamed response that exceeds the byte cap and tolerates a cancel failure', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1));
      },
      cancel() {
        throw new Error('cancel failed');
      },
    });
    providerFetchMock.mockResolvedValueOnce(new Response(stream, { status: 200 }));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{}', __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/exceeded/);
  });

  it('treats a missing response body as an empty JSON object', async () => {
    providerFetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      cachedFetch(`${PRIMARY}/stats`, { __pathTag: 'GET /stats' }, { ttlMs: TTL.stats }),
    ).resolves.toMatchObject({ data: {}, status: 200 });
  });

  it('skips an empty streamed chunk before decoding the response', async () => {
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: undefined })
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('{}') })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };
    const response = new Response('{}', { status: 200 });
    Object.defineProperty(response, 'body', { value: { getReader: () => reader } });
    providerFetchMock.mockResolvedValueOnce(response);
    await expect(
      cachedFetch(`${PRIMARY}/stats`, { __pathTag: 'GET /stats:empty-chunk' }, { ttlMs: TTL.stats }),
    ).resolves.toMatchObject({ data: {}, status: 200 });
  });
});

describe('mirror fallback', () => {
  it('retries the configured backup base when the primary fetch fails', async () => {
    setAppSetting('vndb_backup_enabled', '1');
    setAppSetting('vndb_backup_url', 'https://api.yorhel.org/kana');
    providerFetchMock
      .mockRejectedValueOnce(new Error('primary 503'))
      .mockResolvedValueOnce(jsonResponse({ ok: 99 }));
    const r = await cachedFetch(
      `${PRIMARY}/vn`,
      { method: 'POST', body: JSON.stringify({ m: 1 }), __pathTag: 'POST /vn' },
      { ttlMs: TTL.vnDetail },
    );
    expect((r.data as { ok: number }).ok).toBe(99);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
    // The second attempt hit the mirror host.
    expect(String(providerFetchMock.mock.calls[1][0])).toContain('api.yorhel.org');
    expect(assertNoRebindMock).toHaveBeenCalledWith('api.yorhel.org');
  });

  it('does not use the mirror for an authenticated request', async () => {
    setAppSetting('vndb_backup_enabled', '1');
    setAppSetting('vndb_backup_url', 'https://api.yorhel.org/kana');
    providerFetchMock.mockRejectedValue(new Error('primary 503'));
    await expect(
      cachedFetch(
        `${PRIMARY}/vn`,
        { method: 'POST', body: JSON.stringify({ a: 1 }), headers: { Authorization: 'Token x' }, __pathTag: 'POST /vn' },
        { ttlMs: TTL.vnDetail, staleWhileError: false },
      ),
    ).rejects.toThrow(/primary 503/);
    // Only the primary was attempted — no mirror retry on the authed path.
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the default mirror URL and trims trailing slashes from configured mirrors', async () => {
    setAppSetting('vndb_backup_enabled', '1');
    providerFetchMock
      .mockRejectedValueOnce(new Error('primary 503'))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/vn`, { __pathTag: 'GET /vn:default-mirror' }, { ttlMs: TTL.vnDetail });
    expect(String(providerFetchMock.mock.calls[1][0])).toBe('https://api.yorhel.org/kana/vn');

    clearCache();
    providerFetchMock.mockReset();
    setAppSetting('vndb_backup_url', 'https://api.yorhel.org/kana///');
    providerFetchMock
      .mockRejectedValueOnce(new Error('primary 503'))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    await cachedFetch(`${PRIMARY}/stats`, { __pathTag: 'GET /stats:trimmed-mirror' }, { ttlMs: TTL.stats });
    expect(String(providerFetchMock.mock.calls[1][0])).toBe('https://api.yorhel.org/kana/stats');
  });

  it('suppresses mirror retry for non-primary URLs, disallowed mirrors, and failed mirror DNS validation', async () => {
    setAppSetting('vndb_backup_enabled', '1');
    providerFetchMock.mockRejectedValueOnce(new Error('mirror direct failure'));
    await expect(
      cachedFetch('https://api.yorhel.org/kana/vn', { __pathTag: 'GET /mirror-direct' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/mirror direct failure/);

    setAppSetting('vndb_backup_url', 'http://127.0.0.1/kana');
    providerFetchMock.mockRejectedValueOnce(new Error('disallowed mirror'));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { __pathTag: 'GET /vn:disallowed-mirror' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/disallowed mirror/);

    setAppSetting('vndb_backup_url', 'https://api.yorhel.org/kana');
    assertNoRebindMock.mockRejectedValueOnce(new Error('private address'));
    providerFetchMock.mockRejectedValueOnce(new Error('dns rejected mirror'));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { __pathTag: 'GET /vn:dns-rejected-mirror' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/dns rejected mirror/);
  });

  it('surfaces the primary error when the mirror retry also fails', async () => {
    setAppSetting('vndb_backup_enabled', '1');
    providerFetchMock
      .mockRejectedValueOnce(new Error('primary reason'))
      .mockRejectedValueOnce(new Error('mirror reason'));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { __pathTag: 'GET /vn:double-failure' }, { ttlMs: TTL.vnDetail, staleWhileError: false }),
    ).rejects.toThrow(/primary reason/);
  });
});

describe('cache key defaults and body parsing', () => {
  it('uses the URL pathname and GET method defaults', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/stats`, {}, { ttlMs: TTL.stats });
    expect(await readCachedJson('GET', '/kana/stats', undefined, passthrough)).toEqual({ ok: 1 });
  });

  it('accepts non-string and malformed-string request bodies in cache keys', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: new URLSearchParams('a=1'), __pathTag: 'POST /vn:params' }, { ttlMs: TTL.vnDetail });
    await cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{bad', __pathTag: 'POST /vn:bad-json' }, { ttlMs: TTL.vnDetail });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('direct cache helpers', () => {
  it('rejects wildcard path prefixes before invalidating requests', async () => {
    await expect(invalidateByPath('POST /v%')).rejects.toThrow('LIKE metacharacters');
  });
  it('invalidateKey deletes a row written with the matching shape', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const body = { z: 1 };
    await cachedFetch(
      `${PRIMARY}/vn`,
      { method: 'POST', body: JSON.stringify(body), __pathTag: 'POST /vn' },
      { ttlMs: TTL.vnDetail },
    );
    const cached = await readCachedJson('POST', 'POST /vn', body, passthrough);
    expect(cached?.ok).toBe(1);
    await invalidateKey('POST', 'POST /vn', body);
    expect(await readCachedJson('POST', 'POST /vn', body, passthrough)).toBeNull();
  });

  it('invalidateByPath drops every row under a path prefix', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/ulist`, { method: 'POST', body: JSON.stringify({ p: 1 }), __pathTag: 'POST /ulist' }, { ttlMs: TTL.user });
    await cachedFetch(`${PRIMARY}/ulist`, { method: 'POST', body: JSON.stringify({ p: 2 }), __pathTag: 'POST /ulist' }, { ttlMs: TTL.user });
    const deleted = await invalidateByPath('POST /ulist');
    expect(deleted).toBe(2);
  });

  it('readCachedJson returns null for an unknown key and for a corrupt row', async () => {
    expect(await readCachedJson('POST', 'POST /never', { x: 1 }, passthrough)).toBeNull();
    putCacheRow({
      cache_key: 'POST /corrupt|POST|',
      body: '{bad',
      etag: null,
      last_modified: null,
      fetched_at: Date.now(),
      expires_at: Date.now() + 1000,
    });
    expect(await readCachedJson('POST', 'POST /corrupt', undefined, passthrough)).toBeNull();
  });

  it('readCachedJsonEntry returns validated data with freshness timestamps', async () => {
    const fetchedAt = Date.now() - 500;
    const expiresAt = Date.now() + 500;
    putCacheRow({
      cache_key: cacheKey('POST /entry', 'POST', { x: 1 }),
      body: JSON.stringify({ ok: 7 }),
      etag: null,
      last_modified: null,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    });

    await expect(readCachedJsonEntry('POST', 'POST /entry', { x: 1 }, passthrough)).resolves.toEqual({
      data: { ok: 7 },
      fetchedAt,
      expiresAt,
    });
    await expect(readCachedJsonEntry('POST', 'POST /entry', { x: 1 }, () => null)).resolves.toBeNull();
    await expect(readCachedJsonEntry('POST', 'POST /missing', undefined, passthrough)).resolves.toBeNull();
  });

  it('readCachedJsonMany hydrates several keys and skips misses + corrupt rows', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: JSON.stringify({ id: 'a' }), __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail });
    putCacheRow({
      cache_key: cacheKey('POST /vn', 'POST', { id: 'bad' }),
      body: '{bad',
      etag: null,
      last_modified: null,
      fetched_at: Date.now(),
      expires_at: Date.now() + 1000,
    });
    const out = await readCachedJsonMany(
      [
        { id: 'hit', method: 'POST', pathTag: 'POST /vn', body: { id: 'a' } },
        { id: 'miss', method: 'POST', pathTag: 'POST /vn', body: { id: 'nope' } },
        { id: 'corrupt', method: 'POST', pathTag: 'POST /vn', body: { id: 'bad' } },
      ],
      passthrough,
    );
    expect(out.get('hit')?.ok).toBe(1);
    expect(out.has('miss')).toBe(false);
    expect(out.has('corrupt')).toBe(false);
  });
});
