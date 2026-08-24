import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolConnect: vi.fn(),
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  Pool: vi.fn(),
}));

const client = { query: mocks.clientQuery, release: mocks.clientRelease };
const pool = { connect: mocks.poolConnect, query: mocks.poolQuery };
mocks.Pool.mockImplementation(function MockPool() { return pool; });

vi.mock('pg', () => ({ Pool: mocks.Pool }));

import { Pool } from 'pg';
import {
  applyPostgresMigrations,
  assertPostgresSchemaCurrent,
  listPostgresMigrations,
  type PostgresMigrationFile,
} from '@/lib/db/migrate';

const directories: string[] = [];
const migration = (version: string, body = 'SELECT 1;'): PostgresMigrationFile => ({
  version,
  path: `/migrations/${version}.sql`,
  body,
});

async function migrationDirectory(files: Readonly<Record<string, string>>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'vndb-pg-migrate-'));
  directories.push(directory);
  for (const [name, sql] of Object.entries(files)) await writeFile(join(directory, name), sql, 'utf8');
  return directory;
}

async function defaultMigrationRoot(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vndb-pg-default-migrate-'));
  directories.push(root);
  const directory = join(root, 'db', 'postgres', 'migrations');
  await mkdir(directory, { recursive: true });
  for (const [name, sql] of Object.entries(files)) await writeFile(join(directory, name), sql, 'utf8');
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolConnect.mockResolvedValue(client);
  mocks.poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('PostgreSQL ordered migrations', () => {
  it('loads sequential files and removes only their outer transaction wrappers', async () => {
    const directory = await migrationDirectory({
      '0001_baseline.sql': '-- reviewed\nBEGIN;\nCREATE TABLE first_table (id BIGINT);\nCOMMIT;\n',
      '0002_add_index.sql': 'BEGIN;\nCREATE INDEX second_index ON first_table(id);\nCOMMIT;',
    });
    await mkdir(join(directory, 'archive'));
    await writeFile(join(directory, 'README.txt'), 'reviewed migrations', 'utf8');

    await expect(listPostgresMigrations(directory)).resolves.toEqual([
      expect.objectContaining({ version: '0001_baseline', body: 'CREATE TABLE first_table (id BIGINT);' }),
      expect.objectContaining({ version: '0002_add_index', body: 'CREATE INDEX second_index ON first_table(id);' }),
    ]);
  });

  it('rejects empty, malformed, non-sequential, and non-transactional migration sets', async () => {
    const empty = await migrationDirectory({});
    await expect(listPostgresMigrations(empty)).rejects.toThrow('No PostgreSQL migrations');

    const malformed = await migrationDirectory({ 'bad.sql': 'BEGIN;\nSELECT 1;\nCOMMIT;' });
    await expect(listPostgresMigrations(malformed)).rejects.toThrow('Invalid PostgreSQL migration filename');

    const gap = await migrationDirectory({ '0002_gap.sql': 'BEGIN;\nSELECT 1;\nCOMMIT;' });
    await expect(listPostgresMigrations(gap)).rejects.toThrow('Expected PostgreSQL migration 0001');

    const noWrapper = await migrationDirectory({ '0001_nowrapper.sql': 'SELECT 1;' });
    await expect(listPostgresMigrations(noWrapper)).rejects.toThrow('must have one outer BEGIN/COMMIT wrapper');

    const missingCommit = await migrationDirectory({ '0001_missing_commit.sql': 'BEGIN;\nSELECT 1;' });
    await expect(listPostgresMigrations(missingCommit)).rejects.toThrow('must have one outer BEGIN/COMMIT wrapper');

    const commitBeforeBegin = await migrationDirectory({ '0001_reversed.sql': 'COMMIT;\nBEGIN;\nSELECT 1;' });
    await expect(listPostgresMigrations(commitBeforeBegin)).rejects.toThrow('must have one outer BEGIN/COMMIT wrapper');

    const executablePrefix = await migrationDirectory({ '0001_prefix.sql': 'SELECT 0;\nBEGIN;\nSELECT 1;\nCOMMIT;' });
    await expect(listPostgresMigrations(executablePrefix)).rejects.toThrow('executable SQL before BEGIN');

    const executableSuffix = await migrationDirectory({ '0001_suffix.sql': 'BEGIN;\nSELECT 1;\nCOMMIT;\nSELECT 2;' });
    await expect(listPostgresMigrations(executableSuffix)).rejects.toThrow('executable SQL after COMMIT');

    const emptyBody = await migrationDirectory({ '0001_empty.sql': 'BEGIN;\nCOMMIT;' });
    await expect(listPostgresMigrations(emptyBody)).rejects.toThrow('is empty');
  });

  it('validates an exact schema version set and rejects absent or mismatched schemas', async () => {
    const expected = [migration('0001_baseline'), migration('0002_index')];
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ relation: null }], rowCount: 1 });
    await expect(assertPostgresSchemaCurrent(new Pool(), expected)).rejects.toThrow('schema is not initialized');

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ relation: 'schema_migration' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ version: '0001_baseline' }, { version: '0002_index' }], rowCount: 2 });
    await expect(assertPostgresSchemaCurrent(new Pool(), expected)).resolves.toBeUndefined();

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ relation: 'schema_migration' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ version: '0001_baseline' }, { version: '0003_future' }], rowCount: 2 });
    await expect(assertPostgresSchemaCurrent(new Pool(), expected)).rejects.toThrow('missing=0002_index unexpected=0003_future');

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ relation: 'schema_migration' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ version: '0001_baseline' }], rowCount: 1 });
    await expect(assertPostgresSchemaCurrent(new Pool(), expected)).rejects.toThrow('missing=0002_index');

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ relation: 'schema_migration' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ version: '0001_baseline' }, { version: '0003_future' }], rowCount: 2 });
    await expect(assertPostgresSchemaCurrent(new Pool(), [expected[0]!])).rejects.toThrow('unexpected=0003_future');

    mocks.poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(assertPostgresSchemaCurrent(new Pool(), expected)).rejects.toThrow('schema is not initialized');
  });

  it('uses the reviewed default migration directory for validation and explicit application', async () => {
    const root = await defaultMigrationRoot({
      '0001_baseline.sql': 'BEGIN;\nCREATE TABLE schema_migration (version TEXT PRIMARY KEY);\nCOMMIT;',
    });
    const previousDirectory = process.cwd();
    process.chdir(root);
    try {
      mocks.poolQuery
        .mockResolvedValueOnce({ rows: [{ relation: 'schema_migration' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ version: '0001_baseline' }], rowCount: 1 });
      await expect(assertPostgresSchemaCurrent(new Pool())).resolves.toBeUndefined();

      mocks.clientQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('to_regclass')) return { rows: [{ relation: 'schema_migration' }], rowCount: 1 };
        if (sql.startsWith('SELECT version')) return { rows: [{ version: '0001_baseline' }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });
      await expect(applyPostgresMigrations(new Pool())).resolves.toEqual({
        applied: [],
        skipped: ['0001_baseline'],
      });
    } finally {
      process.chdir(previousDirectory);
    }
  });

  it('applies pending migrations atomically, skips existing versions, and releases the lock client', async () => {
    const versions = new Set(['0001_baseline']);
    mocks.clientQuery.mockImplementation(async (sql: string, values?: string[]) => {
      if (sql.includes('to_regclass')) return { rows: [{ relation: 'schema_migration' }], rowCount: 1 };
      if (sql.startsWith('SELECT version')) {
        return { rows: Array.from(versions).sort().map((version) => ({ version })), rowCount: versions.size };
      }
      if (sql.includes('INSERT INTO schema_migration')) versions.add(values?.[0] ?? '');
      return { rows: [], rowCount: 0 };
    });

    await expect(applyPostgresMigrations(new Pool(), [
      migration('0001_baseline'),
      migration('0002_index', 'CREATE INDEX test_index ON test_table(id);'),
    ])).resolves.toEqual({ applied: ['0002_index'], skipped: ['0001_baseline'] });

    const sql = mocks.clientQuery.mock.calls.map(([text]) => text);
    expect(sql).toContain('BEGIN');
    expect(sql).toContain('CREATE INDEX test_index ON test_table(id);');
    expect(sql).toContain('COMMIT');
    expect(sql.some((text) => String(text).includes('pg_advisory_unlock'))).toBe(true);
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
  });

  it('rolls back a failed migration, unlocks, releases, and preserves the original error', async () => {
    const failure = new Error('migration failed');
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ relation: null }], rowCount: 1 };
      if (sql === 'BROKEN SQL') throw failure;
      return { rows: [], rowCount: 0 };
    });

    await expect(applyPostgresMigrations(new Pool(), [migration('0001_baseline', 'BROKEN SQL')])).rejects.toBe(failure);
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('pg_advisory_unlock'))).toBe(true);
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
  });

  it('releases the client when lock acquisition fails and when unlock fails', async () => {
    const lockFailure = new Error('lock failed');
    mocks.clientQuery.mockRejectedValueOnce(lockFailure);
    await expect(applyPostgresMigrations(new Pool(), [migration('0001_baseline')])).rejects.toBe(lockFailure);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('pg_advisory_unlock'))).toBe(false);
    expect(mocks.clientRelease).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    mocks.poolConnect.mockResolvedValue(client);
    const unlockFailure = new Error('unlock failed');
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_unlock')) throw unlockFailure;
      if (sql.includes('to_regclass')) return { rows: [{ relation: 'schema_migration' }], rowCount: 1 };
      if (sql.startsWith('SELECT version')) return { rows: [{ version: '0001_baseline' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(applyPostgresMigrations(new Pool(), [migration('0001_baseline')])).rejects.toBe(unlockFailure);
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
  });

  it('does not attempt a lock or release when the pool cannot provide a client', async () => {
    const connectionFailure = new Error('connection failed');
    mocks.poolConnect.mockRejectedValueOnce(connectionFailure);

    await expect(applyPostgresMigrations(new Pool(), [migration('0001_baseline')])).rejects.toBe(connectionFailure);
    expect(mocks.clientQuery).not.toHaveBeenCalled();
    expect(mocks.clientRelease).not.toHaveBeenCalled();
  });
});
