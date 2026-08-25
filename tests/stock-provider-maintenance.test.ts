import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backend: { value: 'postgres' as 'postgres' | 'sqlite' },
  postgresQuery: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => ({ backend: mocks.backend.value }),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
}));

vi.mock('@/lib/db', () => ({
  db: { prepare: mocks.prepare },
}));

import { getStockProviderMaintenanceRepository } from '@/lib/db/repositories/stock-provider-maintenance';

const statuses = [
  { provider: 'sofmap', latest_status_at: 300, status_rows: 4 },
  { provider: 'surugaya', latest_status_at: null, status_rows: 2 },
  { provider: 'melonbooks', latest_status_at: 100, status_rows: 1 },
];

const batches = [
  { provider: 'sofmap', started_at: 150 },
  { provider: 'sofmap', started_at: 200 },
  { provider: 'sofmap', started_at: 175 },
  { provider: 'surugaya', started_at: 200 },
  { provider: 'melonbooks', started_at: 150 },
  { provider: 'unknown', started_at: 400 },
];

function assertSummary(rows: Awaited<ReturnType<ReturnType<typeof getStockProviderMaintenanceRepository>['listFreshness']>>) {
  expect(rows).toHaveLength(22);
  expect(rows.find((row) => row.provider === 'sofmap')).toEqual({
    provider: 'sofmap',
    latest_status_at: 300,
    status_rows: 4,
    last_batch_started_at: 200,
    updated_after_last_batch: true,
  });
  expect(rows.find((row) => row.provider === 'surugaya')).toMatchObject({
    latest_status_at: null,
    last_batch_started_at: 200,
    updated_after_last_batch: false,
  });
  expect(rows.find((row) => row.provider === 'melonbooks')).toMatchObject({
    latest_status_at: 100,
    last_batch_started_at: 150,
    updated_after_last_batch: false,
  });
  expect(rows.find((row) => row.provider === 'mandarake')).toMatchObject({
    latest_status_at: null,
    status_rows: 0,
    last_batch_started_at: null,
    updated_after_last_batch: null,
  });
}

describe('stock provider maintenance repository', () => {
  beforeEach(() => {
    mocks.postgresQuery.mockReset();
    mocks.prepare.mockReset();
  });

  it('summarizes PostgreSQL provider writes against the latest selected batch', async () => {
    mocks.backend.value = 'postgres';
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: statuses, rowCount: statuses.length })
      .mockResolvedValueOnce({ rows: batches, rowCount: batches.length });

    const rows = await getStockProviderMaintenanceRepository().listFreshness();
    assertSummary(rows);
    expect(mocks.postgresQuery.mock.calls[0]?.[0]).toContain('MAX(fetched_at)');
    expect(mocks.postgresQuery.mock.calls[1]?.[0]).toContain('stock_provider_batch_run');
  });

  it('returns the same summary from SQLite query results', async () => {
    mocks.backend.value = 'sqlite';
    mocks.prepare.mockImplementation((sql: string) => ({
      all: () => sql.includes('vn_stock_provider_status') ? statuses : batches,
    }));

    const rows = await getStockProviderMaintenanceRepository().listFreshness();
    assertSummary(rows);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });
});
