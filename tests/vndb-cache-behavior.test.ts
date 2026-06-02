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
  invalidateByPath,
  invalidateKey,
  readCachedJson,
  readCachedJsonMany,
  TTL,
} from '@/lib/vndb-cache';
import { clearCache, getCacheRow, putCacheRow, setAppSetting } from '@/lib/db';

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

  it('sends If-Modified-Since and rejects a corrupt cached body on the 304 path', async () => {
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
    providerFetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(
      cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: JSON.stringify({ k: 8 }), __pathTag: 'POST /vn' }, { ttlMs: TTL.vnDetail }),
    ).rejects.toThrow(/corrupt cache body/);
    const sentHeaders = new Headers((providerFetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(sentHeaders.get('If-Modified-Since')).toBe('Wed, 01 Jan 2025 00:00:00 GMT');
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

describe('in-flight de-dupe', () => {
  it('coalesces two concurrent identical requests into one fetch', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    providerFetchMock.mockImplementationOnce(
      () => new Promise<Response>((res) => { resolveFetch = res; }),
    );
    const init = { method: 'POST', body: JSON.stringify({ d: 1 }), __pathTag: 'POST /vn' };
    const p1 = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    const p2 = cachedFetch(`${PRIMARY}/vn`, init, { ttlMs: TTL.vnDetail });
    resolveFetch(jsonResponse({ ok: 1 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
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
    expect(readCachedJson('GET', '/kana/stats', undefined, passthrough)).toEqual({ ok: 1 });
  });

  it('accepts non-string and malformed-string request bodies in cache keys', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: new URLSearchParams('a=1'), __pathTag: 'POST /vn:params' }, { ttlMs: TTL.vnDetail });
    await cachedFetch(`${PRIMARY}/vn`, { method: 'POST', body: '{bad', __pathTag: 'POST /vn:bad-json' }, { ttlMs: TTL.vnDetail });
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('direct cache helpers', () => {
  it('invalidateKey deletes a row written with the matching shape', async () => {
    providerFetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const body = { z: 1 };
    await cachedFetch(
      `${PRIMARY}/vn`,
      { method: 'POST', body: JSON.stringify(body), __pathTag: 'POST /vn' },
      { ttlMs: TTL.vnDetail },
    );
    const cached = readCachedJson('POST', 'POST /vn', body, passthrough);
    expect(cached?.ok).toBe(1);
    invalidateKey('POST', 'POST /vn', body);
    expect(readCachedJson('POST', 'POST /vn', body, passthrough)).toBeNull();
  });

  it('invalidateByPath drops every row under a path prefix', async () => {
    providerFetchMock.mockImplementation(async () => jsonResponse({ ok: 1 }));
    await cachedFetch(`${PRIMARY}/ulist`, { method: 'POST', body: JSON.stringify({ p: 1 }), __pathTag: 'POST /ulist' }, { ttlMs: TTL.user });
    await cachedFetch(`${PRIMARY}/ulist`, { method: 'POST', body: JSON.stringify({ p: 2 }), __pathTag: 'POST /ulist' }, { ttlMs: TTL.user });
    const deleted = invalidateByPath('POST /ulist');
    expect(deleted).toBe(2);
  });

  it('readCachedJson returns null for an unknown key and for a corrupt row', async () => {
    expect(readCachedJson('POST', 'POST /never', { x: 1 }, passthrough)).toBeNull();
    putCacheRow({
      cache_key: 'POST /corrupt|POST|',
      body: '{bad',
      etag: null,
      last_modified: null,
      fetched_at: Date.now(),
      expires_at: Date.now() + 1000,
    });
    expect(readCachedJson('POST', 'POST /corrupt', undefined, passthrough)).toBeNull();
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
    const out = readCachedJsonMany(
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
