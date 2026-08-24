import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postgresQueryMock, transactionMock, clientQueryMock } = vi.hoisted(() => ({
  postgresQueryMock: vi.fn(),
  transactionMock: vi.fn(),
  clientQueryMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
  withPostgresTransaction: transactionMock,
}));

import { createPostgresSteamRepository } from '@/lib/db/repositories/steam';

const manualLink = {
  vn_id: 'v90001',
  appid: 10,
  steam_name: 'Manual',
  source: 'manual' as const,
  last_synced_minutes: null,
  created_at: 1,
  updated_at: 2,
};

describe('PostgreSQL Steam repository', () => {
  beforeEach(() => {
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    transactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('reads links, collection projections, and normalized title matches', async () => {
    const repository = createPostgresSteamRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [manualLink], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [manualLink], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [manualLink], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001', vn_title: 'Title', current: 10 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'v90001', title: 'Title' }], rowCount: 1 });

    await expect(repository.listLinks()).resolves.toEqual([manualLink]);
    await expect(repository.getLinkForVn('v90001')).resolves.toEqual(manualLink);
    await expect(repository.getLinkForVn('v90002')).resolves.toBeNull();
    await expect(repository.getLinkByAppid(10)).resolves.toEqual(manualLink);
    await expect(repository.listCollectionVndbIds()).resolves.toEqual(['v90001']);
    await expect(repository.listSuggestionRows(['v90001'])).resolves.toEqual([
      { vn_id: 'v90001', vn_title: 'Title', current: 10 },
    ]);
    await expect(repository.searchCollection(' 100%_Title ', 500)).resolves.toEqual([
      { id: 'v90001', title: 'Title' },
    ]);
    expect(postgresQueryMock.mock.calls.at(-1)?.[1]).toEqual(['%100\\%\\_title%', 100]);
    await expect(repository.listSuggestionRows([])).resolves.toEqual([]);
    await expect(repository.searchCollection('   ', 12)).resolves.toEqual([]);
  });

  it('keeps a manual link when auto detection proposes a replacement', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [manualLink], rowCount: 1 });
    await expect(createPostgresSteamRepository().setLink({
      vnId: 'v90001',
      appid: 11,
      steamName: 'Auto',
      source: 'auto',
    })).resolves.toEqual(manualLink);
    expect(clientQueryMock).toHaveBeenCalledOnce();
  });

  it('writes and returns a new link with a bounded title', async () => {
    const saved = { ...manualLink, source: 'auto' as const, steam_name: 'x'.repeat(200) };
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [saved], rowCount: 1 });

    await expect(createPostgresSteamRepository().setLink({
      vnId: 'v90001',
      appid: 10,
      steamName: 'x'.repeat(250),
      source: 'auto',
    })).resolves.toEqual(saved);
    expect(clientQueryMock.mock.calls[1]?.[1]?.[2]).toBe('x'.repeat(200));
  });

  it('fails closed when a completed link write cannot be read back', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(createPostgresSteamRepository().setLink({
      vnId: 'v90001',
      appid: 10,
      steamName: 'Auto',
      source: 'auto',
    })).rejects.toThrow('Steam link write did not return a row');
  });

  it('deletes, stamps, and applies deduplicated playtime batches', async () => {
    const repository = createPostgresSteamRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(repository.deleteLink('v90001')).resolves.toBe(true);
    await expect(repository.deleteLink('v90002')).resolves.toBe(false);
    await repository.markSynced('v90001', 120);

    clientQueryMock.mockResolvedValueOnce({ rows: [{ applied: 1 }], rowCount: 1 });
    await expect(repository.applyPlaytime([
      { vn_id: 'v90001', playtime_minutes: 30 },
      { vn_id: 'v90001', playtime_minutes: 60 },
    ])).resolves.toBe(1);
    const [query, params] = clientQueryMock.mock.calls[0] ?? [];
    expect(query).toContain('UNNEST($1::text[], $2::bigint[], $3::bigint[])');
    expect(query).toContain('updated_at = $4');
    expect(params).toEqual([
      ['v90001', 'v90001'],
      [30, 60],
      [0, 1],
      expect.any(Number),
    ]);
    await expect(repository.applyPlaytime([])).resolves.toBe(0);
  });
});
