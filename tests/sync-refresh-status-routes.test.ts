/**
 * Success / meaningful-branch coverage for the fan-out and status routes
 * whose happy paths were previously untested (existing suites only cover the
 * auth-403 branch): download-status (GET), egs/sync (GET/POST),
 * vndb/pull-statuses (POST ok/needsAuth/failure), refresh/global (POST).
 *
 * Every upstream module (`@/lib/egs-sync`, `@/lib/vndb-sync`, `@/lib/vndb`,
 * `@/lib/erogamescape`, `@/lib/top-ranked`, `@/lib/upcoming`) is mocked at
 * the function level so the fan-out completes without any network or token.
 * The cache-bust SQL in refresh/global runs against the empty per-worker
 * SQLite. Authorized requests use host 127.0.0.1 (the auth gate requires
 * loopback). Each case asserts exactly one HTTP status plus a body assertion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as activityModule from '@/lib/activity';
import { addToCollection, db } from '@/lib/db';

const {
  computeEgsSuggestionsMock,
  applyEgsSuggestionsMock,
  pullStatusesMock,
  getGlobalStatsMock,
  getAuthInfoMock,
  getSchemaMock,
  searchTagsMock,
  searchTraitsMock,
  fetchEgsAnticipatedMock,
  fetchEgsTopRankedMock,
  fetchVndbTopRankedMock,
  fetchAllUpcomingMock,
  fetchUpcomingForCollectionMock,
} = vi.hoisted(() => ({
  computeEgsSuggestionsMock: vi.fn(),
  applyEgsSuggestionsMock: vi.fn(),
  pullStatusesMock: vi.fn(),
  getGlobalStatsMock: vi.fn(async () => ({ vn: 1 })),
  getAuthInfoMock: vi.fn(async () => null),
  getSchemaMock: vi.fn(async () => ({})),
  searchTagsMock: vi.fn(async () => []),
  searchTraitsMock: vi.fn(async () => []),
  fetchEgsAnticipatedMock: vi.fn(async () => []),
  fetchEgsTopRankedMock: vi.fn(async () => []),
  fetchVndbTopRankedMock: vi.fn(async () => []),
  fetchAllUpcomingMock: vi.fn(async () => []),
  fetchUpcomingForCollectionMock: vi.fn(async () => []),
}));

const {
  acquireRefreshLeaseMock,
  refreshLeaseRenewMock,
  refreshLeaseReleaseMock,
} = vi.hoisted(() => ({
  acquireRefreshLeaseMock: vi.fn(),
  refreshLeaseRenewMock: vi.fn(),
  refreshLeaseReleaseMock: vi.fn(),
}));

vi.mock('@/lib/background-job-lease', () => ({
  acquireBackgroundJobLease: acquireRefreshLeaseMock,
}));

vi.mock('@/lib/egs-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/egs-sync')>();
  return { ...actual, computeEgsSuggestions: computeEgsSuggestionsMock, applyEgsSuggestions: applyEgsSuggestionsMock };
});

vi.mock('@/lib/vndb-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-sync')>();
  return { ...actual, pullStatusesFromVndb: pullStatusesMock };
});

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return {
    ...actual,
    getGlobalStats: getGlobalStatsMock,
    getAuthInfo: getAuthInfoMock,
    getSchema: getSchemaMock,
    searchTags: searchTagsMock,
    searchTraits: searchTraitsMock,
  };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, fetchEgsAnticipated: fetchEgsAnticipatedMock, fetchEgsTopRanked: fetchEgsTopRankedMock };
});

vi.mock('@/lib/top-ranked', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/top-ranked')>();
  return { ...actual, fetchVndbTopRanked: fetchVndbTopRankedMock };
});

vi.mock('@/lib/upcoming', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/upcoming')>();
  return {
    ...actual,
    fetchAllUpcomingFromVndb: fetchAllUpcomingMock,
    fetchUpcomingForCollection: fetchUpcomingForCollectionMock,
  };
});

const { GET: downloadStatusGET } = await import('@/app/api/download-status/route');
const { GET: egsSyncGET, POST: egsSyncPOST } = await import('@/app/api/egs/sync/route');
const { POST: pullStatusesPOST } = await import('@/app/api/vndb/pull-statuses/route');
const { POST: refreshGlobalPOST } = await import('@/app/api/refresh/global/route');

function loopback(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { host: '127.0.0.1', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  refreshLeaseRenewMock.mockReset().mockResolvedValue(undefined);
  refreshLeaseReleaseMock.mockReset().mockResolvedValue(true);
  acquireRefreshLeaseMock.mockReset().mockResolvedValue({
    name: 'global-refresh',
    renew: refreshLeaseRenewMock,
    release: refreshLeaseReleaseMock,
  });
  computeEgsSuggestionsMock.mockReset();
  applyEgsSuggestionsMock.mockReset();
  pullStatusesMock.mockReset();
  getGlobalStatsMock.mockReset();
  getGlobalStatsMock.mockResolvedValue({ vn: 1 });
  getAuthInfoMock.mockReset();
  getAuthInfoMock.mockResolvedValue(null);
  getSchemaMock.mockReset();
  getSchemaMock.mockResolvedValue({});
  searchTagsMock.mockReset();
  searchTagsMock.mockResolvedValue([]);
  searchTraitsMock.mockReset();
  searchTraitsMock.mockResolvedValue([]);
  fetchEgsAnticipatedMock.mockReset();
  fetchEgsAnticipatedMock.mockResolvedValue([]);
  fetchEgsTopRankedMock.mockReset();
  fetchEgsTopRankedMock.mockResolvedValue([]);
  fetchVndbTopRankedMock.mockReset();
  fetchVndbTopRankedMock.mockResolvedValue([]);
  fetchAllUpcomingMock.mockReset();
  fetchAllUpcomingMock.mockResolvedValue([]);
  fetchUpcomingForCollectionMock.mockReset();
  fetchUpcomingForCollectionMock.mockResolvedValue([]);
  db.prepare("DELETE FROM collection WHERE vn_id IN ('v90301', 'vbad')").run();
  db.prepare("DELETE FROM vn WHERE id IN ('v90301', 'vbad')").run();
});

describe('GET /api/download-status', () => {
  it('200 with throttle and jobs blocks from loopback', async () => {
    const res = await downloadStatusGET(loopback('/api/download-status'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.throttle).toBeDefined();
    expect(Array.isArray(body.jobs)).toBe(true);
  });
});

describe('GET /api/egs/sync', () => {
  it('200 with the computed suggestions', async () => {
    computeEgsSuggestionsMock.mockResolvedValue({ needsConfig: false, suggestions: [{ vn_id: 'v90201' }] });
    const res = await egsSyncGET(loopback('/api/egs/sync'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.suggestions).toHaveLength(1);
  });
});

describe('POST /api/egs/sync', () => {
  it('400 when vn_ids is missing or exceeds the route limit', async () => {
    const missing = await egsSyncPOST(loopback('/api/egs/sync', 'POST', {}));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'vn_ids must be an array' });

    const oversized = await egsSyncPOST(loopback('/api/egs/sync', 'POST', {
      vn_ids: Array.from({ length: 1001 }, (_, index) => `v${index + 1}`),
    }));
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({ error: 'vn_ids exceeds limit of 1000' });
  });

  it('200 with applied:0 for an empty pick list (no apply call)', async () => {
    const res = await egsSyncPOST(loopback('/api/egs/sync', 'POST', { vn_ids: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 0 });
    expect(applyEgsSuggestionsMock).not.toHaveBeenCalled();
  });

  it('200 applying the confirmed picks', async () => {
    applyEgsSuggestionsMock.mockResolvedValue({ applied: 1 });
    const res = await egsSyncPOST(loopback('/api/egs/sync', 'POST', { vn_ids: ['v90201'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.applied).toBe(1);
    expect(applyEgsSuggestionsMock).toHaveBeenCalledWith(['v90201']);
  });

  it('deduplicates picks and logs activity failures without failing the apply response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('activity failed');
    });
    applyEgsSuggestionsMock.mockResolvedValue({ applied: 1 });

    const res = await egsSyncPOST(loopback('/api/egs/sync', 'POST', { vn_ids: ['V90201', 'v90201'] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, applied: 1 });
    expect(applyEgsSuggestionsMock).toHaveBeenCalledWith(['v90201']);
    expect(consoleSpy).toHaveBeenCalledWith('[egs:sync] activity log failed:', 'activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('POST /api/vndb/pull-statuses', () => {
  it('200 on a successful pull', async () => {
    pullStatusesMock.mockResolvedValue({ ok: true, updated: 3 });
    const res = await pullStatusesPOST(loopback('/api/vndb/pull-statuses', 'POST', {}) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(3);
  });

  it('401 when the pull needs VNDB authentication', async () => {
    pullStatusesMock.mockResolvedValue({ ok: false, needsAuth: true });
    const res = await pullStatusesPOST(loopback('/api/vndb/pull-statuses', 'POST', {}) as never);
    expect(res.status).toBe(401);
    expect((await res.json()).needsAuth).toBe(true);
  });

  it('500 when the pull fails for a non-auth reason', async () => {
    pullStatusesMock.mockResolvedValue({ ok: false, needsAuth: false });
    const res = await pullStatusesPOST(loopback('/api/vndb/pull-statuses', 'POST', {}) as never);
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});

describe('POST /api/refresh/global', () => {
  it('rejects an unavailable or occupied distributed refresh lease', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    acquireRefreshLeaseMock.mockRejectedValueOnce(new Error('database offline'));
    const unavailable = await refreshGlobalPOST(loopback('/api/refresh/global', 'POST', {}));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: 'global refresh unavailable', code: 'run_unavailable' });

    acquireRefreshLeaseMock.mockResolvedValueOnce(null);
    const occupied = await refreshGlobalPOST(loopback('/api/refresh/global', 'POST', {}));
    expect(occupied.status).toBe(429);
    expect(await occupied.json()).toEqual({ error: 'a global refresh is already running', code: 'queue_full' });
    consoleSpy.mockRestore();
  });

  it('fails closed if lease ownership is lost before a refresh task', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    refreshLeaseRenewMock.mockRejectedValueOnce(new Error('background job lease lost'));
    const response = await refreshGlobalPOST(loopback('/api/refresh/global', 'POST', {}));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'global refresh unavailable', code: 'run_unavailable' });
    expect(refreshLeaseReleaseMock).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('contains a lease release failure after a completed refresh', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    refreshLeaseReleaseMock.mockRejectedValueOnce(new Error('release unavailable'));
    const response = await refreshGlobalPOST(loopback('/api/refresh/global', 'POST', {}));
    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('[refresh/global] lease release failed:', 'release unavailable');
    consoleSpy.mockRestore();
  });

  it('200 completing every fan-out task with all upstreams stubbed', async () => {
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('v90301', 'Refresh VN', Date.now());
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('vbad', 'Invalid Refresh VN', Date.now());
    addToCollection('v90301', {});
    addToCollection('vbad', {});
    const res = await refreshGlobalPOST(loopback('/api/refresh/global', 'POST', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.done).toBe(body.total);
    expect(getGlobalStatsMock).toHaveBeenCalled();
  });

  it('200 with failed count when a fan-out task throws and authinfo fallback swallows VNDB auth failures', async () => {
    getGlobalStatsMock.mockRejectedValue(new Error('global stats failed'));
    getAuthInfoMock.mockRejectedValue(new Error('auth info failed'));

    const res = await refreshGlobalPOST(loopback('/api/refresh/global', 'POST', {}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.failed).toBe(1);
    expect(body.done).toBe(body.total - 1);
    expect(getAuthInfoMock).toHaveBeenCalled();
  });
});
