import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllCollectionItems } from '@/lib/collection-api-client';

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function decodeIdRow(value: unknown): { id: string } | null {
  return value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
    ? { id: value.id }
    : null;
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

    await expect(fetchAllCollectionItems(
      new URLSearchParams({ status: 'planning' }),
      decodeIdRow,
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

  it('rejects a response when pagination metadata is absent', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ items: [{ id: 'v1' }] }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllCollectionItems(new URLSearchParams(), decodeIdRow))
      .rejects.toThrow('collection request failed');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces failed responses without requesting another page', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'upstream failed' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllCollectionItems(new URLSearchParams(), decodeIdRow)).rejects.toThrow('upstream failed');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a page number that does not match the requested page', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({
      items: [{ id: 'v1' }],
      pagination: { page: 2, page_size: 500, returned: 1, has_more: false },
    }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllCollectionItems(new URLSearchParams(), decodeIdRow))
      .rejects.toThrow('collection request failed');
  });

  it('rejects pagination that never reaches a final page', async () => {
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      const page = Number(new URL(input, 'http://localhost').searchParams.get('page'));
      return Promise.resolve(jsonResponse({
        items: [],
        pagination: { page, page_size: 500, returned: 0, has_more: true },
      }));
    });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllCollectionItems(new URLSearchParams(), decodeIdRow))
      .rejects.toThrow('collection pagination exceeded its safety bound');
    expect(fetchSpy).toHaveBeenCalledTimes(20_000);
  });
});
