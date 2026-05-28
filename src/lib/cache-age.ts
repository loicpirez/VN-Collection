export const VNDB_CACHE_MS = 24 * 3600 * 1000;
export const STOCK_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `true` when the cached row's `fetched_at` is older than `maxAgeMs`.
 * A `null`/`undefined` timestamp counts as stale so the caller can
 * always rely on a single branch.
 */
export function isCacheStale(
  fetchedAt: number | null | undefined,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  if (!fetchedAt) return true;
  return now - fetchedAt >= maxAgeMs;
}

/** Inverse of `isCacheStale` — convenient when reading code reads cleaner. */
export function isCacheFresh(
  fetchedAt: number | null | undefined,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  return !isCacheStale(fetchedAt, maxAgeMs, now);
}
