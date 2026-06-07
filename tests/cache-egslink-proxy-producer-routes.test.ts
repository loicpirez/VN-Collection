/**
 * Success / meaningful-branch coverage for routes whose happy paths were
 * previously untested (existing suites only cover the auth-403 branch):
 * vndb/cache (GET stats + DELETE all/expired/prefix modes), egs/[id]/vndb
 * (GET/POST/DELETE pin lifecycle), proxy/test (unknown provider + not-
 * configured, both of which short-circuit before any network), and
 * producer/[id]/refresh (success + upstream-failure).
 *
 * `@/lib/producer-associations` is mocked at the function level so the
 * refresh route never touches VNDB. No proxy env is set, so proxy/test
 * resolves to "not configured" without a real fetch. Cache and link
 * fixtures use the real per-worker SQLite with synthetic ids. Authorized
 * requests use host 127.0.0.1 (the auth gate requires loopback). Each case
 * asserts exactly one HTTP status plus a body assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as cacheGET, DELETE as cacheDELETE } from '@/app/api/vndb/cache/route';
import {
  GET as egsVndbGET,
  POST as egsVndbPOST,
  DELETE as egsVndbDELETE,
} from '@/app/api/egs/[id]/vndb/route';
import { POST as proxyTestPOST } from '@/app/api/proxy/test/route';
import { POST as producerRefreshPOST } from '@/app/api/producer/[id]/refresh/route';
import { db } from '@/lib/db';
import * as activityModule from '@/lib/activity';

const { fetchAssocMock, invalidateAssocMock } = vi.hoisted(() => ({
  fetchAssocMock: vi.fn(),
  invalidateAssocMock: vi.fn(),
}));

vi.mock('@/lib/producer-associations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/producer-associations')>();
  return {
    ...actual,
    fetchProducerAssociations: fetchAssocMock,
    invalidateProducerAssociations: invalidateAssocMock,
  };
});

const EGS_ID = 90901;
const VN_ID = 'v90901';
const PRODUCER_ID = 'p90901';

function loopback(path: string, method = 'GET', body?: unknown, fwd = '127.0.0.1'): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { host: '127.0.0.1', 'content-type': 'application/json', 'x-forwarded-for': fwd },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function external(path: string, method = 'GET'): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`, {
    method,
    headers: { host: '93.184.216.34' },
  });
}

beforeEach(() => {
  fetchAssocMock.mockReset();
  invalidateAssocMock.mockReset();
});

afterEach(() => {
  db.prepare('DELETE FROM egs_vn_link WHERE egs_id = ?').run(EGS_ID);
  db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run('%__test_cache_route%');
  db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run('%test-cache-route%');
});

describe('GET /api/vndb/cache', () => {
  it('403 from an external origin', async () => {
    const res = await cacheGET(external('/api/vndb/cache') as never);
    expect(res.status).toBe(403);
  });

  it('200 with cache stats from loopback', async () => {
    const res = await cacheGET(loopback('/api/vndb/cache') as never);
    expect(res.status).toBe(200);
    expect((await res.json()).stats).toBeDefined();
  });
});

describe('DELETE /api/vndb/cache', () => {
  function seedCacheRow(cacheKey = 'GET /__test_cache_route|GET|abc'): void {
    db.prepare(
      'INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)',
    ).run(cacheKey, '{}', Date.now(), Date.now() - 1000);
  }

  it('200 pruning expired rows in expired mode', async () => {
    seedCacheRow();
    const res = await cacheDELETE(loopback('/api/vndb/cache?mode=expired', 'DELETE') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('expired');
    expect(body.removed).toBeGreaterThanOrEqual(1);
  });

  it('400 when a prefix contains LIKE wildcards', async () => {
    const res = await cacheDELETE(loopback('/api/vndb/cache?mode=prefix&prefix=a%25b', 'DELETE') as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/LIKE wildcard/);
  });

  it('200 deleting rows by an exact path prefix', async () => {
    seedCacheRow('GET /test-cache-route|GET|abc');
    const prefix = encodeURIComponent('GET /test-cache-route');
    const res = await cacheDELETE(loopback(`/api/vndb/cache?mode=prefix&prefix=${prefix}`, 'DELETE') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('prefix');
    expect(body.prefix).toBe('GET /test-cache-route');
    expect(body.removed).toBeGreaterThanOrEqual(1);
  });

  it('200 clearing everything in the default (all) mode', async () => {
    seedCacheRow();
    const res = await cacheDELETE(loopback('/api/vndb/cache', 'DELETE') as never);
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('all');
  });
});

describe('egs/[id]/vndb pin lifecycle', () => {
  it('400 on a malformed EGS id', async () => {
    const res = await egsVndbGET(loopback('/api/egs/abc/vndb') as never, {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid egs id');
  });

  it('GET 200 returns null when no pin exists', async () => {
    const res = await egsVndbGET(loopback(`/api/egs/${EGS_ID}/vndb`) as never, {
      params: Promise.resolve({ id: String(EGS_ID) }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ link: null });
  });

  it('accepts EGS-prefixed ids on read', async () => {
    const res = await egsVndbGET(loopback(`/api/egs/egs_${EGS_ID}/vndb`) as never, {
      params: Promise.resolve({ id: `egs_${EGS_ID}` }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ link: null });
  });

  it('POST rejects malformed EGS ids and VNDB ids', async () => {
    const invalidId = await egsVndbPOST(
      loopback('/api/egs/bad/vndb', 'POST', { vndb_id: VN_ID }) as never,
      { params: Promise.resolve({ id: 'bad' }) },
    );
    expect(invalidId.status).toBe(400);
    expect(await invalidId.json()).toEqual({ error: 'invalid egs id' });

    const invalidVn = await egsVndbPOST(
      loopback(`/api/egs/${EGS_ID}/vndb`, 'POST', { vndb_id: 'bad' }) as never,
      { params: Promise.resolve({ id: String(EGS_ID) }) },
    );
    expect(invalidVn.status).toBe(400);
    expect(await invalidVn.json()).toEqual({ error: 'invalid vndb_id' });
  });

  it('POST pins a VNDB id, GET reads it back, DELETE clears it', async () => {
    const pinned = await egsVndbPOST(
      loopback(`/api/egs/${EGS_ID}/vndb`, 'POST', { vndb_id: VN_ID }) as never,
      { params: Promise.resolve({ id: String(EGS_ID) }) },
    );
    expect(pinned.status).toBe(200);
    expect((await pinned.json()).link.vn_id).toBe(VN_ID);

    const read = await egsVndbGET(loopback(`/api/egs/${EGS_ID}/vndb`) as never, {
      params: Promise.resolve({ id: String(EGS_ID) }),
    });
    expect(read.status).toBe(200);
    expect((await read.json()).link.vn_id).toBe(VN_ID);

    const cleared = await egsVndbDELETE(loopback(`/api/egs/${EGS_ID}/vndb`, 'DELETE') as never, {
      params: Promise.resolve({ id: String(EGS_ID) }),
    });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ ok: true });
  });

  it('DELETE rejects malformed EGS ids', async () => {
    const res = await egsVndbDELETE(loopback('/api/egs/bad/vndb', 'DELETE') as never, {
      params: Promise.resolve({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid egs id' });
  });

  it('POST 200 records an explicit "no VNDB counterpart" pin on null', async () => {
    const res = await egsVndbPOST(
      loopback(`/api/egs/${EGS_ID}/vndb`, 'POST', { vndb_id: null }) as never,
      { params: Promise.resolve({ id: String(EGS_ID) }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.link.vn_id).toBeNull();
  });

  it('logs activity failures without failing link or unlink operations', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('activity failed');
    });

    const link = await egsVndbPOST(
      loopback(`/api/egs/${EGS_ID}/vndb`, 'POST', { vndb_id: VN_ID }) as never,
      { params: Promise.resolve({ id: String(EGS_ID) }) },
    );
    expect(link.status).toBe(200);
    const unlink = await egsVndbDELETE(loopback(`/api/egs/${EGS_ID}/vndb`, 'DELETE') as never, {
      params: Promise.resolve({ id: String(EGS_ID) }),
    });
    expect(unlink.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(`[egs-vndb:${EGS_ID}] activity log failed:`, 'activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('POST /api/proxy/test', () => {
  it('400 when the provider field is missing', async () => {
    const res = await proxyTestPOST(loopback('/api/proxy/test', 'POST', {}, '10.20.0.1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('provider required');
  });

  it('400 for a fixed provider with no proxy configured', async () => {
    const res = await proxyTestPOST(loopback('/api/proxy/test', 'POST', { provider: 'egs' }, '10.20.0.2'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not configured or disabled/);
  });

  it('400 for an unknown provider', async () => {
    const res = await proxyTestPOST(
      loopback('/api/proxy/test', 'POST', { provider: '__not_a_provider__' }, '10.20.0.3'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown provider');
  });
});

describe('POST /api/producer/[id]/refresh', () => {
  it('400 on a malformed producer id', async () => {
    const res = await producerRefreshPOST(loopback('/api/producer/v1/refresh', 'POST', {}) as never, {
      params: Promise.resolve({ id: 'v1' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid producer id');
  });

  it('200 with developer/publisher counts on success', async () => {
    fetchAssocMock.mockResolvedValue({
      name: 'Studio X',
      developerVns: [{ id: 'v1' }, { id: 'v2' }],
      publisherVns: [{ id: 'v3' }],
      totalUnique: 3,
      ownedUnique: 1,
      fromCache: false,
      upstreamFailed: false,
      stale: false,
    });
    const res = await producerRefreshPOST(
      loopback(`/api/producer/${PRODUCER_ID}/refresh`, 'POST', {}) as never,
      { params: Promise.resolve({ id: PRODUCER_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.developers).toBe(2);
    expect(body.publishers).toBe(1);
    expect(invalidateAssocMock).toHaveBeenCalledWith(PRODUCER_ID);
  });

  it('200 when activity logging fails after refreshing associations', async () => {
    fetchAssocMock.mockResolvedValue({
      name: 'Studio X',
      developerVns: [{ id: 'v1' }],
      publisherVns: [],
      totalUnique: 1,
      ownedUnique: 1,
      fromCache: false,
      upstreamFailed: false,
      stale: true,
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('activity failed');
    });

    const res = await producerRefreshPOST(
      loopback(`/api/producer/${PRODUCER_ID}/refresh`, 'POST', {}) as never,
      { params: Promise.resolve({ id: PRODUCER_ID }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, developers: 1, publishers: 0, owned: 1, stale: true });
    expect(consoleSpy).toHaveBeenCalledWith(`[producer:${PRODUCER_ID}] activity log failed:`, 'activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('502 when every upstream association call failed', async () => {
    fetchAssocMock.mockResolvedValue({
      name: null,
      developerVns: [],
      publisherVns: [],
      totalUnique: 0,
      ownedUnique: 0,
      fromCache: false,
      upstreamFailed: true,
      stale: true,
    });
    const res = await producerRefreshPOST(
      loopback(`/api/producer/${PRODUCER_ID}/refresh`, 'POST', {}) as never,
      { params: Promise.resolve({ id: PRODUCER_ID }) },
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('vndb_unavailable');
  });
});
