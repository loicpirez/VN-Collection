import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseConfig } from '@/lib/db/postgres-config';

const mocks = vi.hoisted(() => ({
  config: { value: { backend: 'sqlite' as const, path: './test.db' } as DatabaseConfig },
  readDatabaseConfig: vi.fn(),
  assertPostgresRuntimeReady: vi.fn(),
  installPostgresShutdownHooks: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: mocks.readDatabaseConfig,
}));

vi.mock('@/lib/db/postgres', () => ({
  assertPostgresRuntimeReady: mocks.assertPostgresRuntimeReady,
  installPostgresShutdownHooks: mocks.installPostgresShutdownHooks,
}));

import { register } from '@/instrumentation';

describe('Next.js database instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.value = { backend: 'sqlite', path: './test.db' };
    mocks.readDatabaseConfig.mockImplementation(() => mocks.config.value);
    mocks.assertPostgresRuntimeReady.mockResolvedValue(undefined);
    mocks.installPostgresShutdownHooks.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing outside the Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(mocks.readDatabaseConfig).not.toHaveBeenCalled();
  });

  it('keeps SQLite startup unchanged', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(mocks.readDatabaseConfig).toHaveBeenCalledOnce();
    expect(mocks.assertPostgresRuntimeReady).not.toHaveBeenCalled();
  });

  it('blocks PostgreSQL startup until the migration version is current', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    mocks.config.value = {
      backend: 'postgres',
      url: 'postgresql://localhost/test',
      poolMax: 8,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 30_000,
      lockTimeoutMs: 5_000,
      sslMode: 'disable',
      applicationName: 'test-app',
    };
    const mismatch = new Error('schema version mismatch');
    mocks.assertPostgresRuntimeReady.mockRejectedValueOnce(mismatch);

    await expect(register()).rejects.toBe(mismatch);
    expect(mocks.installPostgresShutdownHooks).toHaveBeenCalledOnce();
    expect(mocks.assertPostgresRuntimeReady).toHaveBeenCalledOnce();
  });
});
