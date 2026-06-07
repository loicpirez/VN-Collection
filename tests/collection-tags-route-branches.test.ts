import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listCollectionTagsMock } = vi.hoisted(() => ({
  listCollectionTagsMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  listCollectionTags: listCollectionTagsMock,
}));

import { GET } from '@/app/api/collection/tags/route';

function req(): NextRequest {
  return new NextRequest('http://127.0.0.1/api/collection/tags');
}

describe('GET /api/collection/tags branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mirrors collection tag aggregates into the shared tag response shape', async () => {
    listCollectionTagsMock.mockReturnValue([
      { id: 'g90001', name: 'Drama', category: null, count: 3 },
      { id: 'g90002', name: 'Mystery', category: 'ero', count: 1 },
    ]);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tags: [
        {
          id: 'g90001',
          name: 'Drama',
          aliases: [],
          description: null,
          category: 'cont',
          searchable: true,
          applicable: true,
          vn_count: 3,
        },
        {
          id: 'g90002',
          name: 'Mystery',
          aliases: [],
          description: null,
          category: 'ero',
          searchable: true,
          applicable: true,
          vn_count: 1,
        },
      ],
    });
  });

  it('returns the standard internal error response when tag aggregation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listCollectionTagsMock.mockImplementation(() => {
      throw new Error('tag db failed');
    });

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:collection.tags.GET] tag db failed');
  });
});
