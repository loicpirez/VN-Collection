import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseConfig } from '@/lib/db/postgres-config';

const mocks = vi.hoisted(() => ({
  config: { value: { backend: 'sqlite' as const, path: './test.db' } as DatabaseConfig },
  readDatabaseConfig: vi.fn(),
  sqliteGet: vi.fn(),
  postgresQuery: vi.fn(),
  poolStatus: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: mocks.readDatabaseConfig,
}));

vi.mock('@/lib/db', () => ({
  db: { prepare: () => ({ get: mocks.sqliteGet }) },
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  getPostgresPoolStatus: mocks.poolStatus,
}));

import { GET } from '@/app/api/health/route';

const request = (check?: string): Request => new Request(`http://localhost/api/health${check ? `?check=${check}` : ''}`);

describe('database health route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.value = { backend: 'sqlite', path: './test.db' };
    mocks.readDatabaseConfig.mockImplementation(() => mocks.config.value);
    mocks.sqliteGet.mockReturnValue({ ready: 1 });
    mocks.postgresQuery.mockResolvedValue({ rows: [{ ready: 1 }], rowCount: 1 });
    mocks.poolStatus.mockReturnValue({ max: 10, total: 2, idle: 1, waiting: 0 });
  });

  it('reports liveness without reading database configuration', async () => {
    const response = await GET(request('live'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', check: 'live' });
    expect(mocks.readDatabaseConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown health-check mode', async () => {
    const response = await GET(request('deep'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 'error', check: 'invalid', code: 'invalid_health_check' });
  });

  it('reports default SQLite readiness', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok', check: 'ready', backend: 'sqlite', database: 'available',
    });
    expect(mocks.sqliteGet).toHaveBeenCalledOnce();
  });

  it('reports PostgreSQL readiness and non-sensitive pool utilization', async () => {
    mocks.config.value = {
      backend: 'postgres', url: 'postgresql://localhost/test', poolMax: 10,
      idleTimeoutMs: 30_000, connectionTimeoutMs: 5_000, statementTimeoutMs: 30_000,
      lockTimeoutMs: 5_000, sslMode: 'disable', applicationName: 'test-app',
    };
    const response = await GET(request('ready'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok', check: 'ready', backend: 'postgres', database: 'available',
      pool: { max: 10, total: 2, idle: 1, waiting: 0 },
    });
    expect(mocks.postgresQuery).toHaveBeenCalledWith('SELECT 1 AS ready');
  });

  it('fails closed without exposing configuration or driver errors', async () => {
    mocks.sqliteGet.mockImplementationOnce(() => {
      throw new Error('SELECT secret FROM local_table');
    });
    const sqliteResponse = await GET(request());
    expect(sqliteResponse.status).toBe(503);
    expect(await sqliteResponse.json()).toEqual({
      status: 'unavailable', check: 'ready', backend: 'sqlite', code: 'database_unavailable',
    });

    mocks.readDatabaseConfig.mockImplementationOnce(() => {
      throw new Error('postgresql://user:password@private-host/database');
    });
    const configResponse = await GET(request());
    expect(configResponse.status).toBe(503);
    expect(await configResponse.json()).toEqual({
      status: 'unavailable', check: 'ready', code: 'database_unavailable',
    });
  });
});
