import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backend: { value: 'postgres' as 'sqlite' | 'postgres' },
  postgresQuery: vi.fn(),
  sqliteSearch: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => mocks.backend.value === 'postgres'
    ? { backend: 'postgres' }
    : { backend: 'sqlite' },
}));

vi.mock('@/lib/db/postgres', () => ({ postgresQuery: mocks.postgresQuery }));
vi.mock('@/lib/db', () => ({ searchTextual: mocks.sqliteSearch }));

import {
  createPostgresTextSearchRepository,
  getTextSearchRepository,
} from '@/lib/db/repositories/text-search';

describe('PostgreSQL textual-search repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backend.value = 'postgres';
    mocks.postgresQuery.mockResolvedValue({ rows: [] });
  });

  it('returns no rows without querying for short input', async () => {
    await expect(createPostgresTextSearchRepository().search(' x ')).resolves.toEqual([]);
    expect(mocks.postgresQuery).not.toHaveBeenCalled();
  });

  it('maps every source with normalized parameters and bounded limits', async () => {
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [
      { vn_id: 'v90001', title: 'A', source: 'notes', text: 'prefix memo suffix' },
      { vn_id: 'v90002', title: 'B', source: 'custom_description', text: 'custom memo' },
      { vn_id: 'v90003', title: 'C', source: 'quote', text: 'quote memo' },
    ] });
    const repository = createPostgresTextSearchRepository();

    await expect(repository.search(' ＭＥＭＯ ', 999)).resolves.toEqual([
      { vn_id: 'v90001', title: 'A', source: 'notes', snippet: 'prefix memo suffix' },
      { vn_id: 'v90002', title: 'B', source: 'custom_description', snippet: 'custom memo' },
      { vn_id: 'v90003', title: 'C', source: 'quote', snippet: 'quote memo' },
    ]);
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual(['%memo%', 200]);
    expect(mocks.postgresQuery.mock.calls[0]?.[0]).toContain('app_search_normalize(c.notes)');

    await repository.search('memo', Number.NaN);
    expect(mocks.postgresQuery.mock.calls[1]?.[1]).toEqual(['%memo%', 50]);
  });

  it('delegates SQLite and caches the PostgreSQL implementation', async () => {
    mocks.backend.value = 'sqlite';
    mocks.sqliteSearch.mockReturnValue([{ vn_id: 'v1' }]);
    await expect(getTextSearchRepository().search('memo', 3)).resolves.toEqual([{ vn_id: 'v1' }]);
    expect(mocks.sqliteSearch).toHaveBeenCalledWith('memo', 3);

    mocks.backend.value = 'postgres';
    const first = getTextSearchRepository();
    expect(getTextSearchRepository()).toBe(first);
  });
});
