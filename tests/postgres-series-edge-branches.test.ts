import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientQueryMock, postgresQueryMock, withTransactionMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  postgresQueryMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
  withPostgresTransaction: withTransactionMock,
}));

import { createPostgresSeriesRepository } from '@/lib/db/repositories/series';

function relation(id: string, title: string): { id: string; title: string; relation: string } {
  return { id, title, relation: 'seq' };
}

describe('PostgreSQL series edge branches', () => {
  beforeEach(() => {
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('walks appended relations and ignores cycles', async () => {
    postgresQueryMock.mockImplementation(async (_sql: string, values: readonly [string]) => ({
      rows: values[0] === 'v90001'
        ? [{ relations: JSON.stringify([relation('v90002', 'Second')]) }]
        : [{ relations: JSON.stringify([relation('v90001', 'First')]) }],
    }));

    await expect(createPostgresSeriesRepository().walkRelations('v90001')).resolves.toEqual([
      relation('v90002', 'Second'),
    ]);
    expect(postgresQueryMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a relation walk at five hundred unique entries', async () => {
    const relations = Array.from({ length: 500 }, (_, index) => relation(`v${index + 91000}`, `Part ${index + 1}`));
    postgresQueryMock.mockResolvedValueOnce({ rows: [{ relations: JSON.stringify(relations) }] });

    await expect(createPostgresSeriesRepository().walkRelations('v90001')).resolves.toHaveLength(500);
    expect(postgresQueryMock).toHaveBeenCalledOnce();
  });

  it('returns no suggestion without relations, with an assigned seed, or without owned relations', async () => {
    const repository = createPostgresSeriesRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ title: 'Standalone' }] })
      .mockResolvedValueOnce({ rows: [{ relations: null }] });
    await expect(repository.suggest('v90001')).resolves.toBeNull();

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ title: 'Series 1' }] })
      .mockResolvedValueOnce({ rows: [{ relations: JSON.stringify([relation('v90002', 'Series 2')]) }] })
      .mockResolvedValueOnce({ rows: [{ relations: null }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90002' }] })
      .mockResolvedValueOnce({ rows: [{ series_id: 4 }] });
    await expect(repository.suggest('v90001')).resolves.toBeNull();

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ title: 'Series 1' }] })
      .mockResolvedValueOnce({ rows: [{ relations: JSON.stringify([relation('v90002', 'Series 2')]) }] })
      .mockResolvedValueOnce({ rows: [{ relations: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.suggest('v90001')).resolves.toBeNull();
  });

  it('falls back to the full seed title when no usable common title remains', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ title: ':' }] })
      .mockResolvedValueOnce({ rows: [{ relations: JSON.stringify([relation('v90002', 'Unrelated')]) }] })
      .mockResolvedValueOnce({ rows: [{ relations: null }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90002' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(createPostgresSeriesRepository().suggest('v90001')).resolves.toEqual({
      existing: [],
      suggestedName: ':',
      relatedInCollection: [relation('v90002', 'Unrelated')],
    });
  });

  it('keeps a meaningful common title without applying the volume fallback', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ title: 'Shared title 1' }] })
      .mockResolvedValueOnce({ rows: [{ relations: JSON.stringify([relation('v90002', 'Shared title 2')]) }] })
      .mockResolvedValueOnce({ rows: [{ relations: null }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90002' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(createPostgresSeriesRepository().suggest('v90001')).resolves.toMatchObject({
      suggestedName: 'Shared title',
    });
  });

  it('persists explicit null media fields and skips an empty member batch', async () => {
    const repository = createPostgresSeriesRepository();
    postgresQueryMock.mockResolvedValueOnce({ rows: [{
      id: 4,
      name: 'Series',
      description: null,
      cover_path: null,
      banner_path: null,
      created_at: 1,
      updated_at: 2,
    }] });
    await expect(repository.update(4, {
      description: null,
      cover_path: null,
      banner_path: null,
    })).resolves.toMatchObject({ id: 4, description: null });
    expect(postgresQueryMock.mock.calls[0]?.[1]?.slice(0, 3)).toEqual([null, null, null]);

    await repository.addMembers(4, []);
    expect(withTransactionMock).not.toHaveBeenCalled();
  });
});
