import { createHash } from 'node:crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { assertPostgresSchemaCurrent } from './migrate';
import {
  POSTGRES_TABLE_ORDER,
  quotePostgresIdentifier,
  type PostgresMigrationTable,
} from './postgres-migration-manifest';
import { getPostgresPool, type PostgresParameter } from './postgres';

const BACKUP_FORMAT = 'vndb-collection-postgres-backup';
const BACKUP_VERSION = 1;
const CURSOR_BATCH_SIZE = 250;
const INSERT_BATCH_SIZE = 100;
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const RESTORE_LOCK_NAME = 'vndb-collection:postgres-restore';

/** MIME type used by versioned PostgreSQL logical backups. */
export const POSTGRES_BACKUP_CONTENT_TYPE = 'application/x-vndb-collection-backup';

/** Default hard ceiling for one streamed PostgreSQL restore. */
export const POSTGRES_BACKUP_MAX_BYTES = 4 * 1024 * 1024 * 1024;

interface ColumnRow extends QueryResultRow {
  table_name: string;
  column_name: string;
  ordinal_position: number;
  is_identity: 'YES' | 'NO';
}

interface MigrationRow extends QueryResultRow {
  version: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

/** Minimal PostgreSQL client contract required by logical backup operations. */
export interface PostgresBackupClient {
  /** Execute one parameterized query. */
  query<Row extends QueryResultRow>(text: string, values?: PostgresParameter[]): Promise<QueryResult<Row>>;
  /** Return the checked-out client to its pool. */
  release(): void;
}

/** Minimal bounded-pool contract required by logical backup operations. */
export interface PostgresBackupPool {
  /** Acquire one client for the backup or restore lifetime. */
  connect(): Promise<PostgresBackupClient>;
}

interface BackupTable {
  name: PostgresMigrationTable;
  columns: string[];
  identity_columns: string[];
}

interface BackupHeader {
  type: 'header';
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  created_at: string;
  migrations: string[];
  tables: BackupTable[];
}

interface BackupRow {
  type: 'row';
  table: PostgresMigrationTable;
  values: PostgresParameter[];
}

interface BackupFooter {
  type: 'footer';
  rows: number;
  counts: Record<PostgresMigrationTable, number>;
  sha256: string;
}

/** Download contract returned by the PostgreSQL logical-backup producer. */
export interface PostgresBackupDownload {
  /** Bounded stream containing newline-delimited backup records. */
  stream: ReadableStream<Uint8Array>;
  /** Suggested attachment filename. */
  filename: string;
  /** Logical backup MIME type. */
  contentType: typeof POSTGRES_BACKUP_CONTENT_TYPE;
}

/** One restored table and its verified replacement count. */
export interface PostgresRestoreTableSummary {
  /** Restored application table. */
  name: PostgresMigrationTable;
  /** Rows present after the replacement transaction. */
  rows_replaced: number;
}

/** Result returned after a verified PostgreSQL logical restore. */
export interface PostgresRestoreSummary {
  /** Per-table counts verified after replacement. */
  tables: PostgresRestoreTableSummary[];
  /** Compatibility field shared with the SQLite restore UI. */
  skipped: [];
}

/** Raised when a logical restore exceeds its configured byte ceiling. */
export class PostgresBackupTooLargeError extends Error {}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/.test(value);
}

function backupScalar(value: unknown): value is PostgresParameter {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
}

function serializeRecord(record: BackupHeader | BackupRow | BackupFooter): string {
  return `${JSON.stringify(record)}\n`;
}

async function tableMetadata(client: PostgresBackupClient): Promise<BackupTable[]> {
  const result = await client.query<ColumnRow>(`
    SELECT table_name, column_name, ordinal_position, is_identity
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::TEXT[])
    ORDER BY table_name, ordinal_position
  `, [[...POSTGRES_TABLE_ORDER]]);
  const byTable = new Map<string, string[]>();
  const identitiesByTable = new Map<string, string[]>();
  for (const row of result.rows) {
    const columns = byTable.get(row.table_name) ?? [];
    columns.push(row.column_name);
    byTable.set(row.table_name, columns);
    if (row.is_identity === 'YES') {
      const identityColumns = identitiesByTable.get(row.table_name) ?? [];
      identityColumns.push(row.column_name);
      identitiesByTable.set(row.table_name, identityColumns);
    }
  }
  return POSTGRES_TABLE_ORDER.map((name) => {
    const columns = byTable.get(name);
    if (!columns || columns.length === 0) throw new Error(`PostgreSQL backup table is missing: ${name}`);
    if (!columns.every(safeIdentifier)) throw new Error(`PostgreSQL backup table has an unsafe column: ${name}`);
    return { name, columns, identity_columns: identitiesByTable.get(name) ?? [] };
  });
}

async function migrationVersions(client: PostgresBackupClient): Promise<string[]> {
  const result = await client.query<MigrationRow>('SELECT version FROM schema_migration ORDER BY version');
  return result.rows.map((row) => row.version);
}

function rowValues(row: QueryResultRow, table: BackupTable): PostgresParameter[] {
  return table.columns.map((column) => {
    const value = row[column];
    if (!backupScalar(value)) throw new Error(`Unsupported PostgreSQL backup value in ${table.name}.${column}`);
    return value;
  });
}

async function rollbackQuietly(client: PostgresBackupClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    return;
  }
}

function streamFromGenerator(
  iterator: AsyncGenerator<Uint8Array>,
  cleanup: () => Promise<void>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
      await cleanup();
    },
  });
}

/**
 * Create a repeatable-read PostgreSQL logical backup without buffering the
 * database in application memory.
 *
 * @param pool PostgreSQL pool used by the application.
 * @returns Stream and attachment metadata for the HTTP route.
 */
export async function createPostgresBackupDownload(pool: PostgresBackupPool = getPostgresPool()): Promise<PostgresBackupDownload> {
  const client = await pool.connect();
  let released = false;
  const cleanup = async (): Promise<void> => {
    if (released) return;
    released = true;
    await rollbackQuietly(client);
    client.release();
  };
  try {
    await assertPostgresSchemaCurrent(client);
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = await tableMetadata(client);
    const migrations = await migrationVersions(client);
    const encoder = new TextEncoder();
    const date = new Date().toISOString().slice(0, 10);

    async function* records(): AsyncGenerator<Uint8Array> {
      let committed = false;
      try {
        const header: BackupHeader = {
          type: 'header',
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          created_at: new Date().toISOString(),
          migrations,
          tables,
        };
        yield encoder.encode(serializeRecord(header));
        const hash = createHash('sha256');
        const counts = Object.fromEntries(POSTGRES_TABLE_ORDER.map((name) => [name, 0])) as Record<PostgresMigrationTable, number>;
        let totalRows = 0;
        for (const [index, table] of tables.entries()) {
          const cursor = `backup_cursor_${index}`;
          await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT * FROM ${quotePostgresIdentifier(table.name)}`);
          try {
            while (true) {
              const batch = await client.query(`FETCH FORWARD ${CURSOR_BATCH_SIZE} FROM ${cursor}`);
              if (batch.rows.length === 0) break;
              for (const row of batch.rows) {
                const line = serializeRecord({ type: 'row', table: table.name, values: rowValues(row, table) });
                hash.update(line);
                counts[table.name] += 1;
                totalRows += 1;
                yield encoder.encode(line);
              }
            }
          } finally {
            await client.query(`CLOSE ${cursor}`);
          }
        }
        const footer: BackupFooter = { type: 'footer', rows: totalRows, counts, sha256: hash.digest('hex') };
        yield encoder.encode(serializeRecord(footer));
        await client.query('COMMIT');
        committed = true;
      } finally {
        if (!committed) await rollbackQuietly(client);
        released = true;
        client.release();
      }
    }

    return {
      stream: streamFromGenerator(records(), cleanup),
      filename: `vndb-collection-${date}.vncbackup`,
      contentType: POSTGRES_BACKUP_CONTENT_TYPE,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function* decodedLines(stream: ReadableStream<Uint8Array>, maxBytes: number): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffered = new Uint8Array(0);
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new PostgresBackupTooLargeError(`PostgreSQL backup exceeds ${maxBytes} bytes`);
      const joined = new Uint8Array(buffered.byteLength + next.value.byteLength);
      joined.set(buffered);
      joined.set(next.value, buffered.byteLength);
      let start = 0;
      for (let index = 0; index < joined.byteLength; index += 1) {
        if (joined[index] !== 10) continue;
        const lineBytes = joined.subarray(start, index);
        if (lineBytes.byteLength > MAX_LINE_BYTES) throw new Error('PostgreSQL backup record is too large');
        yield decoder.decode(lineBytes);
        start = index + 1;
      }
      buffered = joined.slice(start);
      if (buffered.byteLength > MAX_LINE_BYTES) throw new Error('PostgreSQL backup record is too large');
    }
    if (buffered.byteLength > 0) yield decoder.decode(buffered);
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('PostgreSQL backup contains invalid JSON');
  }
  const record = jsonRecord(parsed);
  if (!record) throw new Error('PostgreSQL backup record must be an object');
  return record;
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`PostgreSQL backup ${field} is invalid`);
  }
  return value;
}

function parseHeader(line: string): BackupHeader {
  const record = parseLine(line);
  if (
    record.type !== 'header' ||
    record.format !== BACKUP_FORMAT ||
    record.version !== BACKUP_VERSION ||
    typeof record.created_at !== 'string' ||
    !Array.isArray(record.tables)
  ) {
    throw new Error('Unsupported PostgreSQL backup header');
  }
  const migrations = parseStringArray(record.migrations, 'migration list');
  const tables = record.tables.map((value) => {
    const table = jsonRecord(value);
    if (!table || typeof table.name !== 'string' || !POSTGRES_TABLE_ORDER.includes(table.name as PostgresMigrationTable)) {
      throw new Error('PostgreSQL backup table metadata is invalid');
    }
    const columns = parseStringArray(table.columns, `columns for ${table.name}`);
    const identityColumns = parseStringArray(table.identity_columns, `identity columns for ${table.name}`);
    if (!columns.every(safeIdentifier)) throw new Error(`PostgreSQL backup columns for ${table.name} are invalid`);
    if (!identityColumns.every((column) => safeIdentifier(column) && columns.includes(column))) {
      throw new Error(`PostgreSQL backup identity columns for ${table.name} are invalid`);
    }
    return { name: table.name as PostgresMigrationTable, columns, identity_columns: identityColumns };
  });
  return {
    type: 'header',
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: record.created_at,
    migrations,
    tables,
  };
}

function assertCompatibleHeader(header: BackupHeader, current: BackupTable[], migrations: string[]): void {
  if (header.tables.length !== current.length) throw new Error('PostgreSQL backup table set does not match the current schema');
  for (const [index, table] of current.entries()) {
    const incoming = header.tables[index];
    if (incoming?.name !== table.name || incoming.columns.length !== table.columns.length ||
      incoming.columns.some((column, columnIndex) => column !== table.columns[columnIndex]) ||
      incoming.identity_columns.length !== table.identity_columns.length ||
      incoming.identity_columns.some((column, columnIndex) => column !== table.identity_columns[columnIndex])) {
      throw new Error(`PostgreSQL backup schema mismatch for ${table.name}`);
    }
  }
  if (header.migrations.length !== migrations.length || header.migrations.some((version, index) => version !== migrations[index])) {
    throw new Error('PostgreSQL backup migration versions do not match the running application');
  }
}

function parseBackupRow(record: Record<string, unknown>, tableByName: Map<string, BackupTable>): BackupRow {
  if (record.type !== 'row' || typeof record.table !== 'string') throw new Error('PostgreSQL backup row is invalid');
  const table = tableByName.get(record.table);
  if (!table || !Array.isArray(record.values) || record.values.length !== table.columns.length || !record.values.every(backupScalar)) {
    throw new Error(`PostgreSQL backup values are invalid for ${record.table}`);
  }
  return { type: 'row', table: table.name, values: record.values };
}

function parseFooter(record: Record<string, unknown>): BackupFooter {
  const countsRecord = jsonRecord(record.counts);
  if (record.type !== 'footer' || !Number.isSafeInteger(record.rows) || (record.rows as number) < 0 ||
    typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256) || !countsRecord) {
    throw new Error('PostgreSQL backup footer is invalid');
  }
  const counts = {} as Record<PostgresMigrationTable, number>;
  for (const table of POSTGRES_TABLE_ORDER) {
    const count = countsRecord[table];
    if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error(`PostgreSQL backup count is invalid for ${table}`);
    counts[table] = count as number;
  }
  if (Object.keys(countsRecord).length !== POSTGRES_TABLE_ORDER.length) throw new Error('PostgreSQL backup footer has unexpected tables');
  return { type: 'footer', rows: record.rows as number, counts, sha256: record.sha256 };
}

async function insertBatch(
  client: PostgresBackupClient,
  stage: string,
  table: BackupTable,
  rows: PostgresParameter[][],
): Promise<void> {
  if (rows.length === 0) return;
  const values: PostgresParameter[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const columns = table.columns.map(quotePostgresIdentifier).join(', ');
  await client.query(`INSERT INTO ${stage} (${columns}) VALUES ${tuples.join(', ')}`, values);
}

/**
 * Restore a version-compatible PostgreSQL logical backup through temporary
 * staging tables, then replace all application rows in one transaction.
 *
 * @param stream Raw logical-backup body.
 * @param maxBytes Maximum accepted streamed bytes.
 * @param pool PostgreSQL pool used by the application.
 * @returns Per-table counts verified after commit preparation.
 */
export async function restorePostgresBackup(
  stream: ReadableStream<Uint8Array>,
  maxBytes = POSTGRES_BACKUP_MAX_BYTES,
  pool: PostgresBackupPool = getPostgresPool(),
): Promise<PostgresRestoreSummary> {
  const lines = decodedLines(stream, maxBytes)[Symbol.asyncIterator]();
  let header: BackupHeader;
  try {
    const first = await lines.next();
    if (first.done || first.value.length === 0) throw new Error('PostgreSQL backup is empty');
    header = parseHeader(first.value);
  } catch (error) {
    await lines.return?.(undefined);
    throw error;
  }
  let client: PostgresBackupClient;
  try {
    client = await pool.connect();
  } catch (error) {
    await lines.return?.(undefined);
    throw error;
  }
  let committed = false;
  try {
    await assertPostgresSchemaCurrent(client);
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [RESTORE_LOCK_NAME]);
    const currentTables = await tableMetadata(client);
    const migrations = await migrationVersions(client);
    assertCompatibleHeader(header, currentTables, migrations);
    const tableByName = new Map(currentTables.map((table) => [table.name, table]));
    const stageByName = new Map<PostgresMigrationTable, string>();
    for (const [index, table] of currentTables.entries()) {
      const stage = `backup_stage_${index}`;
      await client.query(`CREATE TEMP TABLE ${stage} (LIKE ${quotePostgresIdentifier(table.name)} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`);
      stageByName.set(table.name, stage);
    }

    const hash = createHash('sha256');
    const counts = Object.fromEntries(POSTGRES_TABLE_ORDER.map((name) => [name, 0])) as Record<PostgresMigrationTable, number>;
    const pending = new Map<PostgresMigrationTable, PostgresParameter[][]>();
    let currentTableIndex = 0;
    let totalRows = 0;
    let footer: BackupFooter | null = null;
    while (true) {
      const next = await lines.next();
      if (next.done) break;
      if (next.value.length === 0) throw new Error('PostgreSQL backup contains an empty record');
      const record = parseLine(next.value);
      if (record.type === 'footer') {
        footer = parseFooter(record);
        break;
      }
      const row = parseBackupRow(record, tableByName);
      const tableIndex = POSTGRES_TABLE_ORDER.indexOf(row.table);
      if (tableIndex < currentTableIndex) throw new Error('PostgreSQL backup rows are out of table order');
      currentTableIndex = tableIndex;
      const rows = pending.get(row.table) ?? [];
      rows.push(row.values);
      pending.set(row.table, rows);
      counts[row.table] += 1;
      totalRows += 1;
      hash.update(`${next.value}\n`);
      if (rows.length >= INSERT_BATCH_SIZE) {
        await insertBatch(client, stageByName.get(row.table)!, tableByName.get(row.table)!, rows);
        pending.set(row.table, []);
      }
    }
    if (!footer) throw new Error('PostgreSQL backup footer is missing');
    const trailing = await lines.next();
    if (!trailing.done) throw new Error('PostgreSQL backup contains data after the footer');
    for (const table of currentTables) {
      await insertBatch(client, stageByName.get(table.name)!, table, pending.get(table.name) ?? []);
      if (footer.counts[table.name] !== counts[table.name]) throw new Error(`PostgreSQL backup count mismatch for ${table.name}`);
    }
    if (footer.rows !== totalRows) throw new Error('PostgreSQL backup total row count does not match');
    if (footer.sha256 !== hash.digest('hex')) throw new Error('PostgreSQL backup integrity check failed');

    const targets = currentTables.map((table) => quotePostgresIdentifier(table.name)).join(', ');
    await client.query(`TRUNCATE TABLE ${targets} RESTART IDENTITY CASCADE`);
    const summary: PostgresRestoreTableSummary[] = [];
    for (const table of currentTables) {
      const stage = stageByName.get(table.name)!;
      const columns = table.columns.map(quotePostgresIdentifier).join(', ');
      await client.query(`INSERT INTO ${quotePostgresIdentifier(table.name)} (${columns}) SELECT ${columns} FROM ${stage}`);
      const verified = await client.query<CountRow>(`SELECT COUNT(*)::BIGINT AS count FROM ${quotePostgresIdentifier(table.name)}`);
      const count = verified.rows[0]?.count;
      if (count !== counts[table.name]) throw new Error(`PostgreSQL restore verification failed for ${table.name}`);
      for (const identityColumn of table.identity_columns) {
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence(format('%I.%I', current_schema(), $1::TEXT), $2::TEXT),
            GREATEST(COALESCE(MAX(${quotePostgresIdentifier(identityColumn)}), 0), 1),
            COALESCE(MAX(${quotePostgresIdentifier(identityColumn)}), 0) > 0
          )
          FROM ${quotePostgresIdentifier(table.name)}
        `, [table.name, identityColumn]);
      }
      summary.push({ name: table.name, rows_replaced: count });
    }
    await client.query('COMMIT');
    committed = true;
    return { tables: summary, skipped: [] };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    if (!committed) await lines.return?.(undefined);
    client.release();
  }
}
