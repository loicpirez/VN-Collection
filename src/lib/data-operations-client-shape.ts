import { asJsonRecord } from './json-shape';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_DUPLICATE_GROUPS = 20_000;
const MAX_DUPLICATE_IDS = 20_000;
const MAX_STALE_ROWS = 200;
const MAX_SUMMARY_ROWS = 10_000;

/** Duplicate-title group rendered by the data-maintenance panel. */
export interface MaintenanceDuplicateGroup {
  prefix: string;
  ids: string[];
}

/** Stale local VN row rendered by the data-maintenance panel. */
export interface MaintenanceStaleVn {
  id: string;
  title: string;
  fetched_at: number;
  has_cover: boolean;
  has_egs: boolean;
}

/** Summary returned after importing a JSON collection backup. */
export interface JsonImportSummary {
  vns_upserted: number;
  collection_upserted: number;
  series_created: number;
  series_links: number;
  errors: string[];
}

/** Summary returned after restoring a SQLite backup. */
export interface DbRestoreSummary {
  tables: { name: string; rows_replaced: number }[];
  skipped: { name: string; reason: string }[];
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeStringArray(value: unknown, maxRows: number): string[] | null {
  return Array.isArray(value) && value.length <= maxRows && value.every((row) => typeof row === 'string')
    ? value
    : null;
}

/**
 * Decode duplicate-title groups from the maintenance route.
 *
 * @param value Parsed local API payload.
 * @returns Safe groups, or `null` for malformed input.
 */
export function decodeMaintenanceDuplicateGroups(value: unknown): MaintenanceDuplicateGroup[] | null {
  const groups = asJsonRecord(value)?.groups;
  if (!Array.isArray(groups) || groups.length > MAX_DUPLICATE_GROUPS) return null;
  const out: MaintenanceDuplicateGroup[] = [];
  for (const value of groups) {
    const row = asJsonRecord(value);
    const ids = decodeStringArray(row?.ids, MAX_DUPLICATE_IDS);
    if (!row || typeof row.prefix !== 'string' || !ids || ids.some((id) => !isValidVnId(id))) return null;
    out.push({ prefix: row.prefix, ids: ids.map(normalizeVnId) });
  }
  return out;
}

/**
 * Decode stale VN rows from the maintenance route.
 *
 * @param value Parsed local API payload.
 * @returns Safe stale rows, or `null` for malformed input.
 */
export function decodeMaintenanceStaleVns(value: unknown): MaintenanceStaleVn[] | null {
  const rows = asJsonRecord(value)?.rows;
  if (!Array.isArray(rows) || rows.length > MAX_STALE_ROWS) return null;
  const out: MaintenanceStaleVn[] = [];
  for (const value of rows) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !isValidVnId(row.id) ||
      typeof row.title !== 'string' ||
      !isNonNegativeInteger(row.fetched_at) ||
      typeof row.has_cover !== 'boolean' ||
      typeof row.has_egs !== 'boolean'
    ) {
      return null;
    }
    out.push({
      id: normalizeVnId(row.id),
      title: row.title,
      fetched_at: row.fetched_at,
      has_cover: row.has_cover,
      has_egs: row.has_egs,
    });
  }
  return out;
}

/**
 * Decode a completed JSON-import summary.
 *
 * @param value Parsed local API payload.
 * @returns Safe import summary, or `null` for malformed input.
 */
export function decodeJsonImportSummary(value: unknown): JsonImportSummary | null {
  const record = asJsonRecord(value);
  const summary = asJsonRecord(record?.summary);
  const errors = decodeStringArray(summary?.errors, MAX_SUMMARY_ROWS);
  return record?.ok === true &&
    summary &&
    isNonNegativeInteger(summary.vns_upserted) &&
    isNonNegativeInteger(summary.collection_upserted) &&
    isNonNegativeInteger(summary.series_created) &&
    isNonNegativeInteger(summary.series_links) &&
    errors
    ? {
      vns_upserted: summary.vns_upserted,
      collection_upserted: summary.collection_upserted,
      series_created: summary.series_created,
      series_links: summary.series_links,
      errors,
    }
    : null;
}

/**
 * Decode a completed SQLite-restore summary.
 *
 * @param value Parsed local API payload.
 * @returns Safe restore summary, or `null` for malformed input.
 */
export function decodeDbRestoreSummary(value: unknown): DbRestoreSummary | null {
  const record = asJsonRecord(value);
  const summary = asJsonRecord(record?.summary);
  if (
    record?.ok !== true ||
    !summary ||
    !Array.isArray(summary.tables) ||
    summary.tables.length > MAX_SUMMARY_ROWS ||
    !Array.isArray(summary.skipped) ||
    summary.skipped.length > MAX_SUMMARY_ROWS
  ) {
    return null;
  }
  const tables: DbRestoreSummary['tables'] = [];
  for (const value of summary.tables) {
    const row = asJsonRecord(value);
    if (!row || typeof row.name !== 'string' || !isNonNegativeInteger(row.rows_replaced)) return null;
    tables.push({ name: row.name, rows_replaced: row.rows_replaced });
  }
  const skipped: DbRestoreSummary['skipped'] = [];
  for (const value of summary.skipped) {
    const row = asJsonRecord(value);
    if (!row || typeof row.name !== 'string' || typeof row.reason !== 'string') return null;
    skipped.push({ name: row.name, reason: row.reason });
  }
  return { tables, skipped };
}
