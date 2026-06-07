/**
 * Route-handler coverage for every endpoint under src/app/api/alicenet/.
 * Each route is exercised for: a localhost-gated success, an auth-denied
 * (non-loopback host) 403, and an invalid-input / not-found branch — one
 * exact status plus a body assertion per case. Pipeline + upstream modules
 * are mocked; the per-worker SQLite store is seeded via real db helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  refreshAliceNetStockMock,
  matchNextAliceNetItemsMock,
  matchVndbFromEgsForAliceNetMock,
  retryVndbForAliceNetAggressiveMock,
  searchEgsForAliceNetNoVndbMock,
  resetAliceNetAutoMatchesMock,
} = vi.hoisted(() => ({
  refreshAliceNetStockMock: vi.fn(),
  matchNextAliceNetItemsMock: vi.fn(),
  matchVndbFromEgsForAliceNetMock: vi.fn(),
  retryVndbForAliceNetAggressiveMock: vi.fn(),
  searchEgsForAliceNetNoVndbMock: vi.fn(),
  resetAliceNetAutoMatchesMock: vi.fn(),
}));

vi.mock('@/lib/alicenet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/alicenet')>();
  return {
    ...actual,
    refreshAliceNetStock: refreshAliceNetStockMock,
    matchNextAliceNetItems: matchNextAliceNetItemsMock,
    matchVndbFromEgsForAliceNet: matchVndbFromEgsForAliceNetMock,
    retryVndbForAliceNetAggressive: retryVndbForAliceNetAggressiveMock,
    searchEgsForAliceNetNoVndb: searchEgsForAliceNetNoVndbMock,
    resetAliceNetAutoMatches: resetAliceNetAutoMatchesMock,
  };
});

const { fetchAuthenticatedWishlistMock, getVnMock } = vi.hoisted(() => ({
  fetchAuthenticatedWishlistMock: vi.fn(),
  getVnMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, fetchAuthenticatedWishlist: fetchAuthenticatedWishlistMock, getVn: getVnMock };
});

const { resolveEgsForVnMock } = vi.hoisted(() => ({ resolveEgsForVnMock: vi.fn() }));

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, resolveEgsForVn: resolveEgsForVnMock };
});

import { GET as listGET } from '@/app/api/alicenet/route';
import { POST as fetchPOST } from '@/app/api/alicenet/fetch/route';
import { POST as matchNextPOST } from '@/app/api/alicenet/match-next/route';
import { POST as matchVndbFromEgsPOST } from '@/app/api/alicenet/match-vndb-from-egs/route';
import { POST as retryAggressivePOST } from '@/app/api/alicenet/retry-vndb-aggressive/route';
import { POST as searchEgsPOST } from '@/app/api/alicenet/search-egs-no-vndb/route';
import { POST as resolveEgsPOST } from '@/app/api/alicenet/resolve-egs/route';
import { POST as downloadVndbPOST } from '@/app/api/alicenet/download-vndb/route';
import { POST as resetPOST } from '@/app/api/alicenet/reset-matches/route';
import { POST as linkPOST, DELETE as linkDELETE } from '@/app/api/alicenet/[code]/link/route';

import { db, setAliceNetVnLink, setAppSetting, upsertAliceNetStock, upsertVn } from '@/lib/db';

type Body = Record<string, unknown> | undefined;

function req(method: string, origin: string, body?: Body): Request {
  return new Request(`${origin}/api/alicenet`, {
    method,
    headers: { 'Content-Type': 'application/json', host: new URL(origin).host },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function localReq(method: string, body?: Body): Request {
  return req(method, 'http://127.0.0.1', body);
}

function remoteReq(method: string, body?: Body): Request {
  return req(method, 'http://evil.example', body);
}

function seedRow(code: string, title = 'Synthetic Stock Row'): void {
  upsertAliceNetStock([
    { code, title, jan: null, release_date: null, list_price: null, sale_price: null },
  ]);
}

function resetTable(): void {
  db.exec(
    "DELETE FROM alicenet_stock; DELETE FROM vn; DELETE FROM collection; DELETE FROM user_activity; DELETE FROM app_setting WHERE key = 'alicenet_last_fetch';",
  );
}

beforeEach(() => {
  resetTable();
  delete process.env.VN_ADMIN_TOKEN;
  for (const m of [
    refreshAliceNetStockMock,
    matchNextAliceNetItemsMock,
    matchVndbFromEgsForAliceNetMock,
    retryVndbForAliceNetAggressiveMock,
    searchEgsForAliceNetNoVndbMock,
    resetAliceNetAutoMatchesMock,
    fetchAuthenticatedWishlistMock,
    getVnMock,
    resolveEgsForVnMock,
  ]) {
    m.mockReset();
  }
  fetchAuthenticatedWishlistMock.mockResolvedValue({ needsAuth: true });
});

afterEach(() => {
  resetTable();
});

describe('GET /api/alicenet', () => {
  it('200 returns the first-page snapshot with stats, pending, and paging', async () => {
    seedRow('100-000000-001');
    const res = await listGET(localReq('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.stats.total).toBe(1);
    expect(body.pending).toMatchObject({ vndb_pending: expect.any(Number), egs_pending: expect.any(Number) });
    expect(body.page).toMatchObject({ offset: 0, limit: 200, total: 1, has_more: false });
  });

  it('200 returns a follow-up page (no stats block) when offset > 0', async () => {
    seedRow('100-000000-002');
    const res = await listGET(new Request('http://127.0.0.1/api/alicenet?offset=1&limit=5', {
      method: 'GET',
      headers: { host: '127.0.0.1' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toBeUndefined();
    expect(body.page.offset).toBe(1);
  });

  it('200 annotates in_wishlist when the live wishlist contains the matched VN', async () => {
    seedRow('100-000000-003');
    setAliceNetVnLink('100-000000-003', 'v60001', 'auto');
    setAppSetting('alicenet_last_fetch', '1700000000000');
    fetchAuthenticatedWishlistMock.mockResolvedValue([{ id: 'v60001' }]);
    const res = await listGET(localReq('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.in_wishlist).toBe(1);
    expect(body.last_fetch).toBe(1700000000000);
    expect(body.items.find((i: { code: string }) => i.code === '100-000000-003')?.in_wishlist).toBe(1);
  });

  it('200 keeps the wishlist count at zero when matched rows are absent from the live wishlist', async () => {
    seedRow('100-000000-005');
    setAliceNetVnLink('100-000000-005', 'v60005', 'auto');
    fetchAuthenticatedWishlistMock.mockResolvedValue([{ id: 'v69999' }]);
    const res = await listGET(localReq('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.in_wishlist).toBe(0);
    expect(body.items.find((i: { code: string }) => i.code === '100-000000-005')?.in_wishlist).toBe(0);
  });

  it('200 falls back to no wishlist annotations when the wishlist request fails', async () => {
    seedRow('100-000000-004');
    setAliceNetVnLink('100-000000-004', 'v60002', 'auto');
    fetchAuthenticatedWishlistMock.mockRejectedValue(new Error('wishlist unavailable'));
    const res = await listGET(new Request('http://127.0.0.1/api/alicenet?offset=bad&limit=2000', {
      method: 'GET',
      headers: { host: '127.0.0.1' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page.limit).toBe(1000);
    expect(body.page.offset).toBe(0);
    expect(body.stats.in_wishlist).toBe(0);
  });

  it('403 for a non-loopback host', async () => {
    const res = await listGET(remoteReq('GET'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/restricted to localhost/);
  });
});

describe('POST /api/alicenet/fetch', () => {
  it('200 returns the sync counters and stores last-fetch', async () => {
    refreshAliceNetStockMock.mockResolvedValue({ count: 3, added: 1, updated: 1, removed: 1, fetched_at: 1234 });
    const res = await fetchPOST(localReq('POST', {}) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 3, added: 1, fetched_at: 1234 });
  });

  it('502 with a sanitized actionable error when the refresh throws', async () => {
    refreshAliceNetStockMock.mockRejectedValue(new Error('ETIMEDOUT at /Users/secret/path?token=abc123'));
    const res = await fetchPOST(localReq('POST', {}) as never);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: 'AliceNet request timed out. Check the network or proxy, then retry.' });
  });

  it('403 for a non-loopback host', async () => {
    const res = await fetchPOST(remoteReq('POST', {}) as never);
    expect(res.status).toBe(403);
    expect(refreshAliceNetStockMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/match-next', () => {
  it('200 returns the processed/remaining counters', async () => {
    matchNextAliceNetItemsMock.mockResolvedValue({ processed: 5, matched: 2, remaining: 7 });
    const res = await matchNextPOST(localReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 5, matched: 2, remaining: 7 });
  });

  it('200 forwards retry_none defaults and run-start timestamps', async () => {
    matchNextAliceNetItemsMock.mockResolvedValue({ processed: 1, matched: 0, remaining: 0 });
    const res = await matchNextPOST(localReq('POST', { run_started_at: 1700000000000 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 1, matched: 0, remaining: 0 });
    expect(matchNextAliceNetItemsMock).toHaveBeenCalledWith(5, false, 1700000000000);
  });

  it('400 when batch exceeds the route maximum', async () => {
    const res = await matchNextPOST(localReq('POST', { batch: 21 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('batch must be between 1 and 20');
    expect(matchNextAliceNetItemsMock).not.toHaveBeenCalled();
  });

  it('400 when retry_none is not a boolean', async () => {
    const res = await matchNextPOST(localReq('POST', { retry_none: 'yes' }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('retry_none must be boolean');
  });

  it('400 when run_started_at is below the accepted range', async () => {
    const res = await matchNextPOST(localReq('POST', { run_started_at: 0 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('run_started_at must be between 1 and 9007199254740991');
  });

  it('403 for a non-loopback host', async () => {
    const res = await matchNextPOST(remoteReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(403);
    expect(matchNextAliceNetItemsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/match-vndb-from-egs', () => {
  it('200 returns the processed/remaining counters', async () => {
    matchVndbFromEgsForAliceNetMock.mockResolvedValue({ processed: 4, matched: 1, remaining: 0 });
    const res = await matchVndbFromEgsPOST(localReq('POST', { batch: 10 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 4, matched: 1, remaining: 0 });
  });

  it('400 when run_started_at is fractional', async () => {
    const res = await matchVndbFromEgsPOST(localReq('POST', { run_started_at: 1.5 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('run_started_at must be an integer');
  });

  it('400 when batch exceeds the VNDB-from-EGS route maximum', async () => {
    const res = await matchVndbFromEgsPOST(localReq('POST', { batch: 51 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('batch must be between 1 and 50');
  });

  it('403 for a non-loopback host', async () => {
    const res = await matchVndbFromEgsPOST(remoteReq('POST', {}) as never);
    expect(res.status).toBe(403);
    expect(matchVndbFromEgsForAliceNetMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/retry-vndb-aggressive', () => {
  it('200 returns the one-shot counters', async () => {
    retryVndbForAliceNetAggressiveMock.mockResolvedValue({ processed: 4, matched: 0, remaining: 0 });
    const res = await retryAggressivePOST(localReq('POST', { run_started_at: 1700000000001 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 4, matched: 0, remaining: 0 });
    expect(retryVndbForAliceNetAggressiveMock).toHaveBeenCalledWith(4, 1700000000001);
  });

  it('400 when batch exceeds the route maximum', async () => {
    const res = await retryAggressivePOST(localReq('POST', { batch: 21 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('batch must be between 1 and 20');
  });

  it('400 when run_started_at is below the accepted range', async () => {
    const res = await retryAggressivePOST(localReq('POST', { run_started_at: 0 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('run_started_at must be between 1 and 9007199254740991');
  });

  it('403 for a non-loopback host', async () => {
    const res = await retryAggressivePOST(remoteReq('POST', {}) as never);
    expect(res.status).toBe(403);
    expect(retryVndbForAliceNetAggressiveMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/search-egs-no-vndb', () => {
  it('200 returns the counters', async () => {
    searchEgsForAliceNetNoVndbMock.mockResolvedValue({ processed: 10, matched: 3, remaining: 2 });
    const res = await searchEgsPOST(localReq('POST', { batch: 10, aggressive: true }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 10, matched: 3, remaining: 2 });
    expect(searchEgsForAliceNetNoVndbMock).toHaveBeenCalledWith(10, true, undefined);
  });

  it('400 when aggressive is not a boolean', async () => {
    const res = await searchEgsPOST(localReq('POST', { aggressive: 1 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('aggressive must be boolean');
  });

  it('400 when search batch exceeds the route maximum', async () => {
    const res = await searchEgsPOST(localReq('POST', { batch: 51 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('batch must be between 1 and 50');
  });

  it('400 when search run_started_at is not positive', async () => {
    const res = await searchEgsPOST(localReq('POST', { run_started_at: 0 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('run_started_at must be between 1 and 9007199254740991');
  });

  it('403 for a non-loopback host', async () => {
    const res = await searchEgsPOST(remoteReq('POST', {}) as never);
    expect(res.status).toBe(403);
    expect(searchEgsForAliceNetNoVndbMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/download-vndb', () => {
  it('200 downloads pending VNs and returns the remaining count', async () => {
    seedRow('200-000000-001');
    setAliceNetVnLink('200-000000-001', 'v60010', 'auto');
    getVnMock.mockResolvedValue({ id: 'v60010', title: 'Downloaded VN' });
    const res = await downloadVndbPOST(localReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(getVnMock).toHaveBeenCalledWith('v60010');
  });

  it('502 with a sanitized error when VNDB returns no data', async () => {
    seedRow('200-000000-002');
    setAliceNetVnLink('200-000000-002', 'v60011', 'auto');
    getVnMock.mockResolvedValue(null);
    const res = await downloadVndbPOST(localReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'VNDB returned no data for v60011', processed: 0 });
  });

  it('400 when batch exceeds the route maximum', async () => {
    const res = await downloadVndbPOST(localReq('POST', { batch: 21 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('batch must be between 1 and 20');
  });

  it('403 for a non-loopback host', async () => {
    const res = await downloadVndbPOST(remoteReq('POST', {}) as never);
    expect(res.status).toBe(403);
    expect(getVnMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/resolve-egs', () => {
  it('200 resolves EGS links for matched VNs and returns the remaining count', async () => {
    seedRow('300-000000-001');
    setAliceNetVnLink('300-000000-001', 'v60020', 'auto');
    upsertVn({ id: 'v60020', title: 'Local VN' });
    resolveEgsForVnMock.mockResolvedValue({
      game: { id: 9500001, gamename: 'EGS Match', brand_name: 'Brand', sellday: null, image_url: null, raw: {} },
    });
    const res = await resolveEgsPOST(localReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(resolveEgsForVnMock).toHaveBeenCalledWith('v60020', { allowSearch: true });
  });

  it('200 marks the EGS link as searched when no game is resolved', async () => {
    seedRow('300-000000-003');
    setAliceNetVnLink('300-000000-003', 'v60022', 'auto');
    upsertVn({ id: 'v60022', title: 'Local VN 3' });
    resolveEgsForVnMock.mockResolvedValue({ game: null });
    const res = await resolveEgsPOST(localReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: 1 });
    const stored = db.prepare('SELECT egs_id, egs_match_source FROM alicenet_stock WHERE code = ?').get('300-000000-003');
    expect(stored).toMatchObject({ egs_id: null, egs_match_source: 'auto' });
  });

  it('502 with a sanitized error when the resolver throws', async () => {
    seedRow('300-000000-002');
    setAliceNetVnLink('300-000000-002', 'v60021', 'auto');
    upsertVn({ id: 'v60021', title: 'Local VN 2' });
    resolveEgsForVnMock.mockRejectedValue(new Error('EGS SQL form 500 at /Users/secret'));
    const res = await resolveEgsPOST(localReq('POST', { batch: 5 }) as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'EGS SQL form 500 at [local path]', processed: 0 });
  });

  it('400 when batch exceeds the route maximum', async () => {
    const res = await resolveEgsPOST(localReq('POST', { batch: 21 }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('batch must be between 1 and 20');
  });

  it('403 for a non-loopback host', async () => {
    const res = await resolveEgsPOST(remoteReq('POST', {}) as never);
    expect(res.status).toBe(403);
    expect(resolveEgsForVnMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/reset-matches', () => {
  it('200 returns the cleared count', async () => {
    resetAliceNetAutoMatchesMock.mockReturnValue(4);
    const res = await resetPOST(localReq('POST') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: 4 });
  });

  it('403 for a non-loopback host', async () => {
    const res = await resetPOST(remoteReq('POST') as never);
    expect(res.status).toBe(403);
    expect(resetAliceNetAutoMatchesMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/alicenet/[code]/link', () => {
  it('200 sets a manual VN link and records activity', async () => {
    seedRow('400-000000-001', 'Manual Link Target');
    const res = await linkPOST(localReq('POST', { vn_id: 'V60030' }) as never, {
      params: Promise.resolve({ code: '400-000000-001' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const stored = db.prepare('SELECT vn_id, vn_match_source FROM alicenet_stock WHERE code = ?').get('400-000000-001');
    expect(stored).toMatchObject({ vn_id: 'v60030', vn_match_source: 'manual' });
  });

  it('400 on a malformed alicenet code', async () => {
    const res = await linkPOST(localReq('POST', { vn_id: 'v60030' }) as never, {
      params: Promise.resolve({ code: 'not-a-code' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid alicenet code');
  });

  it('400 when vn_id is neither a VNDB id nor null', async () => {
    const res = await linkPOST(localReq('POST', { vn_id: 'p123' }) as never, {
      params: Promise.resolve({ code: '400-000000-002' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('vn_id must be a valid VNDB VN id or null');
  });

  it('404 when the code is well formed but unknown', async () => {
    const res = await linkPOST(localReq('POST', { vn_id: 'v60031' }) as never, {
      params: Promise.resolve({ code: '400-000000-999' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('200 clears a manual VN link when vn_id is null', async () => {
    seedRow('400-000000-003', 'Manual Null Target');
    setAliceNetVnLink('400-000000-003', 'v60033', 'manual');
    const res = await linkPOST(localReq('POST', { vn_id: null }) as never, {
      params: Promise.resolve({ code: '400-000000-003' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const stored = db.prepare('SELECT vn_id, vn_match_source FROM alicenet_stock WHERE code = ?').get('400-000000-003');
    expect(stored).toMatchObject({ vn_id: null, vn_match_source: 'none' });
  });

  it('403 for a non-loopback host', async () => {
    const res = await linkPOST(remoteReq('POST', { vn_id: 'v60030' }) as never, {
      params: Promise.resolve({ code: '400-000000-001' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/alicenet/[code]/link', () => {
  it('200 clears an existing manual link', async () => {
    seedRow('500-000000-001');
    setAliceNetVnLink('500-000000-001', 'v60040', 'manual');
    const res = await linkDELETE(localReq('DELETE') as never, {
      params: Promise.resolve({ code: '500-000000-001' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const stored = db.prepare('SELECT vn_id FROM alicenet_stock WHERE code = ?').get('500-000000-001') as { vn_id: string | null };
    expect(stored.vn_id).toBeNull();
  });

  it('400 on a malformed alicenet code', async () => {
    const res = await linkDELETE(localReq('DELETE') as never, {
      params: Promise.resolve({ code: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid alicenet code');
  });

  it('403 for a non-loopback host', async () => {
    const res = await linkDELETE(remoteReq('DELETE') as never, {
      params: Promise.resolve({ code: '500-000000-001' }),
    });
    expect(res.status).toBe(403);
  });
});
