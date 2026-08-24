import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const recommendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/recommend', () => ({ recommendVns: recommendMock }));

import { POST } from '@/app/api/recommendations/hydrate/route';

function request(body: object, external = false): NextRequest {
  const host = external ? '93.184.216.34' : '127.0.0.1';
  return new NextRequest(`http://${host}/api/recommendations/hydrate`, {
    method: 'POST',
    headers: { host, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  recommendMock.mockReset().mockResolvedValue({ results: [], cacheComplete: true });
});

describe('POST /api/recommendations/hydrate', () => {
  it('rejects non-local requests', async () => {
    const result = await POST(request({}, true));
    expect(result.status).toBe(403);
  });

  it('normalizes a valid request and reports partial hydration', async () => {
    recommendMock.mockResolvedValueOnce({ results: [{ id: 'v90002' }], cacheComplete: false });
    const result = await POST(request({
      mode: 'similar-to-vn',
      includeEro: true,
      includeOwned: false,
      includeWishlist: true,
      customTagIds: ['G90001', 'g90001', 'g90002'],
      seedVnId: 'V90001',
    }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, complete: false, results: 1 });
    expect(recommendMock).toHaveBeenCalledWith({
      mode: 'similar-to-vn',
      includeEro: true,
      includeOwned: false,
      includeWishlist: true,
      customTagIds: ['g90001', 'g90002'],
      seedVnId: 'v90001',
    });
  });

  it('uses bounded defaults when optional fields are absent', async () => {
    const result = await POST(request({}));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, complete: true, results: 0 });
    expect(recommendMock).toHaveBeenCalledWith({
      mode: 'because-you-liked',
      includeEro: false,
      includeOwned: false,
      includeWishlist: false,
      customTagIds: undefined,
      seedVnId: undefined,
    });
  });

  it.each([
    [{ mode: 1 }, 'invalid recommendation mode'],
    [{ mode: 'unsupported' }, 'invalid recommendation mode'],
    [{ includeEro: 1 }, 'invalid includeEro'],
    [{ includeOwned: 'yes' }, 'invalid includeOwned'],
    [{ includeWishlist: null }, 'invalid includeWishlist'],
    [{ customTagIds: 'g90001' }, 'invalid recommendation tags'],
    [{ customTagIds: Array.from({ length: 21 }, (_, index) => `g${90000 + index}`) }, 'invalid recommendation tags'],
    [{ customTagIds: ['bad'] }, 'invalid recommendation tags'],
    [{ seedVnId: 1 }, 'invalid recommendation seed'],
    [{ seedVnId: 'bad' }, 'invalid recommendation seed'],
    [{ mode: 'similar-to-vn' }, 'recommendation seed required'],
  ])('rejects invalid body %#', async (body, message) => {
    const result = await POST(request(body));
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: message });
    expect(recommendMock).not.toHaveBeenCalled();
  });

  it('returns a sanitized upstream error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    recommendMock.mockRejectedValueOnce(new Error('private upstream body'));
    const result = await POST(request({ mode: 'tag-based', customTagIds: [] }));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({
      ok: false,
      error: 'upstream service unavailable',
      code: 'upstream_unavailable',
      context: 'recommendations/hydrate',
    });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
