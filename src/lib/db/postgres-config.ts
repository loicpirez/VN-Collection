/** Supported persistence backends during the controlled PostgreSQL cutover. */
export type DatabaseBackend = 'sqlite' | 'sqlite-readonly' | 'postgres';

/** TLS policy accepted by the PostgreSQL pool. */
export type PostgresSslMode = 'disable' | 'require' | 'verify-full';

/** Validated SQLite runtime configuration. */
export interface SqliteDatabaseConfig {
  backend: 'sqlite';
  path: string;
}

/** Validated read-only SQLite compatibility configuration. */
export interface ReadOnlySqliteDatabaseConfig {
  backend: 'sqlite-readonly';
  path: string;
}

/** Validated PostgreSQL runtime and pool configuration. */
export interface PostgresDatabaseConfig {
  backend: 'postgres';
  url: string;
  poolMax: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  sslMode: PostgresSslMode;
  applicationName: string;
}

/** Fully validated persistence configuration. */
export type DatabaseConfig = SqliteDatabaseConfig | ReadOnlySqliteDatabaseConfig | PostgresDatabaseConfig;

/** Environment-shaped input accepted by the configuration decoder. */
export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Report whether a validated configuration targets a SQLite file.
 *
 * @param config Validated persistence configuration.
 * @returns True for writable and read-only SQLite modes.
 */
export function isSqliteDatabaseConfig(
  config: DatabaseConfig,
): config is SqliteDatabaseConfig | ReadOnlySqliteDatabaseConfig {
  return config.backend === 'sqlite' || config.backend === 'sqlite-readonly';
}

/**
 * Report whether the configured database must reject application writes.
 *
 * @param config Validated persistence configuration.
 * @returns True only for the read-only SQLite compatibility mode.
 */
export function isReadOnlyDatabaseConfig(config: DatabaseConfig): config is ReadOnlySqliteDatabaseConfig {
  return config.backend === 'sqlite-readonly';
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function postgresUrl(raw: string | undefined): string {
  if (!raw) throw new Error('DATABASE_URL is required when DATABASE_BACKEND=postgres');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must include a host and database name');
  }
  return raw;
}

/**
 * Read and validate database configuration from a supplied environment map.
 *
 * @param environment Process-like environment values. Defaults to `process.env`.
 * @returns A discriminated, validated backend configuration.
 */
export function readDatabaseConfig(environment: DatabaseEnvironment = process.env): DatabaseConfig {
  const backend = environment.DATABASE_BACKEND?.trim().toLowerCase() || 'sqlite';
  if (backend === 'sqlite' || backend === 'sqlite-readonly') {
    return { backend, path: environment.DB_PATH?.trim() || './data/collection.db' };
  }
  if (backend !== 'postgres') {
    throw new Error('DATABASE_BACKEND must be sqlite, sqlite-readonly, or postgres');
  }
  const sslMode = environment.DATABASE_SSL_MODE?.trim().toLowerCase() || 'disable';
  if (sslMode !== 'disable' && sslMode !== 'require' && sslMode !== 'verify-full') {
    throw new Error('DATABASE_SSL_MODE must be disable, require, or verify-full');
  }
  const applicationName = environment.DATABASE_APPLICATION_NAME?.trim() || 'vndb-collection';
  if (applicationName.length > 63) throw new Error('DATABASE_APPLICATION_NAME must be at most 63 characters');
  return {
    backend,
    url: postgresUrl(environment.DATABASE_URL),
    poolMax: boundedInteger(environment.DATABASE_POOL_MAX, 10, 1, 100, 'DATABASE_POOL_MAX'),
    idleTimeoutMs: boundedInteger(environment.DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000, 'DATABASE_IDLE_TIMEOUT_MS'),
    connectionTimeoutMs: boundedInteger(environment.DATABASE_CONNECTION_TIMEOUT_MS, 5_000, 100, 120_000, 'DATABASE_CONNECTION_TIMEOUT_MS'),
    statementTimeoutMs: boundedInteger(environment.DATABASE_STATEMENT_TIMEOUT_MS, 30_000, 100, 600_000, 'DATABASE_STATEMENT_TIMEOUT_MS'),
    lockTimeoutMs: boundedInteger(environment.DATABASE_LOCK_TIMEOUT_MS, 5_000, 100, 120_000, 'DATABASE_LOCK_TIMEOUT_MS'),
    sslMode,
    applicationName,
  };
}
