import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const upstreamMocks = vi.hoisted(() => ({
  getTag: vi.fn(),
  getDetail: vi.fn(),
  getResults: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getTag: upstreamMocks.getTag,
  fetchTopVnsByTag: upstreamMocks.getResults,
}));

vi.mock('@/lib/vndb-tag-web-cache', () => ({
  getVndbTagWebDetail: upstreamMocks.getDetail,
}));

import { GET } from '@/app/api/tags/[id]/hydrate/route';

function request(query = '', external = false): NextRequest {
  const host = external ? '93.184.216.34' : '127.0.0.1';
  return new NextRequest(`http://${host}/api/tags/g90001/hydrate${query}`, {
    headers: { host },
  });
}

beforeEach(() => {
  upstreamMocks.getTag.mockReset().mockResolvedValue({ id: 'g90001' });
  upstreamMocks.getDetail.mockReset().mockResolvedValue({ data: { id: 'g90001' } });
  upstreamMocks.getResults.mockReset().mockResolvedValue({ results: [], more: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/tags/[id]/hydrate', () => {
  it('rejects a non-local request', async () => {
    const result = await GET(request('', true), { params: Promise.resolve({ id: 'g90001' }) });
    expect(result.status).toBe(403);
  });

  it('rejects malformed tag ids and modes', async () => {
    let result = await GET(request(), { params: Promise.resolve({ id: 'bad' }) });
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'invalid tag id' });

    result = await GET(request('?mode=other'), { params: Promise.resolve({ id: 'g90001' }) });
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'invalid tag mode' });
  });

  it('hydrates only normalized tag metadata in local mode', async () => {
    const result = await GET(request('?page=0'), { params: Promise.resolve({ id: 'G90001' }) });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      ok: true,
      complete: true,
      refreshed: ['tag'],
      failed: [],
    });
    expect(upstreamMocks.getTag).toHaveBeenCalledWith('g90001');
    expect(upstreamMocks.getDetail).not.toHaveBeenCalled();
    expect(upstreamMocks.getResults).not.toHaveBeenCalled();
  });

  it('hydrates every VNDB-mode snapshot with a bounded page', async () => {
    const result = await GET(request('?mode=vndb&page=999999'), {
      params: Promise.resolve({ id: 'g90001' }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      ok: true,
      complete: true,
      refreshed: ['tag', 'hierarchy', 'results'],
      failed: [],
    });
    expect(upstreamMocks.getResults).toHaveBeenCalledWith('g90001', { results: 24, page: 10_000 });
  });

  it('returns a sanitized partial summary when one source fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upstreamMocks.getDetail.mockRejectedValue(new Error('private upstream detail'));
    const result = await GET(request('?mode=vndb&page=2'), {
      params: Promise.resolve({ id: 'g90001' }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      ok: true,
      complete: false,
      refreshed: ['tag', 'results'],
      failed: ['hierarchy'],
    });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:tags/hydrate] partial failure', {
      tagId: 'g90001',
      failed: ['hierarchy'],
    });
  });

  it('returns a sanitized upstream error when every source fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upstreamMocks.getTag.mockRejectedValue('failure');
    const result = await GET(request(), { params: Promise.resolve({ id: 'g90001' }) });
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({
      ok: false,
      error: 'upstream service unavailable',
      code: 'upstream_unavailable',
      context: 'tags/hydrate',
    });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:tags/hydrate] tag hydration failed');
  });
});
