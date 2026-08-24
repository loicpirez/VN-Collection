import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadJob } from '@/lib/download-status';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  databaseUrl: { value: 'postgresql://localhost/stock_batch_0' },
  postgresQuery: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => ({
    backend: 'postgres',
    url: mocks.databaseUrl.value,
    poolMax: 4,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    lockTimeoutMs: 5_000,
    sslMode: 'disable',
    applicationName: 'test',
  }),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.withTransaction,
}));

import {
  listDurableStockBatchJobs,
  markUnfinishedDurableStockBatchJobsInterrupted,
  upsertDurableStockBatchJob,
} from '@/lib/stock-batch-store';

let databaseSequence = 0;

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'stock-batch:postgres',
    kind: 'stock-batch',
    vn_id: null,
    label: 'PostgreSQL stock batch',
    label_code: 'stock_refresh',
    label_params: { count: 3 },
    total: 3,
    done: 1,
    current_item: 'v90001',
    current_item_code: 'refresh_egs_anticipated',
    current_item_params: { count: 100 },
    errors: [{ item: 'v90002', message: 'failed' }],
    started_at: 100,
    finished_at: null,
    cancelled: false,
    interrupted: false,
    ...overrides,
  };
}

function storedRow(overrides: Record<string, string | number | null> = {}) {
  return {
    id: 'stock-batch:stored',
    label: 'Stored',
    label_code: 'stock_refresh',
    label_params_json: '{"count":3}',
    total: 3,
    done: 2,
    current_item: 'v90003',
    current_item_code: 'refresh_egs_anticipated',
    current_item_params_json: '{"count":100}',
    errors_json: '[]',
    started_at: 200,
    finished_at: null,
    cancelled: 0,
    interrupted: 0,
    ...overrides,
  };
}

describe('PostgreSQL durable stock batch store', () => {
  beforeEach(() => {
    databaseSequence += 1;
    mocks.databaseUrl.value = `postgresql://localhost/stock_batch_${databaseSequence}`;
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.withTransaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
  });

  it('returns zero when no unfinished PostgreSQL rows exist', async () => {
    await expect(markUnfinishedDurableStockBatchJobsInterrupted()).resolves.toBe(0);
    expect(mocks.clientQuery).toHaveBeenCalledOnce();
    expect(mocks.clientQuery.mock.calls[0]?.[0]).toContain('FOR UPDATE');
  });

  it('marks every unfinished PostgreSQL row and preserves valid prior errors', async () => {
    mocks.clientQuery.mockResolvedValueOnce({
      rows: [
        { id: 'job-1', errors_json: '[{"item":"v1","message":"prior"}]' },
        { id: 'job-2', errors_json: '{bad' },
      ],
      rowCount: 2,
    });

    await expect(markUnfinishedDurableStockBatchJobsInterrupted()).resolves.toBe(2);
    expect(mocks.clientQuery).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(mocks.clientQuery.mock.calls[1]?.[1]?.[0]))).toEqual([
      { item: 'v1', message: 'prior' },
      { item: 'stock-batch', message: 'Interrupted by server restart' },
    ]);
    expect(mocks.clientQuery.mock.calls[2]?.[1]?.[2]).toBe('job-2');
  });

  it('initializes, upserts, and garbage-collects through PostgreSQL', async () => {
    await upsertDurableStockBatchJob(job(), ['sofmap']);

    const sql = mocks.postgresQuery.mock.calls.map(([text]) => String(text));
    const upsertIndex = sql.findIndex((text) => text.includes('INSERT INTO stock_batch_job'));
    expect(upsertIndex).toBeGreaterThanOrEqual(0);
    expect(sql[upsertIndex]).toContain('$15');
    expect(mocks.postgresQuery.mock.calls[upsertIndex]?.[1]).toEqual([
      'stock-batch:postgres',
      'PostgreSQL stock batch',
      'stock_refresh',
      '{"count":3}',
      3,
      1,
      'v90001',
      'refresh_egs_anticipated',
      '{"count":100}',
      '["sofmap"]',
      '[{"item":"v90002","message":"failed"}]',
      100,
      null,
      0,
      0,
    ]);
    expect(sql.filter((text) => text.includes('DELETE FROM stock_batch_job'))).toHaveLength(4);
  });

  it('reads PostgreSQL rows and reuses initialization for the same database URL', async () => {
    mocks.postgresQuery.mockImplementation(async (sql: string) => sql.includes('SELECT id, label')
      ? { rows: [storedRow()], rowCount: 1 }
      : { rows: [], rowCount: 0 });

    await expect(listDurableStockBatchJobs()).resolves.toEqual([expect.objectContaining({
      id: 'stock-batch:stored',
      label_code: 'stock_refresh',
      label_params: { count: 3 },
      current_item_code: 'refresh_egs_anticipated',
      current_item_params: { count: 100 },
      done: 2,
    })]);
    const initializationTransactions = mocks.withTransaction.mock.calls.length;
    await listDurableStockBatchJobs();
    expect(mocks.withTransaction).toHaveBeenCalledTimes(initializationTransactions);
    expect(mocks.postgresQuery.mock.calls.some(([sql, values]) => String(sql).includes('LIMIT $1') && values?.[0] === 200)).toBe(true);
  });
});
