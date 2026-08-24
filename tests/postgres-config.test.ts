import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isReadOnlyDatabaseConfig,
  isSqliteDatabaseConfig,
  readDatabaseConfig,
} from '@/lib/db/postgres-config';
import { parsePostgresBigInt } from '@/lib/db/postgres';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readDatabaseConfig', () => {
  it('defaults to the local SQLite file and accepts an explicit path', () => {
    expect(readDatabaseConfig({})).toEqual({ backend: 'sqlite', path: './data/collection.db' });
    expect(readDatabaseConfig({ DATABASE_BACKEND: 'SQLITE', DB_PATH: ' custom.db ' })).toEqual({ backend: 'sqlite', path: 'custom.db' });
  });

  it('exposes an explicit read-only SQLite compatibility mode', () => {
    const config = readDatabaseConfig({
      DATABASE_BACKEND: 'SQLITE-READONLY',
      DB_PATH: ' source.db ',
    });
    expect(config).toEqual({ backend: 'sqlite-readonly', path: 'source.db' });
    expect(isSqliteDatabaseConfig(config)).toBe(true);
    expect(isReadOnlyDatabaseConfig(config)).toBe(true);
    expect(isReadOnlyDatabaseConfig(readDatabaseConfig({}))).toBe(false);
    expect(isSqliteDatabaseConfig(readDatabaseConfig({
      DATABASE_BACKEND: 'postgres',
      DATABASE_URL: 'postgres://localhost/database',
    }))).toBe(false);
  });

  it('returns a bounded PostgreSQL configuration', () => {
    expect(readDatabaseConfig({
      DATABASE_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://user:secret@localhost:5432/vndb_collection',
      DATABASE_POOL_MAX: '12',
      DATABASE_IDLE_TIMEOUT_MS: '40000',
      DATABASE_CONNECTION_TIMEOUT_MS: '6000',
      DATABASE_STATEMENT_TIMEOUT_MS: '45000',
      DATABASE_LOCK_TIMEOUT_MS: '7000',
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_APPLICATION_NAME: 'vndb-test',
    })).toEqual({
      backend: 'postgres',
      url: 'postgresql://user:secret@localhost:5432/vndb_collection',
      poolMax: 12,
      idleTimeoutMs: 40000,
      connectionTimeoutMs: 6000,
      statementTimeoutMs: 45000,
      lockTimeoutMs: 7000,
      sslMode: 'verify-full',
      applicationName: 'vndb-test',
    });
  });

  it('applies PostgreSQL defaults and accepts the postgres protocol', () => {
    const config = readDatabaseConfig({ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgres://localhost/database' });
    expect(config).toMatchObject({
      poolMax: 10,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
      statementTimeoutMs: 30000,
      lockTimeoutMs: 5000,
      sslMode: 'disable',
      applicationName: 'vndb-collection',
    });
  });

  it.each([
    [{ DATABASE_BACKEND: 'other' }, 'DATABASE_BACKEND'],
    [{ DATABASE_BACKEND: 'postgres' }, 'DATABASE_URL is required'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'not a url' }, 'valid PostgreSQL URL'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'https://localhost/db' }, 'postgres or postgresql'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgres://localhost' }, 'host and database'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgres://localhost/db', DATABASE_SSL_MODE: 'maybe' }, 'DATABASE_SSL_MODE'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgres://localhost/db', DATABASE_POOL_MAX: '2.5' }, 'must be an integer'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgres://localhost/db', DATABASE_POOL_MAX: '0' }, 'between 1 and 100'],
    [{ DATABASE_BACKEND: 'postgres', DATABASE_URL: 'postgres://localhost/db', DATABASE_APPLICATION_NAME: 'x'.repeat(64) }, 'at most 63'],
  ])('rejects invalid configuration %#', (environment, message) => {
    expect(() => readDatabaseConfig(environment)).toThrow(message);
  });
});

describe('PostgreSQL integer decoding', () => {
  it('preserves safe positive and negative integer values', () => {
    expect(parsePostgresBigInt('0')).toBe(0);
    expect(parsePostgresBigInt('1700000000000')).toBe(1_700_000_000_000);
    expect(parsePostgresBigInt('-42')).toBe(-42);
  });

  it('rejects malformed and unsafe values instead of rounding', () => {
    expect(() => parsePostgresBigInt('1.5')).toThrow('Invalid PostgreSQL BIGINT');
    expect(() => parsePostgresBigInt('not-a-number')).toThrow('Invalid PostgreSQL BIGINT');
    expect(() => parsePostgresBigInt('9007199254740992')).toThrow('exceeds JavaScript safe integer range');
  });
});
