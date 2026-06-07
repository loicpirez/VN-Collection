import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { searchVnMock, searchEgsByNameMock } = vi.hoisted(() => ({
  searchVnMock: vi.fn(),
  searchEgsByNameMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, searchVn: searchVnMock };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, searchEgsByName: searchEgsByNameMock };
});

import { GET } from '@/app/api/stock/resolve-titles/route';
import { db } from '@/lib/db';

function req(query: string, forwardedFor: string, origin = 'http://127.0.0.1'): NextRequest {
  return new NextRequest(`${origin}/api/stock/resolve-titles${query}`, {
    headers: { 'x-forwarded-for': forwardedFor },
  });
}

beforeEach(() => {
  searchVnMock.mockReset();
  searchEgsByNameMock.mockReset();
  db.prepare(`DELETE FROM vn_title_resolve_cache WHERE query IN ('Remote VN', 'Remote EGS', 'No Hit')`).run();
});

describe('GET /api/stock/resolve-titles upstream branches', () => {
  it('denies remote callers before resolving titles', async () => {
    const response = await GET(req('?q=Remote+VN', '10.30.0.1', 'http://remote.example'));
    expect(response.status).toBe(403);
    expect(searchVnMock).not.toHaveBeenCalled();
  });

  it('returns null for a query that clamps to empty text', async () => {
    const response = await GET(req('?q=+++', '10.30.0.2'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ '   ': null });
    expect(searchVnMock).not.toHaveBeenCalled();
  });

  it('uses VNDB upstream results and then serves the cached title resolution', async () => {
    searchVnMock.mockResolvedValue({ results: [{ id: 'v880100', title: 'Remote VN Title' }] });
    searchEgsByNameMock.mockResolvedValue(null);

    const first = await GET(req('?q=Remote+VN', '10.30.0.3'));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ 'Remote VN': { vnId: 'v880100', title: 'Remote VN Title' } });
    expect(searchVnMock).toHaveBeenCalledTimes(1);

    searchVnMock.mockReset();
    searchEgsByNameMock.mockReset();
    const second = await GET(req('?q=Remote+VN', '10.30.0.4'));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ 'Remote VN': { vnId: 'v880100', title: 'Remote VN Title' } });
    expect(searchVnMock).not.toHaveBeenCalled();
    expect(searchEgsByNameMock).not.toHaveBeenCalled();
  });

  it('uses EGS upstream results when VNDB has no hit', async () => {
    searchVnMock.mockResolvedValue({ results: [] });
    searchEgsByNameMock.mockResolvedValue({ id: 880200, gamename: 'Remote EGS Title' });

    const response = await GET(req('?q=Remote+EGS', '10.30.0.5'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ 'Remote EGS': { vnId: 'egs_880200', title: 'Remote EGS Title' } });
  });

  it('returns null when both upstreams fail or miss', async () => {
    searchVnMock.mockRejectedValue(new Error('vndb down'));
    searchEgsByNameMock.mockRejectedValue(new Error('egs down'));

    const response = await GET(req('?q=No+Hit', '10.30.0.6'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ 'No Hit': null });
  });
});
