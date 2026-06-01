import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllCollectionItems } from '@/lib/collection-api-client';

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchAllCollectionItems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drains bounded collection pages while preserving filters and abort signals', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: 'v1' }, { id: 'v2' }],
        pagination: { page: 1, page_size: 500, returned: 2, has_more: true },
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: 'v3' }],
        pagination: { page: 2, page_size: 500, returned: 1, has_more: false },
      }));
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();

    await expect(fetchAllCollectionItems<{ id: string }>(
      new URLSearchParams({ status: 'planning' }),
      { signal: controller.signal },
    )).resolves.toEqual([{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/collection?status=planning&page=1&limit=500',
      { signal: controller.signal, cache: 'no-store' },
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/collection?status=planning&page=2&limit=500',
      { signal: controller.signal, cache: 'no-store' },
    );
  });

  it('stops after one response when pagination metadata is absent', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ items: [{ id: 'v1' }] }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllCollectionItems<{ id: string }>(new URLSearchParams()))
      .resolves.toEqual([{ id: 'v1' }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces failed responses without requesting another page', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response('upstream failed', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllCollectionItems(new URLSearchParams())).rejects.toThrow('upstream failed');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
