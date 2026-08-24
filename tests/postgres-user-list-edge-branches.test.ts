import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));

import { createPostgresUserListRepository } from '@/lib/db/repositories/user-list';

const currentList = {
  id: 1,
  name: 'Current',
  slug: 'current',
  description: 'Description',
  color: 'red',
  icon: 'List',
  pinned: 1,
  created_at: 10,
  updated_at: 20,
};

describe('PostgreSQL user-list edge branches', () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
  });

  it('preserves omitted fields and keeps the existing slug', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_list WHERE id = $1 FOR UPDATE')) return { rows: [currentList], rowCount: 1 };
      if (sql.includes('UPDATE user_list SET')) return { rows: [currentList], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(createPostgresUserListRepository().update(1, {})).resolves.toEqual(currentList);
    const updateCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE user_list SET'));
    expect(updateCall?.[1]?.slice(0, 6)).toEqual([
      'Current', 'current', 'Description', 'red', 'List', 1,
    ]);
  });

  it('uses the non-Latin slug fallback and persists explicit false or null fields', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string, values?: readonly (string | number | null)[]) => {
      if (sql.includes('FROM user_list WHERE id = $1 FOR UPDATE')) return { rows: [currentList], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM user_list')) return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE user_list SET')) {
        return {
          rows: [{
            ...currentList,
            name: values?.[0],
            slug: values?.[1],
            description: values?.[2],
            color: values?.[3],
            icon: values?.[4],
            pinned: values?.[5],
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(createPostgresUserListRepository().update(1, {
      name: '日本語',
      description: null,
      color: null,
      icon: null,
      pinned: false,
    })).resolves.toMatchObject({
      name: '日本語',
      slug: 'list',
      description: null,
      color: null,
      icon: null,
      pinned: 0,
    });
  });

  it('treats unavailable affected counts as no deletion', async () => {
    const repository = createPostgresUserListRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.remove(1)).resolves.toBe(false);

    mocks.clientQuery.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.removeItem(1, 'V90001')).resolves.toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1);
  });
});
