import { asJsonRecord } from './json-shape';

/** VNDB cache metrics rendered by the data page. */
export interface CacheStat {
  total: number;
  fresh: number;
  stale: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
  by_path: { path: string; n: number }[];
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Decode the VNDB cache metrics response before it enters the data panel.
 *
 * @param value Parsed local API payload.
 * @returns Safe cache metrics, or `null` for malformed input.
 */
export function decodeCacheStatsResponse(value: unknown): CacheStat | null {
  const stats = asJsonRecord(asJsonRecord(value)?.stats);
  if (
    !stats ||
    !isNonNegativeInteger(stats.total) ||
    !isNonNegativeInteger(stats.fresh) ||
    !isNonNegativeInteger(stats.stale) ||
    !isNonNegativeInteger(stats.bytes) ||
    !isNullableFiniteNumber(stats.oldest) ||
    !isNullableFiniteNumber(stats.newest) ||
    !Array.isArray(stats.by_path) ||
    stats.by_path.length > 2_000
  ) {
    return null;
  }
  const byPath: CacheStat['by_path'] = [];
  for (const value of stats.by_path) {
    const row = asJsonRecord(value);
    if (!row || typeof row.path !== 'string' || !isNonNegativeInteger(row.n)) return null;
    byPath.push({ path: row.path, n: row.n });
  }
  return {
    total: stats.total,
    fresh: stats.fresh,
    stale: stats.stale,
    bytes: stats.bytes,
    oldest: stats.oldest,
    newest: stats.newest,
    by_path: byPath,
  };
}
