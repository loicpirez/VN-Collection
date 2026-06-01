import { describe, expect, it, vi } from 'vitest';
import { GET, POST, DELETE } from '@/app/api/vn/[id]/stock/route';

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getVn: async () => null };
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
  it('400 on invalid vn id', async () => {
    const res = await POST(makeReq('POST', {}) as never, { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
  });

  it('does not leak raw error details to client', async () => {
    // VN that doesn't exist → 404 with generic message.
    const res = await POST(
      makeReq('POST', { providers: ['eroge_price'] }) as never,
      { params: Promise.resolve({ id: 'v99999999' }) },
    );
    // VN-not-found returns 404; other errors return 500 with generic message.
    expect([404, 500]).toContain(res.status);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    // Internal stack traces / file paths must never reach the client.
    expect(body.error).not.toMatch(/\/Users\//);
    expect(body.error).not.toMatch(/node_modules/);
    expect(body.error).not.toMatch(/at [A-Z]/);
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
