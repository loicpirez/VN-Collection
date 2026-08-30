import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postgresQuery: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => ({ backend: 'postgres' }),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
}));

import { getVndbLocalImportRepository } from '@/lib/db/repositories/vndb-local-import';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.postgresQuery.mockImplementation(async (sql: string) => sql.includes('FROM collection c')
    ? {
        rows: [
          { vn_id: 'V96001', title: 'Postgres title', status: 'completed' },
          { vn_id: 'v96002', title: 'Invalid status title', status: 'invalid' },
        ],
      }
    : {
        rows: [
          { vn_id: 'V96001', release_id: 'R96001', vn_title: 'Postgres title', edition_label: null },
        ],
      });
});

describe('PostgreSQL VNDB local-import repository', () => {
  it('reads both projections concurrently and normalizes identifiers', async () => {
    const snapshot = await getVndbLocalImportRepository().listSnapshot();
    expect(snapshot).toEqual({
      vns: [{ vn_id: 'v96001', title: 'Postgres title', status: 'completed' }],
      releases: [{ vn_id: 'v96001', release_id: 'r96001', vn_title: 'Postgres title', edition_label: null }],
    });
    expect(mocks.postgresQuery).toHaveBeenCalledTimes(2);
  });
});
