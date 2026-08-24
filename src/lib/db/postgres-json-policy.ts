import {
  POSTGRES_JSON_COLUMNS,
  type PostgresMigrationTable,
} from './postgres-migration-manifest';

/** Scalar value read from one SQLite cell during PostgreSQL migration. */
export type PostgresMigrationScalar = string | number | bigint | Buffer | null;

/** Mutable migration row keyed by persisted column name. */
export interface PostgresMigrationRow {
  [column: string]: PostgresMigrationScalar;
}

/** One malformed JSON value preserved outside its destination domain table. */
export interface PostgresJsonQuarantineValue {
  table: PostgresMigrationTable;
  column: string;
  sourceRowid: number;
  rawKind: 'text' | 'integer' | 'real' | 'blob';
  rawValue: string;
}

/** Result of validating and transforming one source row before insertion. */
export interface PreparedPostgresJsonRow {
  row: PostgresMigrationRow;
  quarantine: PostgresJsonQuarantineValue[];
}

/** Classify one contractual JSON cell without changing its value. */
export function classifyPostgresJsonValue(value: PostgresMigrationScalar): 'empty' | 'valid' | 'malformed' {
  if (value === null || typeof value === 'string' && value.trim() === '') return 'empty';
  if (typeof value !== 'string') return 'malformed';
  try {
    JSON.parse(value);
    return 'valid';
  } catch {
    return 'malformed';
  }
}

function serializedMalformedValue(value: Exclude<PostgresMigrationScalar, null>): Pick<PostgresJsonQuarantineValue, 'rawKind' | 'rawValue'> {
  if (Buffer.isBuffer(value)) return { rawKind: 'blob', rawValue: value.toString('base64') };
  if (typeof value === 'string') return { rawKind: 'text', rawValue: value };
  if (typeof value === 'bigint' || Number.isInteger(value)) return { rawKind: 'integer', rawValue: String(value) };
  return { rawKind: 'real', rawValue: String(value) };
}

/** Validate all contractual JSON cells and detach malformed values for quarantine. */
export function preparePostgresJsonRow(
  table: PostgresMigrationTable,
  source: PostgresMigrationRow,
  sourceRowid: number,
): PreparedPostgresJsonRow {
  const row = { ...source };
  const quarantine: PostgresJsonQuarantineValue[] = [];
  for (const column of POSTGRES_JSON_COLUMNS[table] ?? []) {
    const value = source[column] ?? null;
    if (classifyPostgresJsonValue(value) !== 'malformed' || value === null) continue;
    row[column] = null;
    quarantine.push({
      table,
      column,
      sourceRowid,
      ...serializedMalformedValue(value),
    });
  }
  return { row, quarantine };
}
