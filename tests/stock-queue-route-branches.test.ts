import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listQueueMock, titlesForMock } = vi.hoisted(() => ({
  listQueueMock: vi.fn(),
  titlesForMock: vi.fn(),
}));

const { fetchWishlistMock } = vi.hoisted(() => ({
  fetchWishlistMock: vi.fn(),
}));

vi.mock('@/lib/db/repositories/stock-queue', () => ({
  getStockQueueRepository: () => ({
    list: listQueueMock,
    titlesFor: titlesForMock,
  }),
}));

vi.mock('@/lib/vndb', () => ({
  fetchAuthenticatedWishlist: fetchWishlistMock,
}));

import { GET } from '@/app/api/stock/queue/route';

function req(path: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`);
}

function externalReq(path: string): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`);
}

function installDb(rowsByScope: Record<string, string[]>): void {
  listQueueMock.mockImplementation(async (scope: string, limit: number, offset: number) => {
    const ids = rowsByScope[scope] ?? [];
    return {
      total: ids.length,
      entries: ids.slice(offset, offset + limit).map((vn_id) => ({ vn_id, title: `Title ${vn_id}` })),
    };
  });
  titlesForMock.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, `Title ${id}`])));
}

describe('GET /api/stock/queue branches', () => {
  afterEach(() => {
    listQueueMock.mockReset();
    titlesForMock.mockReset();
    fetchWishlistMock.mockReset();
  });

  it('rejects invalid pagination', async () => {
    let res = await GET(req('/api/stock/queue?page=0'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid pagination' });

    res = await GET(req('/api/stock/queue?page_size=501'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid pagination' });
  });

  it('rejects non-loopback queue reads', async () => {
    const res = await GET(externalReq('/api/stock/queue'));
    expect(res.status).toBe(403);
  });

  it('returns paged collection entries with titles and next page metadata', async () => {
    installDb({ collection: ['v90001', 'v90002', 'v90003'] });
    const res = await GET(req('/api/stock/queue?scope=collection&page=1&page_size=2'));
    expect(await res.json()).toEqual({
      scope: 'collection',
      ids: ['v90001', 'v90002'],
      entries: [
        { vn_id: 'v90001', title: 'Title v90001' },
        { vn_id: 'v90002', title: 'Title v90002' },
      ],
      page: 1,
      page_size: 2,
      total: 3,
      next_page: 2,
    });
  });

  it('returns empty entries for an empty collection queue page', async () => {
    installDb({ collection: [] });
    const res = await GET(req('/api/stock/queue?scope=collection'));
    expect(await res.json()).toMatchObject({
      scope: 'collection',
      ids: [],
      entries: [],
      total: 0,
      next_page: null,
    });
  });

  it('uses null titles when queued ids are missing from the VN table', async () => {
    listQueueMock.mockResolvedValue({ total: 1, entries: [{ vn_id: 'v90010', title: null }] });

    const res = await GET(req('/api/stock/queue?scope=collection'));

    expect(await res.json()).toMatchObject({
      ids: ['v90010'],
      entries: [{ vn_id: 'v90010', title: null }],
    });
  });

  it('returns reading queue, oldest stock, and recently checked scopes', async () => {
    installDb({ reading_queue: ['v91001'], recent_stock: ['v92001'], recent_checked: ['v92002'] });
    let res = await GET(req('/api/stock/queue?scope=reading_queue'));
    expect(await res.json()).toMatchObject({
      scope: 'reading_queue',
      ids: ['v91001'],
      entries: [{ vn_id: 'v91001', title: 'Title v91001' }],
      next_page: null,
    });

    res = await GET(req('/api/stock/queue?scope=recent_stock'));
    expect(await res.json()).toMatchObject({
      scope: 'recent_stock',
      ids: ['v92001'],
      entries: [{ vn_id: 'v92001', title: 'Title v92001' }],
      next_page: null,
    });

    res = await GET(req('/api/stock/queue?scope=recent_checked'));
    expect(await res.json()).toMatchObject({
      scope: 'recent_checked',
      ids: ['v92002'],
      entries: [{ vn_id: 'v92002', title: 'Title v92002' }],
      next_page: null,
    });
  });

  it('returns wishlist ids, filters malformed upstream ids, and handles auth-needed wishlist state', async () => {
    installDb({});
    fetchWishlistMock.mockResolvedValueOnce([
      { id: 'v93001' },
      { id: 'bad' },
      { id: 'v93002' },
    ]);
    let res = await GET(req('/api/stock/queue?scope=wishlist&page_size=1'));
    expect(await res.json()).toMatchObject({
      scope: 'wishlist',
      ids: ['v93001'],
      entries: [{ vn_id: 'v93001', title: 'Title v93001' }],
      total: 2,
      next_page: 2,
    });

    fetchWishlistMock.mockResolvedValueOnce({ needsAuth: true });
    res = await GET(req('/api/stock/queue?scope=wishlist'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'VNDB authentication required' });
  });

  it('uses a null wishlist title when the local VN cache has no matching row', async () => {
    fetchWishlistMock.mockResolvedValue([{ id: 'v93003' }]);
    titlesForMock.mockResolvedValue(new Map());

    const res = await GET(req('/api/stock/queue?scope=wishlist'));

    expect(await res.json()).toMatchObject({
      entries: [{ vn_id: 'v93003', title: null }],
    });
  });

  it('rejects unknown scopes', async () => {
    installDb({});
    const res = await GET(req('/api/stock/queue?scope=unknown'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown scope' });
  });
});
