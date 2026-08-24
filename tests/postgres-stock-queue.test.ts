import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postgresQueryMock } = vi.hoisted(() => ({
  postgresQueryMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
}));

import { createPostgresStockQueueRepository } from '@/lib/db/repositories/stock-queue';

describe('PostgreSQL stock queues', () => {
  beforeEach(() => {
    postgresQueryMock.mockReset();
  });

  it('uses the domain order for every local queue scope', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001', title: 'Collection title' }] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90002', title: 'Queue title' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90003', title: null }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90004', title: 'Recently checked' }] });
    const repository = createPostgresStockQueueRepository();

    await expect(repository.list('collection', 20, 40)).resolves.toEqual({
      total: 3,
      entries: [{ vn_id: 'v90001', title: 'Collection title' }],
    });
    await expect(repository.list('reading_queue', 10, 0)).resolves.toEqual({
      total: 2,
      entries: [{ vn_id: 'v90002', title: 'Queue title' }],
    });
    await expect(repository.list('recent_stock', 5, 1)).resolves.toEqual({
      total: 0,
      entries: [{ vn_id: 'v90003', title: null }],
    });
    await expect(repository.list('recent_checked', 6, 0)).resolves.toEqual({
      total: 1,
      entries: [{ vn_id: 'v90004', title: 'Recently checked' }],
    });

    expect(postgresQueryMock.mock.calls[1]?.[0]).toContain('c.updated_at DESC');
    expect(postgresQueryMock.mock.calls[3]?.[0]).toContain('q.position ASC');
    expect(postgresQueryMock.mock.calls[5]?.[0]).toContain('MIN(s.fetched_at) ASC');
    expect(postgresQueryMock.mock.calls[7]?.[0]).toContain('MAX(s.fetched_at) DESC');
    expect(postgresQueryMock.mock.calls[1]?.[1]).toEqual([20, 40]);
  });

  it('returns an empty title map without querying', async () => {
    const repository = createPostgresStockQueueRepository();
    await expect(repository.titlesFor([])).resolves.toEqual(new Map());
    expect(postgresQueryMock).not.toHaveBeenCalled();
  });

  it('fills missing local titles with null', async () => {
    postgresQueryMock.mockResolvedValue({ rows: [{ id: 'v90001', title: 'Known' }] });
    const result = await createPostgresStockQueueRepository().titlesFor(['v90001', 'v90002']);

    expect(result).toEqual(new Map([
      ['v90001', 'Known'],
      ['v90002', null],
    ]));
    expect(postgresQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('id = ANY($1::text[])'),
      [['v90001', 'v90002']],
    );
  });

  it('keeps every PostgreSQL title when all requested rows exist', async () => {
    postgresQueryMock.mockResolvedValue({
      rows: [
        { id: 'v90001', title: 'First' },
        { id: 'v90002', title: 'Second' },
      ],
    });

    await expect(createPostgresStockQueueRepository().titlesFor(['v90001', 'v90002'])).resolves.toEqual(new Map([
      ['v90001', 'First'],
      ['v90002', 'Second'],
    ]));
  });
});
