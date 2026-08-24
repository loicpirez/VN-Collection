import Database from 'better-sqlite3';
import { Pool, type PoolClient } from 'pg';
import {
  POSTGRES_TABLE_ORDER,
  quotePostgresIdentifier,
  type PostgresMigrationTable,
} from '../src/lib/db/postgres-migration-manifest';
import {
  preparePostgresJsonRow,
  type PostgresJsonQuarantineValue,
  type PostgresMigrationRow,
} from '../src/lib/db/postgres-json-policy';

type SqliteValue = string | number | bigint | Buffer | null;
interface SqliteRow { [column: string]: SqliteValue }
interface SqliteColumn { name: string }
interface CountRow { count: string }
interface SequenceRow { sequence_name: string | null }

interface MigrationOptions {
  sqlitePath: string;
  postgresUrl: string;
  batchSize: number;
  replace: boolean;
}

interface TableReport {
  table: string;
  sourceRows: number;
  destinationRows: number;
  insertedRows: number;
  quarantinedValues: number;
  skipped: boolean;
  durationMs: number;
}

function sourceRowid(row: SqliteRow): number {
  const value = row.__migration_source_rowid;
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid SQLite source rowid: ${String(value)}`);
  }
  return parsed;
}

async function writeJsonQuarantine(
  client: PoolClient,
  values: readonly PostgresJsonQuarantineValue[],
): Promise<void> {
  const quarantinedAt = Date.now();
  for (const value of values) {
    await client.query(`
      INSERT INTO postgres_json_quarantine (
        table_name, column_name, source_rowid, raw_kind, raw_value, quarantined_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(table_name, column_name, source_rowid) DO UPDATE SET
        raw_kind = EXCLUDED.raw_kind,
        raw_value = EXCLUDED.raw_value,
        quarantined_at = EXCLUDED.quarantined_at
    `, [value.table, value.column, value.sourceRowid, value.rawKind, value.rawValue, quarantinedAt]);
  }
}

function requiredValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseOptions(args: readonly string[]): MigrationOptions {
  let sqlitePath = '';
  let postgresUrl = '';
  let batchSize = 250;
  let replace = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--sqlite') {
      sqlitePath = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '--postgres') {
      postgresUrl = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '--batch-size') {
      const raw = requiredValue(args, index, arg);
      if (!/^\d+$/.test(raw)) throw new Error('--batch-size must be an integer');
      batchSize = Number(raw);
      if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
        throw new Error('--batch-size must be between 1 and 1000');
      }
      index += 1;
    } else if (arg === '--replace') {
      replace = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!sqlitePath) throw new Error('--sqlite is required');
  if (!postgresUrl) throw new Error('--postgres is required');
  const parsed = new URL(postgresUrl);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('--postgres must use a PostgreSQL URL');
  }
  return { sqlitePath, postgresUrl, batchSize, replace };
}

function sourceTables(source: Database.Database): Set<string> {
  const rows = source.prepare<[], { name: string }>(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all();
  return new Set(rows.map((row) => row.name));
}

function sourceColumns(source: Database.Database, table: string): string[] {
  return source.prepare<[], SqliteColumn>(`PRAGMA table_info(${quotePostgresIdentifier(table)})`)
    .all()
    .map((column) => column.name);
}

async function destinationColumns(client: PoolClient, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return result.rows.map((row) => row.column_name);
}

async function rowCount(client: PoolClient, table: string): Promise<number> {
  const result = await client.query<CountRow>(`SELECT COUNT(*)::text AS count FROM ${quotePostgresIdentifier(table)}`);
  return Number(result.rows[0]?.count ?? '0');
}

function sourceRowCount(source: Database.Database, table: string): number {
  return source.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM ${quotePostgresIdentifier(table)}`).get()?.count ?? 0;
}

function insertionSql(table: string, columns: readonly string[], rows: number): string {
  const quotedColumns = columns.map(quotePostgresIdentifier).join(', ');
  const values = Array.from({ length: rows }, (_row, rowIndex) => {
    const placeholders = columns.map((_column, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    return `(${placeholders.join(', ')})`;
  });
  return `INSERT INTO ${quotePostgresIdentifier(table)} (${quotedColumns}) VALUES ${values.join(', ')}`;
}

async function resetIdentity(client: PoolClient, table: string, columns: readonly string[]): Promise<void> {
  if (!columns.includes('id')) return;
  const result = await client.query<SequenceRow>(`SELECT pg_get_serial_sequence($1, 'id') AS sequence_name`, [table]);
  const sequenceName = result.rows[0]?.sequence_name;
  if (!sequenceName) return;
  await client.query(`SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ${quotePostgresIdentifier(table)}), 1), (SELECT COUNT(*) > 0 FROM ${quotePostgresIdentifier(table)}))`, [sequenceName]);
}

async function migrateTable(
  source: Database.Database,
  client: PoolClient,
  table: PostgresMigrationTable,
  batchSize: number,
): Promise<TableReport> {
  const startedAt = Date.now();
  const sourceCount = sourceRowCount(source, table);
  const sourceColumnNames = sourceColumns(source, table);
  const destinationColumnNames = await destinationColumns(client, table);
  const missing = sourceColumnNames.filter((column) => !destinationColumnNames.includes(column));
  if (missing.length > 0) throw new Error(`${table}: destination is missing columns ${missing.join(', ')}`);
  const existingCount = await rowCount(client, table);
  if (existingCount > 0) throw new Error(`${table}: destination already contains ${existingCount} rows`);
  await client.query('DELETE FROM postgres_json_quarantine WHERE table_name = $1', [table]);
  let insertedRows = 0;
  let quarantinedValues = 0;
  const safeBatchSize = Math.max(1, Math.min(batchSize, Math.floor(60_000 / Math.max(1, sourceColumnNames.length))));
  const statement = source.prepare<[], SqliteRow>(`
    SELECT rowid AS __migration_source_rowid, * FROM ${quotePostgresIdentifier(table)}
  `).iterate();
  let batch: SqliteRow[] = [];
  let quarantineBatch: PostgresJsonQuarantineValue[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const values = batch.flatMap((entry) => sourceColumnNames.map((column) => entry[column] ?? null));
    await client.query(insertionSql(table, sourceColumnNames, batch.length), values);
    await writeJsonQuarantine(client, quarantineBatch);
    insertedRows += batch.length;
    quarantinedValues += quarantineBatch.length;
    batch = [];
    quarantineBatch = [];
  };
  for (const sourceRow of statement) {
    const rowid = sourceRowid(sourceRow);
    const row: PostgresMigrationRow = { ...sourceRow };
    delete row.__migration_source_rowid;
    const prepared = preparePostgresJsonRow(table, row, rowid);
    batch.push(prepared.row);
    quarantineBatch.push(...prepared.quarantine);
    if (batch.length < safeBatchSize) continue;
    await flush();
  }
  await flush();
  await resetIdentity(client, table, destinationColumnNames);
  const destinationCount = await rowCount(client, table);
  if (sourceCount !== destinationCount || insertedRows !== sourceCount) {
    throw new Error(`${table}: count mismatch source=${sourceCount} inserted=${insertedRows} destination=${destinationCount}`);
  }
  return {
    table,
    sourceRows: sourceCount,
    destinationRows: destinationCount,
    insertedRows,
    quarantinedValues,
    skipped: false,
    durationMs: Date.now() - startedAt,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const source = new Database(options.sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new Pool({ connectionString: options.postgresUrl, max: 2, application_name: 'vndb-sqlite-migration' });
  const reports: TableReport[] = [];
  try {
    const availableSourceTables = sourceTables(source);
    const client = await pool.connect();
    try {
      if (options.replace) {
        const tables = ['postgres_json_quarantine', ...[...POSTGRES_TABLE_ORDER].reverse()]
          .map(quotePostgresIdentifier)
          .join(', ');
        await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      }
      for (const table of POSTGRES_TABLE_ORDER) {
        if (!availableSourceTables.has(table)) {
          reports.push({ table, sourceRows: 0, destinationRows: await rowCount(client, table), insertedRows: 0, quarantinedValues: 0, skipped: true, durationMs: 0 });
          continue;
        }
        await client.query('BEGIN');
        try {
          const report = await migrateTable(source, client, table, options.batchSize);
          await client.query('COMMIT');
          reports.push(report);
          process.stdout.write(`${table}: ${report.insertedRows} rows (${report.durationMs} ms)\n`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }
    const totalRows = reports.reduce((sum, report) => sum + report.insertedRows, 0);
    process.stdout.write(`${JSON.stringify({ ok: true, tables: reports.length, totalRows, reports }, null, 2)}\n`);
  } finally {
    source.close();
    await pool.end();
  }
}

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
