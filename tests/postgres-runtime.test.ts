import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseConfig, PostgresDatabaseConfig } from '@/lib/db/postgres-config';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  config: {
    value: {
      backend: 'postgres' as const,
      url: 'postgresql://localhost/test',
      poolMax: 8,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 20_000,
      lockTimeoutMs: 4_000,
      sslMode: 'disable' as 'disable' | 'require' | 'verify-full',
      applicationName: 'test-app',
    } as DatabaseConfig,
  },
  poolConnect: vi.fn(),
  poolEnd: vi.fn(),
  poolQuery: vi.fn(),
  Pool: vi.fn(),
  setTypeParser: vi.fn(),
  schemaCheck: vi.fn(),
}));

const client = { query: mocks.clientQuery, release: mocks.clientRelease };
const pool = { connect: mocks.poolConnect, end: mocks.poolEnd, query: mocks.poolQuery };
mocks.Pool.mockImplementation(function MockPool() { return pool; });

vi.mock('pg', () => ({
  Pool: mocks.Pool,
  types: { setTypeParser: mocks.setTypeParser },
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => mocks.config.value,
}));

vi.mock('@/lib/db/migrate', () => ({
  assertPostgresSchemaCurrent: mocks.schemaCheck,
}));

import {
  assertPostgresRuntimeReady,
  closePostgresPool,
  createPostgresPool,
  getPostgresPool,
  getPostgresPoolStatus,
  installPostgresShutdownHooks,
  parsePostgresBigInt,
  postgresQuery,
  withPostgresTransaction,
} from '@/lib/db/postgres';

const baseConfig: PostgresDatabaseConfig = {
  backend: 'postgres',
  url: 'postgresql://localhost/test',
  poolMax: 8,
  idleTimeoutMs: 30_000,
  connectionTimeoutMs: 5_000,
  statementTimeoutMs: 20_000,
  lockTimeoutMs: 4_000,
  sslMode: 'disable',
  applicationName: 'test-app',
};

describe('PostgreSQL pool runtime', () => {
  beforeEach(async () => {
    await closePostgresPool();
    vi.clearAllMocks();
    mocks.Pool.mockImplementation(function MockPool() { return pool; });
    mocks.poolConnect.mockResolvedValue(client);
    mocks.poolEnd.mockResolvedValue(undefined);
    mocks.poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.schemaCheck.mockResolvedValue(undefined);
    mocks.config.value = { ...baseConfig };
  });

  it('parses safe BIGINT values and rejects malformed or unsafe values', () => {
    expect(parsePostgresBigInt('0')).toBe(0);
    expect(parsePostgresBigInt('-9007199254740991')).toBe(Number.MIN_SAFE_INTEGER);
    expect(parsePostgresBigInt('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => parsePostgresBigInt('1.5')).toThrow('Invalid PostgreSQL BIGINT');
    expect(() => parsePostgresBigInt('9007199254740992')).toThrow('exceeds JavaScript safe integer range');
  });

  it('maps every TLS mode into a bounded pg pool configuration', () => {
    createPostgresPool(baseConfig);
    createPostgresPool({ ...baseConfig, sslMode: 'require' });
    createPostgresPool({ ...baseConfig, sslMode: 'verify-full' });

    expect(mocks.Pool.mock.calls[0]?.[0]).toMatchObject({
      connectionString: baseConfig.url,
      max: 8,
      ssl: false,
      application_name: 'test-app',
    });
    expect(mocks.Pool.mock.calls[1]?.[0]).toMatchObject({ ssl: { rejectUnauthorized: false } });
    expect(mocks.Pool.mock.calls[2]?.[0]).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it('rejects SQLite mode and reuses one lazily created pool', async () => {
    mocks.config.value = { backend: 'sqlite', path: './test.db' };
    expect(() => getPostgresPool()).toThrow('DATABASE_BACKEND is not postgres');

    mocks.config.value = { ...baseConfig };
    expect(getPostgresPool()).toBe(pool);
    expect(getPostgresPool()).toBe(pool);
    expect(mocks.Pool).toHaveBeenCalledOnce();

    await closePostgresPool();
    expect(mocks.poolEnd).toHaveBeenCalledOnce();
    await closePostgresPool();
    expect(mocks.poolEnd).toHaveBeenCalledOnce();
  });

  it('reports non-sensitive bounded pool utilization', () => {
    Object.assign(pool, { totalCount: 5, idleCount: 3, waitingCount: 2, options: { max: 8 } });
    expect(getPostgresPoolStatus()).toEqual({ max: 8, total: 5, idle: 3, waiting: 2 });

    Object.assign(pool, { options: {} });
    expect(getPostgresPoolStatus().max).toBe(10);
  });

  it('installs idempotent graceful-shutdown hooks and supports cleanup', async () => {
    const listeners = new Map<string, () => void>();
    const target = {
      once(event: 'SIGTERM' | 'SIGINT', listener: () => void): void {
        listeners.set(event, listener);
      },
      removeListener(event: 'SIGTERM' | 'SIGINT', listener: () => void): void {
        if (listeners.get(event) === listener) listeners.delete(event);
      },
    };
    const cleanup = installPostgresShutdownHooks(target);
    try {
      getPostgresPool();
      const duplicateCleanup = installPostgresShutdownHooks(target);
      expect(listeners.size).toBe(2);
      duplicateCleanup();
      listeners.get('SIGTERM')?.();
      await vi.waitFor(() => expect(mocks.poolEnd).toHaveBeenCalledOnce());
    } finally {
      cleanup();
    }
    expect(listeners.size).toBe(0);
  });

  it('logs a generic message when signal-driven pool shutdown fails', async () => {
    const listeners = new Map<string, () => void>();
    const target = {
      once(event: 'SIGTERM' | 'SIGINT', listener: () => void): void {
        listeners.set(event, listener);
      },
      removeListener(): void {},
    };
    const cleanup = installPostgresShutdownHooks(target);
    getPostgresPool();
    mocks.poolEnd.mockRejectedValueOnce(new Error('sensitive host detail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      listeners.get('SIGINT')?.();
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('[postgres:shutdown] failed to close the connection pool'));
    } finally {
      cleanup();
      errorSpy.mockRestore();
    }
  });

  it('commits successful work and always releases the client', async () => {
    const result = await withPostgresTransaction(async (transactionClient) => {
      expect(transactionClient).toBe(client);
      await transactionClient.query('WORK');
      return 'done';
    });

    expect(result).toBe('done');
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'WORK', 'COMMIT']);
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
  });

  it('rolls back failed work and rethrows the original error', async () => {
    const failure = new Error('transaction failed');
    await expect(withPostgresTransaction(async () => {
      throw failure;
    })).rejects.toBe(failure);

    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
  });

  it('executes typed pool queries with default and explicit parameters', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'v90001' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(postgresQuery<{ id: string }>('SELECT id FROM vn')).resolves.toMatchObject({ rows: [{ id: 'v90001' }] });
    await postgresQuery('SELECT id FROM vn WHERE id = $1', ['v90001']);
    expect(mocks.poolQuery.mock.calls[0]).toEqual(['SELECT id FROM vn', []]);
    expect(mocks.poolQuery.mock.calls[1]).toEqual(['SELECT id FROM vn WHERE id = $1', ['v90001']]);
    expect(mocks.schemaCheck).toHaveBeenCalledOnce();
  });

  it('exposes the coalesced schema readiness contract for application bootstrap', async () => {
    await assertPostgresRuntimeReady();
    await assertPostgresRuntimeReady();
    expect(mocks.schemaCheck).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent schema checks and retries after a failed check', async () => {
    let releaseCheck!: () => void;
    const pendingCheck = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    mocks.schemaCheck.mockReturnValueOnce(pendingCheck);

    const first = postgresQuery('SELECT 1');
    const second = postgresQuery('SELECT 2');
    expect(mocks.schemaCheck).toHaveBeenCalledOnce();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    releaseCheck();
    await Promise.all([first, second]);
    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);

    await closePostgresPool();
    const failure = new Error('schema mismatch');
    mocks.schemaCheck.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    await expect(postgresQuery('SELECT 3')).rejects.toBe(failure);
    await expect(postgresQuery('SELECT 4')).resolves.toMatchObject({ rows: [] });
  });
});
