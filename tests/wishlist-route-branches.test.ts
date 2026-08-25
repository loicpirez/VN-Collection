import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWishlistMock, addWishlistMock, removeWishlistMock } = vi.hoisted(() => ({
  fetchWishlistMock: vi.fn(),
  addWishlistMock: vi.fn(),
  removeWishlistMock: vi.fn(),
}));

const { getEgsSummariesMock, isInCollectionManyMock } = vi.hoisted(() => ({
  getEgsSummariesMock: vi.fn(),
  isInCollectionManyMock: vi.fn(),
}));

const { recordActivityMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn(),
}));

const { invalidateWishlistCacheMock } = vi.hoisted(() => ({
  invalidateWishlistCacheMock: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  fetchAuthenticatedWishlist: fetchWishlistMock,
  addToVndbWishlist: addWishlistMock,
  removeFromVndbWishlist: removeWishlistMock,
}));

vi.mock('@/lib/db', () => ({
  getEgsSummariesForVns: getEgsSummariesMock,
  isInCollectionMany: isInCollectionManyMock,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: recordActivityMock,
}));

vi.mock('@/lib/vndb-wishlist-cache', () => ({
  invalidateVndbWishlistCache: invalidateWishlistCacheMock,
}));

import { GET as wishlistGET } from '@/app/api/wishlist/route';
import { DELETE as wishlistDELETE, POST as wishlistPOST } from '@/app/api/wishlist/[id]/route';

function req(path: string, method = 'GET'): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, { method });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('wishlist route branches', () => {
  beforeEach(() => {
    for (const mock of [
      fetchWishlistMock,
      addWishlistMock,
      removeWishlistMock,
      getEgsSummariesMock,
      isInCollectionManyMock,
      recordActivityMock,
      invalidateWishlistCacheMock,
    ]) {
      mock.mockReset();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('annotates authenticated wishlist rows with collection and EGS state', async () => {
    fetchWishlistMock.mockResolvedValue([
      { id: 'v90001', vn: { title: 'Wishlist One' } },
      { id: 'v90002', vn: { title: 'Wishlist Two' } },
    ]);
    isInCollectionManyMock.mockReturnValue(new Set(['v90002']));
    getEgsSummariesMock.mockReturnValue(new Map([
      ['v90001', { median: 82, playtime_median_minutes: 420 }],
    ]));

    const res = await wishlistGET(req('/api/wishlist'));
    const body = await res.json() as { items: Array<{ vn: { id: string }; in_collection: boolean; egs: unknown }> };

    expect(res.status).toBe(200);
    expect(isInCollectionManyMock).toHaveBeenCalledWith(['v90001', 'v90002']);
    expect(body.items).toEqual([
      { id: 'v90001', vn: { title: 'Wishlist One', id: 'v90001' }, in_collection: false, egs: { median: 82, playtime_median_minutes: 420 } },
      { id: 'v90002', vn: { title: 'Wishlist Two', id: 'v90002' }, in_collection: true, egs: null },
    ]);
  });

  it('returns a filtered server page while preserving the legacy response without page params', async () => {
    const vn = (id: string, title: string) => ({
      id,
      added: 100,
      voted: null,
      vote: null,
      started: null,
      finished: null,
      notes: null,
      labels: [{ id: 5, label: 'Wishlist' }],
      vn: {
        title,
        alttitle: null,
        released: '2020-01-01',
        rating: 70,
        votecount: 10,
        length_minutes: 600,
        languages: ['en'],
        platforms: ['win'],
        image: null,
        developers: [],
      },
    });
    fetchWishlistMock.mockResolvedValue([vn('v90001', 'Alpha'), vn('v90002', 'Beta')]);
    isInCollectionManyMock.mockReturnValue(new Set(['v90002']));
    getEgsSummariesMock.mockReturnValue(new Map());

    const response = await wishlistGET(req('/api/wishlist?page=1&pageSize=1&hideOwned=1&locale=en'));
    const body = await response.json();
    expect(body).toMatchObject({
      page: { page: 1, page_size: 1, total: 1, total_pages: 1, start: 1, end: 1, grouped: false },
      summary: { total: 2, owned: 1, todo: 1 },
      facets: { languages: ['en'], platforms: ['win'] },
      download_items: [{ id: 'v90001', title: 'Alpha' }],
    });
    expect(body.items).toHaveLength(1);
  });

  it('returns the needs-auth shape for wishlist reads without a VNDB token', async () => {
    fetchWishlistMock.mockResolvedValue({ needsAuth: true });
    const res = await wishlistGET(req('/api/wishlist'));
    expect(await res.json()).toEqual({ needsAuth: true, items: [] });
  });

  it('rejects non-loopback wishlist reads', async () => {
    const res = await wishlistGET(new NextRequest('http://93.184.216.34/api/wishlist'));
    expect(res.status).toBe(403);
  });

  it('uses the sanitized upstream response when wishlist reading throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchWishlistMock.mockRejectedValue(new Error('token leaked'));
    const res = await wishlistGET(req('/api/wishlist'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'vndb_unavailable', context: 'wishlist/read' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:wishlist] token leaked');
  });

  it('sanitizes non-Error wishlist failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchWishlistMock.mockRejectedValue('plain failure');

    const res = await wishlistGET(req('/api/wishlist'));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'vndb_unavailable', context: 'wishlist/read' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:wishlist] plain failure');
  });

  it('classifies wishlist rate-limit and malformed upstream failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchWishlistMock.mockRejectedValueOnce(new Error('VNDB POST /ulist 429: slow down'));
    let res = await wishlistGET(req('/api/wishlist'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'vndb_rate_limited', context: 'wishlist/read' });

    fetchWishlistMock.mockRejectedValueOnce(new Error('vndb-cache: invalid payload shape'));
    res = await wishlistGET(req('/api/wishlist'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'vndb_malformed_payload', context: 'wishlist/read' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:wishlist] VNDB POST /ulist 429: slow down');
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:wishlist] vndb-cache: invalid payload shape');
  });

  it('adds a VNDB wishlist label and records activity with a normalized VN id', async () => {
    addWishlistMock.mockResolvedValue({ ok: true });
    const res = await wishlistPOST(req('/api/wishlist/V90001', 'POST'), ctx('V90001'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(addWishlistMock).toHaveBeenCalledWith('v90001');
    expect(invalidateWishlistCacheMock).toHaveBeenCalledTimes(1);
    expect(recordActivityMock).toHaveBeenCalledWith({
      kind: 'wishlist.add',
      entity: 'vn',
      entityId: 'v90001',
      label: 'Added VNDB wishlist label',
    });
  });

  it('rejects invalid and unauthenticated wishlist add requests', async () => {
    let res = await wishlistPOST(req('/api/wishlist/bad', 'POST'), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });

    addWishlistMock.mockResolvedValue({ needsAuth: true });
    res = await wishlistPOST(req('/api/wishlist/v90001', 'POST'), ctx('v90001'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'VNDB token required', code: 'vndb_token_required' });
  });

  it('translates VNDB listwrite failures and sanitizes generic add failures', async () => {
    addWishlistMock.mockRejectedValueOnce(new Error('VNDB PATCH /ulist/v90001 -> 401: Unauthorized'));
    let res = await wishlistPOST(req('/api/wishlist/v90001', 'POST'), ctx('v90001'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: 'VNDB token does not have listwrite permission. Regenerate it on vndb.org/u/tokens with listwrite enabled.',
      code: 'vndb_listwrite_required',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    addWishlistMock.mockRejectedValueOnce(new Error('raw add failure'));
    res = await wishlistPOST(req('/api/wishlist/v90001', 'POST'), ctx('v90001'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'wishlist/v90001' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:wishlist/v90001] raw add failure');
  });

  it('removes a VNDB wishlist label, handles auth-needed delete, and rejects invalid delete ids', async () => {
    removeWishlistMock.mockResolvedValueOnce({ ok: true });
    let res = await wishlistDELETE(req('/api/wishlist/V90001', 'DELETE'), ctx('V90001'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(removeWishlistMock).toHaveBeenCalledWith('v90001');
    expect(recordActivityMock).toHaveBeenCalledWith({
      kind: 'wishlist.remove',
      entity: 'vn',
      entityId: 'v90001',
      label: 'Removed VNDB wishlist label',
    });
    expect(invalidateWishlistCacheMock).toHaveBeenCalledTimes(1);

    removeWishlistMock.mockResolvedValueOnce({ needsAuth: true });
    res = await wishlistDELETE(req('/api/wishlist/v90001', 'DELETE'), ctx('v90001'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'VNDB token required', code: 'vndb_token_required' });

    res = await wishlistDELETE(req('/api/wishlist/egs_1', 'DELETE'), ctx('egs_1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
    expect(invalidateWishlistCacheMock).toHaveBeenCalledTimes(1);
  });

  it('translates VNDB listwrite failures and sanitizes generic delete failures', async () => {
    removeWishlistMock.mockRejectedValueOnce(new Error('VNDB PATCH /ulist/v90001 -> 401: Unauthorized'));
    let res = await wishlistDELETE(req('/api/wishlist/v90001', 'DELETE'), ctx('v90001'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: 'VNDB token does not have listwrite permission. Regenerate it on vndb.org/u/tokens with listwrite enabled.',
      code: 'vndb_listwrite_required',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    removeWishlistMock.mockRejectedValueOnce(new Error('raw delete failure'));
    res = await wishlistDELETE(req('/api/wishlist/v90001', 'DELETE'), ctx('v90001'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'wishlist/v90001' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:wishlist/v90001] raw delete failure');
  });
});
