import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseConfig } from '@/lib/db/postgres-config';

const mocks = vi.hoisted(() => ({
  config: { value: { backend: 'postgres' } as DatabaseConfig },
  postgresQuery: vi.fn(),
  poolStatus: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => mocks.config.value,
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  getPostgresPoolStatus: mocks.poolStatus,
}));

import { getDatabaseSchemaSnapshot } from '@/lib/schema-local';

describe('provider-neutral PostgreSQL schema snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.value = {
      backend: 'postgres',
      url: 'postgresql://localhost/test',
      poolMax: 10,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 30_000,
      lockTimeoutMs: 5_000,
      sslMode: 'disable',
      applicationName: 'test-app',
    };
    mocks.poolStatus.mockReturnValue({ max: 10, total: 2, idle: 1, waiting: 0 });
  });

  it('normalizes PostgreSQL columns, primary keys, migration, and pool counters', async () => {
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [
        {
          table_name: 'collection', column_name: 'vn_id', data_type: 'text',
          is_nullable: 'NO', column_default: null, is_primary_key: true,
        },
        {
          table_name: 'collection', column_name: 'notes', data_type: 'text',
          is_nullable: 'YES', column_default: "''::text", is_primary_key: false,
        },
        {
          table_name: 'vn', column_name: 'id', data_type: 'text',
          is_nullable: 'NO', column_default: null, is_primary_key: true,
        },
      ], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [{ version: '0001_baseline' }], rowCount: 1 });

    await expect(getDatabaseSchemaSnapshot()).resolves.toEqual({
      backend: 'postgres',
      migrationVersion: '0001_baseline',
      pool: { max: 10, total: 2, idle: 1, waiting: 0 },
      tables: [
        { name: 'collection', columns: [
          { name: 'vn_id', type: 'text', notnull: 1, pk: 1, dflt_value: null },
          { name: 'notes', type: 'text', notnull: 0, pk: 0, dflt_value: "''::text" },
        ] },
        { name: 'vn', columns: [
          { name: 'id', type: 'text', notnull: 1, pk: 1, dflt_value: null },
        ] },
      ],
    });
  });

  it('reports a missing migration marker without inventing a version', async () => {
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const snapshot = await getDatabaseSchemaSnapshot();
    expect(snapshot.migrationVersion).toBeNull();
    expect(snapshot.tables).toEqual([]);
  });
});
