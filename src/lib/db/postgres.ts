import { Pool, types, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { readDatabaseConfig, type PostgresDatabaseConfig } from './postgres-config';
import { assertPostgresSchemaCurrent } from './migrate';

let sharedPool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let shutdownHooksInstalled = false;

/** Signals used to start graceful PostgreSQL pool shutdown. */
export type PostgresShutdownSignal = 'SIGTERM' | 'SIGINT';

/** Minimal signal surface accepted by the shutdown-hook installer. */
export interface PostgresSignalTarget {
  /** Register a one-shot listener. */
  once(event: PostgresShutdownSignal, listener: () => void): void;
  /** Remove a previously registered listener. */
  removeListener(event: PostgresShutdownSignal, listener: () => void): void;
}

/** Convert a PostgreSQL `BIGINT` into the existing safe JavaScript number contract. */
export function parsePostgresBigInt(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error(`Invalid PostgreSQL BIGINT: ${value}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`PostgreSQL BIGINT exceeds JavaScript safe integer range: ${value}`);
  return parsed;
}

types.setTypeParser(20, parsePostgresBigInt);

/** Values accepted by parameterized application queries, including PostgreSQL arrays. */
export type PostgresParameter = string | number | boolean | null | readonly string[] | readonly number[];

/** Non-sensitive counters describing the shared PostgreSQL pool. */
export interface PostgresPoolStatus {
  /** Configured maximum number of clients. */
  max: number;
  /** Open clients, including idle clients. */
  total: number;
  /** Open clients currently idle. */
  idle: number;
  /** Requests waiting for an available client. */
  waiting: number;
}

/**
 * Build a bounded PostgreSQL pool from validated configuration.
 *
 * @param config Validated PostgreSQL configuration.
 * @returns An unopened `pg` connection pool.
 */
export function createPostgresPool(config: PostgresDatabaseConfig): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.url,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    lock_timeout: config.lockTimeoutMs,
    application_name: config.applicationName,
    ssl: config.sslMode === 'disable'
      ? false
      : { rejectUnauthorized: config.sslMode === 'verify-full' },
  };
  return new Pool(poolConfig);
}

/**
 * Return the process-wide PostgreSQL pool used by application repositories.
 *
 * @returns The lazily constructed shared pool.
 */
export function getPostgresPool(): Pool {
  if (sharedPool) return sharedPool;
  const config = readDatabaseConfig();
  if (config.backend !== 'postgres') throw new Error('PostgreSQL pool requested while DATABASE_BACKEND is not postgres');
  sharedPool = createPostgresPool(config);
  return sharedPool;
}

/**
 * Read non-sensitive pool counters for health and schema diagnostics.
 *
 * @returns Current bounded-pool utilization without connection details.
 */
export function getPostgresPoolStatus(): PostgresPoolStatus {
  const pool = getPostgresPool();
  return {
    max: pool.options.max ?? 10,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

/** Close and clear the process-wide pool during graceful shutdown or tests. */
export async function closePostgresPool(): Promise<void> {
  const pool = sharedPool;
  sharedPool = null;
  schemaReadyPromise = null;
  if (pool) await pool.end();
}

/**
 * Install idempotent process-signal hooks that begin closing the shared pool.
 * Next.js retains ownership of process exit and its other shutdown work.
 *
 * @param target Process-like signal target, injectable for deterministic tests.
 * @returns A cleanup function that removes this installation's listeners.
 */
export function installPostgresShutdownHooks(target: PostgresSignalTarget = process): () => void {
  if (shutdownHooksInstalled) return () => {};
  shutdownHooksInstalled = true;
  const shutdown = (): void => {
    void closePostgresPool().catch(() => {
      console.error('[postgres:shutdown] failed to close the connection pool');
    });
  };
  target.once('SIGTERM', shutdown);
  target.once('SIGINT', shutdown);
  return () => {
    target.removeListener('SIGTERM', shutdown);
    target.removeListener('SIGINT', shutdown);
    shutdownHooksInstalled = false;
  };
}

async function ensurePostgresSchemaCurrent(pool: Pool): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = assertPostgresSchemaCurrent(pool).catch((error: Error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  await schemaReadyPromise;
}

/**
 * Validate the configured PostgreSQL schema before the application accepts
 * database-backed work. The check is coalesced with repository-level guards.
 *
 * @returns Nothing after the shipped and applied migration versions match.
 */
export async function assertPostgresRuntimeReady(): Promise<void> {
  await ensurePostgresSchemaCurrent(getPostgresPool());
}

/**
 * Execute work in a PostgreSQL transaction with guaranteed rollback/release.
 *
 * @param work Transaction callback receiving the checked-out pool client.
 * @returns The callback result after a successful commit.
 */
export async function withPostgresTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPostgresPool();
  await ensurePostgresSchemaCurrent(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a typed query through the shared application pool.
 *
 * @param text Parameterized SQL text.
 * @param values Scalar bind values.
 * @returns The PostgreSQL query result.
 */
export async function postgresQuery<Row extends QueryResultRow>(
  text: string,
  values: readonly PostgresParameter[] = [],
): Promise<QueryResult<Row>> {
  const pool = getPostgresPool();
  await ensurePostgresSchemaCurrent(pool);
  return pool.query<Row>(text, [...values]);
}
