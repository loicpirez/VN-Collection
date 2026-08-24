import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { PostgresParameter } from './postgres';

const MIGRATION_NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const MIGRATION_LOCK_NAME = 'vndb-collection:postgres-migrations';

/** One ordered PostgreSQL migration loaded from disk. */
export interface PostgresMigrationFile {
  /** Version recorded in `schema_migration`. */
  version: string;
  /** Absolute source path used for diagnostics. */
  path: string;
  /** SQL body without the outer file-level `BEGIN` and `COMMIT`. */
  body: string;
}

/** Result returned by the explicit migration command. */
export interface PostgresMigrationResult {
  /** Versions applied during this invocation. */
  applied: string[];
  /** Versions already present before this invocation. */
  skipped: string[];
}

interface MigrationQueryable {
  query<Row extends QueryResultRow>(text: string, values?: PostgresParameter[]): Promise<QueryResult<Row>>;
}

function defaultMigrationDirectory(): string {
  return join(process.cwd(), 'db', 'postgres', 'migrations');
}

function transactionBody(sql: string, path: string): string {
  const beginMatch = /(?:^|\n)BEGIN;[\t ]*(?:\r?\n|$)/i.exec(sql);
  const commitMatches = Array.from(sql.matchAll(/(?:^|\n)COMMIT;[\t ]*(?:\r?\n|$)/gi));
  const commitMatch = commitMatches.at(-1);
  if (!beginMatch || !commitMatch || commitMatch.index <= beginMatch.index) {
    throw new Error(`PostgreSQL migration ${path} must have one outer BEGIN/COMMIT wrapper`);
  }
  const prefix = sql.slice(0, beginMatch.index).trim();
  if (prefix && prefix.split(/\r?\n/).some((line) => !line.trim().startsWith('--'))) {
    throw new Error(`PostgreSQL migration ${path} has executable SQL before BEGIN`);
  }
  const suffix = sql.slice(commitMatch.index + commitMatch[0].length).trim();
  if (suffix) throw new Error(`PostgreSQL migration ${path} has executable SQL after COMMIT`);
  const bodyStart = beginMatch.index + beginMatch[0].length;
  const body = sql.slice(bodyStart, commitMatch.index).trim();
  if (!body) throw new Error(`PostgreSQL migration ${path} is empty`);
  return body;
}

/**
 * Load and validate migration files in strict numeric order.
 *
 * @param directory Migration directory. Defaults to `db/postgres/migrations`.
 * @returns Ordered migration descriptors with transaction wrappers removed.
 */
export async function listPostgresMigrations(directory = defaultMigrationDirectory()): Promise<PostgresMigrationFile[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) throw new Error(`No PostgreSQL migrations found in ${directory}`);
  const migrations: PostgresMigrationFile[] = [];
  for (const [index, entry] of entries.entries()) {
    const match = MIGRATION_NAME.exec(entry.name);
    if (!match) throw new Error(`Invalid PostgreSQL migration filename: ${entry.name}`);
    const expectedNumber = String(index + 1).padStart(4, '0');
    if (match[1] !== expectedNumber) {
      throw new Error(`Expected PostgreSQL migration ${expectedNumber}_*.sql, found ${entry.name}`);
    }
    const path = join(directory, entry.name);
    const sql = await readFile(path, 'utf8');
    migrations.push({ version: entry.name.slice(0, -4), path, body: transactionBody(sql, path) });
  }
  return migrations;
}

async function appliedVersions(database: MigrationQueryable): Promise<Set<string> | null> {
  const relation = await database.query<{ relation: string | null }>(
    `SELECT to_regclass('schema_migration')::TEXT AS relation`,
  );
  if (relation.rows[0]?.relation == null) return null;
  const result = await database.query<{ version: string }>('SELECT version FROM schema_migration ORDER BY version');
  return new Set(result.rows.map((row) => row.version));
}

/**
 * Fail closed when the connected PostgreSQL schema does not exactly match the
 * ordered migrations shipped with this application build.
 *
 * @param database Pool or transaction-capable query interface.
 * @param migrations Optional preloaded migration list for tests or tooling.
 * @returns Nothing after the schema version set is confirmed current.
 */
export async function assertPostgresSchemaCurrent(
  database: MigrationQueryable,
  migrations?: PostgresMigrationFile[],
): Promise<void> {
  const expected = migrations ?? await listPostgresMigrations();
  const applied = await appliedVersions(database);
  if (!applied) {
    throw new Error('PostgreSQL schema is not initialized; run yarn db:postgres:apply before starting the application');
  }
  const expectedVersions = new Set(expected.map((migration) => migration.version));
  const missing = expected.filter((migration) => !applied.has(migration.version)).map((migration) => migration.version);
  const unexpected = Array.from(applied).filter((version) => !expectedVersions.has(version)).sort();
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `missing=${missing.join(',')}` : '',
      unexpected.length > 0 ? `unexpected=${unexpected.join(',')}` : '',
    ].filter(Boolean).join(' ');
    throw new Error(`PostgreSQL schema version mismatch (${details}); run the reviewed migration command before startup`);
  }
}

async function applyOneMigration(client: PoolClient, migration: PostgresMigrationFile): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(migration.body);
    await client.query(
      `INSERT INTO schema_migration (version, applied_at)
       VALUES ($1, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
       ON CONFLICT (version) DO NOTHING`,
      [migration.version],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Apply pending PostgreSQL migrations explicitly under a process-independent
 * advisory lock. Application startup never calls this function.
 *
 * @param pool PostgreSQL pool created from validated runtime configuration.
 * @param migrations Optional preloaded migration list for tests or tooling.
 * @returns Applied and previously present migration versions.
 */
export async function applyPostgresMigrations(
  pool: Pool,
  migrations?: PostgresMigrationFile[],
): Promise<PostgresMigrationResult> {
  const ordered = migrations ?? await listPostgresMigrations();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  let lockAcquired = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
    lockAcquired = true;
    const current = await appliedVersions(client) ?? new Set<string>();
    for (const migration of ordered) {
      if (current.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }
      await applyOneMigration(client, migration);
      current.add(migration.version);
      applied.push(migration.version);
    }
    await assertPostgresSchemaCurrent(client, ordered);
    return { applied, skipped };
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]);
      }
    } finally {
      client.release();
    }
  }
}
