import type { QueryResultRow } from 'pg';
import { readDatabaseConfig, type DatabaseBackend } from './db/postgres-config';

/** Provider-neutral column metadata rendered by the schema browser. */
export interface LocalColumnInfo {
  /** Database column name. */
  name: string;
  /** Provider-reported SQL type. */
  type: string;
  /** One when the column rejects null, otherwise zero. */
  notnull: number;
  /** One when the column belongs to the primary key, otherwise zero. */
  pk: number;
  /** SQL default expression, when defined. */
  dflt_value: string | null;
}

/** Provider-neutral table metadata rendered by the schema browser. */
export interface LocalTableInfo {
  /** User-defined table name. */
  name: string;
  /** Columns in database ordinal order. */
  columns: LocalColumnInfo[];
}

/** Non-sensitive PostgreSQL pool counters. */
export interface DatabasePoolSnapshot {
  /** Configured maximum pool size. */
  max: number;
  /** Open clients, including idle clients. */
  total: number;
  /** Currently idle clients. */
  idle: number;
  /** Requests waiting for a client. */
  waiting: number;
}

/** Complete provider-neutral schema/health payload for the schema page. */
export interface DatabaseSchemaSnapshot {
  /** Active persistence backend. */
  backend: DatabaseBackend;
  /** Most recent PostgreSQL migration version, or null for SQLite. */
  migrationVersion: string | null;
  /** PostgreSQL pool counters, or null for SQLite. */
  pool: DatabasePoolSnapshot | null;
  /** User-defined tables and normalized columns. */
  tables: LocalTableInfo[];
}

interface PostgresColumnRow extends QueryResultRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  is_primary_key: boolean;
}

interface MigrationVersionRow extends QueryResultRow {
  version: string;
}

async function listSqliteSchema(): Promise<LocalTableInfo[]> {
  const { db } = await import('./db');
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ name: string }>;
  return tables.map((table) => ({
    name: table.name,
    columns: db.prepare(`PRAGMA table_info("${table.name.replace(/"/g, '""')}")`).all() as LocalColumnInfo[],
  }));
}

async function postgresSchemaSnapshot(): Promise<DatabaseSchemaSnapshot> {
  const { getPostgresPoolStatus, postgresQuery } = await import('./db/postgres');
  const columns = await postgresQuery<PostgresColumnRow>(`
    SELECT
      column_definition.table_name,
      column_definition.column_name,
      column_definition.data_type,
      column_definition.is_nullable,
      column_definition.column_default,
      EXISTS (
        SELECT 1
        FROM information_schema.table_constraints constraint_definition
        JOIN information_schema.key_column_usage key_column
          ON key_column.constraint_schema = constraint_definition.constraint_schema
         AND key_column.constraint_name = constraint_definition.constraint_name
         AND key_column.table_name = constraint_definition.table_name
        WHERE constraint_definition.constraint_type = 'PRIMARY KEY'
          AND constraint_definition.table_schema = column_definition.table_schema
          AND constraint_definition.table_name = column_definition.table_name
          AND key_column.column_name = column_definition.column_name
      ) AS is_primary_key
    FROM information_schema.columns column_definition
    WHERE column_definition.table_schema = current_schema()
    ORDER BY LOWER(column_definition.table_name), column_definition.ordinal_position
  `);
  const versions = await postgresQuery<MigrationVersionRow>(
    'SELECT version FROM schema_migration ORDER BY version DESC LIMIT 1',
  );
  const tables = new Map<string, LocalColumnInfo[]>();
  for (const column of columns.rows) {
    const tableColumns = tables.get(column.table_name) ?? [];
    tableColumns.push({
      name: column.column_name,
      type: column.data_type,
      notnull: column.is_nullable === 'NO' ? 1 : 0,
      pk: column.is_primary_key ? 1 : 0,
      dflt_value: column.column_default,
    });
    tables.set(column.table_name, tableColumns);
  }
  return {
    backend: 'postgres',
    migrationVersion: versions.rows[0]?.version ?? null,
    pool: getPostgresPoolStatus(),
    tables: Array.from(tables, ([name, tableColumns]) => ({ name, columns: tableColumns })),
  };
}

/**
 * Enumerate the active database schema and non-sensitive runtime health.
 *
 * @returns Provider-neutral metadata for SQLite or PostgreSQL.
 */
export async function getDatabaseSchemaSnapshot(): Promise<DatabaseSchemaSnapshot> {
  if (readDatabaseConfig().backend === 'postgres') return postgresSchemaSnapshot();
  return {
    backend: 'sqlite',
    migrationVersion: null,
    pool: null,
    tables: await listSqliteSchema(),
  };
}

/**
 * Enumerate SQLite user tables for compatibility with schema tooling.
 *
 * @returns SQLite tables and normalized columns.
 */
export async function listLocalSqliteSchema(): Promise<LocalTableInfo[]> {
  return listSqliteSchema();
}
