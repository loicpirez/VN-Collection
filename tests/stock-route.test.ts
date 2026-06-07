import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/vn/[id]/stock/route';

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getVn: async () => null };
});

const { refreshStockForVnMock } = vi.hoisted(() => ({ refreshStockForVnMock: vi.fn() }));

vi.mock('@/lib/stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock')>();
  return { ...actual, refreshStockForVn: refreshStockForVnMock };
});

function makeReq(method: string, body?: unknown, origin = 'http://localhost'): NextRequest {
  return new NextRequest(`${origin}/api/vn/v1/stock`, {
    method,
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/vn/[id]/stock', () => {
  it('400 on invalid vn id', async () => {
    const res = await GET(makeReq('GET'), { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid id/);
  });

  it('200 with empty snapshot for unknown valid id', async () => {
    const res = await GET(makeReq('GET'), { params: Promise.resolve({ id: 'v99999000' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.offers)).toBe(true);
    expect(Array.isArray(data.providers)).toBe(true);
    expect(Array.isArray(data.statuses)).toBe(true);
  });

  it('403 before reading the id when the request is not local or tokened', async () => {
    const res = await GET(makeReq('GET', undefined, 'http://example.com'), { params: Promise.resolve({ id: 'v99999000' }) });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/vn/[id]/stock', () => {
  beforeEach(() => {
    refreshStockForVnMock.mockReset();
  });

  afterEach(() => {
    refreshStockForVnMock.mockReset();
  });

  it('400 on invalid vn id', async () => {
    const res = await POST(makeReq('POST', {}), { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
  });

  it('400 when providers is not an array', async () => {
    const res = await POST(makeReq('POST', { providers: 'eroge_price' }), { params: Promise.resolve({ id: 'v99999999' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'providers must be an array' });
  });

  it('400 when providers contains an unknown provider', async () => {
    const res = await POST(makeReq('POST', { providers: ['missing_shop'] }), { params: Promise.resolve({ id: 'v99999999' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid providers' });
  });

  it('400 when providers contains duplicates', async () => {
    const res = await POST(makeReq('POST', { providers: ['eroge_price', 'eroge_price'] }), { params: Promise.resolve({ id: 'v99999999' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'duplicate providers' });
  });

  it('400 when providers exceeds the provider count cap', async () => {
    const res = await POST(
      makeReq('POST', {
        providers: Array.from({ length: 40 }, () => 'eroge_price'),
      }),
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'too many providers' });
  });

  it('200 and refreshes every provider when providers is omitted', async () => {
    refreshStockForVnMock.mockResolvedValue({ offers: [], providers: [], statuses: [] });
    const res = await POST(makeReq('POST', {}), { params: Promise.resolve({ id: 'V99999999' }) });
    expect(res.status).toBe(200);
    expect(refreshStockForVnMock).toHaveBeenCalledWith(
      'v99999999',
      expect.arrayContaining(['eroge_price']),
      expect.any(AbortSignal),
    );
  });

  it('200 and treats an empty providers array as every provider', async () => {
    refreshStockForVnMock.mockResolvedValue({ offers: [], providers: [], statuses: [] });
    const res = await POST(makeReq('POST', { providers: [] }), { params: Promise.resolve({ id: 'v99999999' }) });
    expect(res.status).toBe(200);
    expect(refreshStockForVnMock).toHaveBeenCalledWith(
      'v99999999',
      expect.arrayContaining(['eroge_price']),
      expect.any(AbortSignal),
    );
  });

  it('403 before parsing the body when the request is not local or tokened', async () => {
    const res = await POST(makeReq('POST', {}, 'http://example.com'), { params: Promise.resolve({ id: 'v99999999' }) });
    expect(res.status).toBe(403);
    expect(refreshStockForVnMock).not.toHaveBeenCalled();
  });

  it('404 with {error:"vn not found"} when refresh throws VN-not-found', async () => {
    refreshStockForVnMock.mockRejectedValue(new Error('VN not found'));
    const res = await POST(
      makeReq('POST', { providers: ['eroge_price'] }),
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'vn not found' });
  });

  it('500 on a generic refresh failure without leaking raw error details', async () => {
    refreshStockForVnMock.mockRejectedValue(new Error('upstream socket reset'));
    const res = await POST(
      makeReq('POST', { providers: ['eroge_price'] }),
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('stock refresh failed');
    expect(body.detail).not.toMatch(/\/Users\//);
    expect(body.detail).not.toMatch(/node_modules/);
    expect(body.detail).not.toMatch(/at [A-Z]/);
  });

  it('500 with a fallback detail when refresh rejects with a non-Error object', async () => {
    refreshStockForVnMock.mockRejectedValue({});
    const res = await POST(
      makeReq('POST', { providers: ['eroge_price'] }),
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'stock refresh failed', detail: 'stock refresh failed' });
  });
});

describe('DELETE /api/vn/[id]/stock', () => {
  it('400 on invalid vn id', async () => {
    const res = await DELETE(makeReq('DELETE'), { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
  });

  it('200 with empty result for unknown valid id', async () => {
    const res = await DELETE(
      makeReq('DELETE'),
      { params: Promise.resolve({ id: 'v99999001' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      offers: expect.any(Number),
      statuses: expect.any(Number),
      snapshot: expect.objectContaining({
        offers: expect.any(Array),
        providers: expect.any(Array),
        statuses: expect.any(Array),
      }),
    });
  });

  it('403 before clearing cache when the request is not local or tokened', async () => {
    const res = await DELETE(makeReq('DELETE', undefined, 'http://example.com'), { params: Promise.resolve({ id: 'v99999001' }) });
    expect(res.status).toBe(403);
  });
});
