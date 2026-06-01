import { asJsonRecord } from './json-shape';

const MAX_VNDB_RESULTS = 1_000;

/**
 * Structurally validated VNDB Kana list response.
 *
 * @typeParam T One endpoint-specific result row.
 */
export interface VndbResultsEnvelope<T> {
  results: T[];
  more: boolean;
  count?: number;
}

/**
 * Decode the common VNDB Kana results envelope before endpoint-specific rows
 * reach consumers. Row schemas remain the responsibility of endpoint adapters.
 *
 * @param value Parsed upstream or cached JSON payload.
 * @returns A normalized VNDB list envelope, or `null` for malformed input.
 */
export function decodeVndbResultsEnvelope<T = unknown>(value: unknown): VndbResultsEnvelope<T> | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.results) || record.results.length > MAX_VNDB_RESULTS) return null;
  if (record.more !== undefined && typeof record.more !== 'boolean') return null;
  if (record.count !== undefined && (!Number.isSafeInteger(record.count) || (record.count as number) < 0)) return null;

  return {
    results: record.results as T[],
    more: record.more === true,
    ...(typeof record.count === 'number' ? { count: record.count } : {}),
  };
}
