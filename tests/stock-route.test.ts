import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/api/vn/v1/stock', {
    method,
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/vn/[id]/stock', () => {
  it('400 on invalid vn id', async () => {
    const res = await GET(makeReq('GET') as never, { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid id/);
  });

  it('200 with empty snapshot for unknown valid id', async () => {
    const res = await GET(makeReq('GET') as never, { params: Promise.resolve({ id: 'v99999000' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.offers)).toBe(true);
    expect(Array.isArray(data.providers)).toBe(true);
    expect(Array.isArray(data.statuses)).toBe(true);
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
    const res = await POST(makeReq('POST', {}) as never, { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
  });

  it('404 with {error:"vn not found"} when refresh throws VN-not-found', async () => {
    refreshStockForVnMock.mockRejectedValue(new Error('VN not found'));
    const res = await POST(
      makeReq('POST', { providers: ['eroge_price'] }) as never,
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'vn not found' });
  });

  it('500 on a generic refresh failure without leaking raw error details', async () => {
    refreshStockForVnMock.mockRejectedValue(new Error('upstream socket reset'));
    const res = await POST(
      makeReq('POST', { providers: ['eroge_price'] }) as never,
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('stock refresh failed');
    expect(body.detail).not.toMatch(/\/Users\//);
    expect(body.detail).not.toMatch(/node_modules/);
    expect(body.detail).not.toMatch(/at [A-Z]/);
  });
});

describe('DELETE /api/vn/[id]/stock', () => {
  it('400 on invalid vn id', async () => {
    const res = await DELETE(makeReq('DELETE') as never, { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
  });

  it('200 with empty result for unknown valid id', async () => {
    const res = await DELETE(
      makeReq('DELETE') as never,
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
});
