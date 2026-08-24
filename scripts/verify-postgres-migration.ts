import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  POSTGRES_JSON_COLUMNS,
  POSTGRES_TABLE_ORDER,
  quotePostgresIdentifier,
  type PostgresMigrationTable,
} from '../src/lib/db/postgres-migration-manifest';
import { classifyPostgresJsonValue } from '../src/lib/db/postgres-json-policy';

type Scalar = string | number | bigint | Buffer | null;
interface SqliteRow { [column: string]: Scalar }
interface ColumnRow { name: string; pk: number }
interface PostgresColumnRow extends QueryResultRow { column_name: string }
interface CountRow extends QueryResultRow { count: string }
interface JsonValueRow extends SqliteRow { verification_key: Scalar; verification_value: Scalar }
interface PostgresJsonValueRow extends QueryResultRow { verification_key: Scalar; verification_value: Scalar }

interface VerifyOptions {
  sqlitePath: string;
  postgresUrl: string;
  reportPath: string | null;
}

interface TableVerification {
  table: PostgresMigrationTable;
  rows: number;
  primaryKey: readonly string[];
  primaryKeyHash: string | null;
  sourcePresent: boolean;
}

interface JsonVerification {
  table: PostgresMigrationTable;
  column: string;
  values: number;
  quarantined: number;
  sourcePresent: boolean;
}

interface VerificationReport {
  ok: true;
  verifiedAt: string;
  sourceIntegrity: string;
  tables: TableVerification[];
  json: JsonVerification[];
  aggregates: Record<string, string>;
}

const REPRESENTATIVE_AGGREGATES = {
  collection_status: 'SELECT status, COUNT(*) AS count FROM collection GROUP BY status ORDER BY status',
  stock_provider_availability: 'SELECT provider, availability, COUNT(*) AS count FROM vn_stock_offer GROUP BY provider, availability ORDER BY provider, availability',
  tag_spoiler: 'SELECT spoiler, COUNT(*) AS count FROM vn_tag_index GROUP BY spoiler ORDER BY spoiler',
  staff_kind: 'SELECT is_va, COUNT(*) AS count FROM staff_credit_index GROUP BY is_va ORDER BY is_va',
  shelf_occupancy: 'SELECT shelf_id, COUNT(*) AS count FROM shelf_slot GROUP BY shelf_id ORDER BY shelf_id',
  place_links: 'SELECT place_id, COUNT(*) AS count FROM place_provider_link GROUP BY place_id ORDER BY place_id',
} as const;

function requiredValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseOptions(args: readonly string[]): VerifyOptions {
  let sqlitePath = '';
  let postgresUrl = '';
  let reportPath: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--sqlite') {
      sqlitePath = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '--postgres') {
      postgresUrl = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '--report') {
      reportPath = resolve(requiredValue(args, index, arg));
      index += 1;
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
  return { sqlitePath, postgresUrl, reportPath };
}

function encodeScalar(value: Scalar): string {
  if (value === null) return 'null';
  if (Buffer.isBuffer(value)) return `buffer:${value.toString('base64')}`;
  return `value:${String(value)}`;
}

function hashRows(rows: Iterable<SqliteRow>, columns: readonly string[]): string {
  const hash = createHash('sha256');
  const encodedRows: string[] = [];
  for (const row of rows) {
    encodedRows.push(columns.map((column) => encodeScalar(row[column] ?? null)).join('\u001f'));
  }
  encodedRows.sort();
  for (const row of encodedRows) hash.update(`${row}\n`);
  return hash.digest('hex');
}

function sourcePrimaryKey(source: Database.Database, table: PostgresMigrationTable): string[] {
  return source.prepare<[], ColumnRow>(`PRAGMA table_info(${quotePostgresIdentifier(table)})`)
    .all()
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
}

function sourceTables(source: Database.Database): Set<string> {
  const rows = source.prepare<[], { name: string }>(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all();
  return new Set(rows.map((row) => row.name));
}

function sourceColumns(source: Database.Database, table: PostgresMigrationTable): Set<string> {
  return new Set(source.prepare<[], ColumnRow>(`PRAGMA table_info(${quotePostgresIdentifier(table)})`)
    .all()
    .map((column) => column.name));
}

async function destinationPrimaryKey(client: PoolClient, table: PostgresMigrationTable): Promise<string[]> {
  const result = await client.query<PostgresColumnRow>(`
    SELECT attribute.attname AS column_name
    FROM pg_index index_definition
    JOIN pg_attribute attribute
      ON attribute.attrelid = index_definition.indrelid
     AND attribute.attnum = ANY(index_definition.indkey)
    WHERE index_definition.indrelid = $1::regclass
      AND index_definition.indisprimary
    ORDER BY array_position(index_definition.indkey, attribute.attnum)
  `, [table]);
  return result.rows.map((row) => row.column_name);
}

function sourceCount(source: Database.Database, table: PostgresMigrationTable): number {
  return source.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM ${quotePostgresIdentifier(table)}`).get()?.count ?? 0;
}

async function destinationCount(client: PoolClient, table: PostgresMigrationTable): Promise<number> {
  const result = await client.query<CountRow>(`SELECT COUNT(*)::text AS count FROM ${quotePostgresIdentifier(table)}`);
  return Number(result.rows[0]?.count ?? '0');
}

async function verifyTable(source: Database.Database, client: PoolClient, table: PostgresMigrationTable): Promise<TableVerification> {
  const sourceRows = sourceCount(source, table);
  const destinationRows = await destinationCount(client, table);
  if (sourceRows !== destinationRows) throw new Error(`${table}: row count mismatch ${sourceRows} != ${destinationRows}`);
  const sourceKey = sourcePrimaryKey(source, table);
  const destinationKey = await destinationPrimaryKey(client, table);
  if (sourceKey.join('\u001f') !== destinationKey.join('\u001f')) {
    throw new Error(`${table}: primary key mismatch ${sourceKey.join(',')} != ${destinationKey.join(',')}`);
  }
  if (sourceKey.length === 0) {
    return { table, rows: sourceRows, primaryKey: sourceKey, primaryKeyHash: null, sourcePresent: true };
  }
  const columns = sourceKey.map(quotePostgresIdentifier).join(', ');
  const order = sourceKey.map(quotePostgresIdentifier).join(', ');
  const sourceValues = source.prepare<[], SqliteRow>(`SELECT ${columns} FROM ${quotePostgresIdentifier(table)} ORDER BY ${order}`).iterate();
  const destinationResult = await client.query<SqliteRow & QueryResultRow>(`SELECT ${columns} FROM ${quotePostgresIdentifier(table)} ORDER BY ${order}`);
  const sourceHash = hashRows(sourceValues, sourceKey);
  const destinationHash = hashRows(destinationResult.rows, sourceKey);
  if (sourceHash !== destinationHash) throw new Error(`${table}: primary key checksum mismatch`);
  return { table, rows: sourceRows, primaryKey: sourceKey, primaryKeyHash: sourceHash, sourcePresent: true };
}

async function verifyMissingSourceTable(
  client: PoolClient,
  table: PostgresMigrationTable,
): Promise<TableVerification> {
  const destinationRows = await destinationCount(client, table);
  if (destinationRows !== 0) {
    throw new Error(`${table}: source table is absent but destination contains ${destinationRows} rows`);
  }
  return {
    table,
    rows: 0,
    primaryKey: await destinationPrimaryKey(client, table),
    primaryKeyHash: null,
    sourcePresent: false,
  };
}

function assertJson(value: Scalar, location: string): void {
  if (typeof value !== 'string') throw new Error(`${location}: expected JSON text`);
  try {
    JSON.parse(value);
  } catch {
    throw new Error(`${location}: malformed JSON`);
  }
}

async function verifyJsonColumn(
  source: Database.Database,
  client: PoolClient,
  table: PostgresMigrationTable,
  column: string,
): Promise<JsonVerification> {
  const quotedTable = quotePostgresIdentifier(table);
  const quotedColumn = quotePostgresIdentifier(column);
  let values = 0;
  let quarantined = 0;
  const sourceRows = source.prepare<[], JsonValueRow>(`
    SELECT rowid AS verification_key, ${quotedColumn} AS verification_value
    FROM ${quotedTable}
    WHERE ${quotedColumn} IS NOT NULL AND TRIM(${quotedColumn}) <> ''
  `).iterate();
  for (const row of sourceRows) {
    const classification = classifyPostgresJsonValue(row.verification_value);
    if (classification === 'valid') values += 1;
    else if (classification === 'malformed') quarantined += 1;
  }
  const destinationRows = await client.query<PostgresJsonValueRow>(`
    SELECT ctid::text AS verification_key, ${quotedColumn} AS verification_value
    FROM ${quotedTable}
    WHERE ${quotedColumn} IS NOT NULL AND BTRIM(${quotedColumn}) <> ''
  `);
  if (destinationRows.rowCount !== values) {
    throw new Error(`${table}.${column}: JSON value count mismatch ${values} != ${destinationRows.rowCount ?? 0}`);
  }
  for (const row of destinationRows.rows) {
    assertJson(row.verification_value, `${table}.${column} destination row ${String(row.verification_key)}`);
  }
  const quarantineRows = await client.query<CountRow>(`
    SELECT COUNT(*)::text AS count
    FROM postgres_json_quarantine
    WHERE table_name = $1 AND column_name = $2
  `, [table, column]);
  const destinationQuarantined = Number(quarantineRows.rows[0]?.count ?? '0');
  if (destinationQuarantined !== quarantined) {
    throw new Error(`${table}.${column}: JSON quarantine count mismatch ${quarantined} != ${destinationQuarantined}`);
  }
  return { table, column, values, quarantined, sourcePresent: true };
}

async function verifyMissingSourceJsonColumn(
  client: PoolClient,
  table: PostgresMigrationTable,
  column: string,
): Promise<JsonVerification> {
  const quotedTable = quotePostgresIdentifier(table);
  const quotedColumn = quotePostgresIdentifier(column);
  const destinationRows = await client.query<CountRow>(`
    SELECT COUNT(*)::text AS count
    FROM ${quotedTable}
    WHERE ${quotedColumn} IS NOT NULL AND BTRIM(${quotedColumn}) <> ''
  `);
  const values = Number(destinationRows.rows[0]?.count ?? '0');
  const quarantineRows = await client.query<CountRow>(`
    SELECT COUNT(*)::text AS count
    FROM postgres_json_quarantine
    WHERE table_name = $1 AND column_name = $2
  `, [table, column]);
  const quarantined = Number(quarantineRows.rows[0]?.count ?? '0');
  if (values !== 0 || quarantined !== 0) {
    throw new Error(`${table}.${column}: source column is absent but destination contains migrated values`);
  }
  return { table, column, values: 0, quarantined: 0, sourcePresent: false };
}

function canonicalRows(rows: readonly SqliteRow[]): string {
  return JSON.stringify(rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, encodeScalar(value)]),
  )));
}

async function verifyAggregate(source: Database.Database, client: PoolClient, sql: string): Promise<string> {
  const sourceRows = source.prepare<[], SqliteRow>(sql).all();
  const destinationRows = await client.query<SqliteRow & QueryResultRow>(sql);
  const sourceCanonical = canonicalRows(sourceRows);
  const destinationCanonical = canonicalRows(destinationRows.rows);
  if (sourceCanonical !== destinationCanonical) throw new Error(`Aggregate mismatch for query: ${sql}`);
  return createHash('sha256').update(sourceCanonical).digest('hex');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const source = new Database(options.sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new Pool({ connectionString: options.postgresUrl, max: 2, application_name: 'vndb-postgres-verification' });
  try {
    const availableSourceTables = sourceTables(source);
    const integrity = source.pragma('quick_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`SQLite quick_check failed: ${String(integrity)}`);
    const sourceForeignKeyErrors = source.pragma('foreign_key_check') as SqliteRow[];
    if (sourceForeignKeyErrors.length > 0) throw new Error(`SQLite foreign_key_check found ${sourceForeignKeyErrors.length} violations`);
    const client = await pool.connect();
    try {
      const invalidConstraints = await client.query<CountRow>(`
        SELECT COUNT(*)::text AS count
        FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace AND NOT convalidated
      `);
      if (Number(invalidConstraints.rows[0]?.count ?? '0') > 0) throw new Error('PostgreSQL contains unvalidated constraints');
      const tables: TableVerification[] = [];
      for (const table of POSTGRES_TABLE_ORDER) {
        if (!availableSourceTables.has(table)) {
          tables.push(await verifyMissingSourceTable(client, table));
          continue;
        }
        tables.push(await verifyTable(source, client, table));
      }
      const json: JsonVerification[] = [];
      for (const table of POSTGRES_TABLE_ORDER) {
        if (!availableSourceTables.has(table)) continue;
        const availableSourceColumns = sourceColumns(source, table);
        for (const column of POSTGRES_JSON_COLUMNS[table] ?? []) {
          json.push(availableSourceColumns.has(column)
            ? await verifyJsonColumn(source, client, table, column)
            : await verifyMissingSourceJsonColumn(client, table, column));
        }
      }
      const aggregates: Record<string, string> = {};
      for (const [name, sql] of Object.entries(REPRESENTATIVE_AGGREGATES)) {
        aggregates[name] = await verifyAggregate(source, client, sql);
      }
      const report: VerificationReport = {
        ok: true,
        verifiedAt: new Date().toISOString(),
        sourceIntegrity: 'ok',
        tables,
        json,
        aggregates,
      };
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      if (options.reportPath) writeFileSync(options.reportPath, serialized, 'utf8');
      process.stdout.write(serialized);
    } finally {
      client.release();
    }
  } finally {
    source.close();
    await pool.end();
  }
}

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
