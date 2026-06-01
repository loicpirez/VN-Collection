import { asJsonRecord } from './json-shape';
import { isVndbVnId } from './vn-id-shape';

/** One AliceNet Kobe stock row rendered by the client browser. */
export interface KobeClientItem {
  code: string;
  title: string;
  jan: string | null;
  release_date: string | null;
  list_price: string | null;
  sale_price: string | null;
  vn_id: string | null;
  vn_match_source: 'auto' | 'manual' | 'none' | null;
  vn_candidates: string | null;
  search_title: string | null;
  egs_id: number | null;
  egs_match_source: 'auto' | 'manual' | null;
  egs_title: string | null;
  egs_brand: string | null;
  egs_release_date: string | null;
  egs_image_url: string | null;
  egs_vndb_raw: string | null;
  in_collection: number;
  in_wishlist: number;
  last_matched_at: number | null;
  fetched_at: number;
  updated_at: number;
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_image_sexual: number | null;
  vn_developers: string | null;
}

/** Header counters returned with the AliceNet Kobe stock list. */
export interface KobeClientStats {
  total: number;
  matched: number;
  vndb_matched: number;
  egs_only: number;
  unmatched: number;
  unprocessed: number;
  none_found: number;
  in_collection: number;
  in_wishlist: number;
}

/** Pending metadata download counters returned with the AliceNet Kobe stock list. */
export interface KobePendingCounts {
  vndb_pending: number;
  egs_pending: number;
}

/** Full AliceNet Kobe stock-browser response. */
export interface KobeClientSnapshot {
  items: KobeClientItem[];
  stats: KobeClientStats;
  pending: KobePendingCounts;
  last_fetch: number | null;
}

/** Result returned after synchronizing the AliceNet Kobe source page. */
export interface KobeStockSyncResult {
  count: number;
  added: number;
  updated: number;
  removed: number;
  fetched_at: number;
}

/** Progress payload returned by each AliceNet Kobe processing loop. */
export interface KobeLoopResult {
  processed: number;
  matched?: number;
  remaining: number;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isIntegerAtLeast(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isBinaryNumber(value: unknown): value is number {
  return value === 0 || value === 1;
}

function decodeArray<T>(value: unknown, decodeRow: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const row of value) {
    const decoded = decodeRow(row);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function decodeKobeItem(value: unknown): KobeClientItem | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.code) ||
    !/^\d{3}-\d{6}-\d{3}$/.test(record.code) ||
    !isString(record.title) ||
    !isNullableString(record.jan) ||
    !isNullableString(record.release_date) ||
    !isNullableString(record.list_price) ||
    !isNullableString(record.sale_price) ||
    !(record.vn_id === null || (isString(record.vn_id) && isVndbVnId(record.vn_id))) ||
    !(record.vn_match_source === null || record.vn_match_source === 'auto' || record.vn_match_source === 'manual' || record.vn_match_source === 'none') ||
    !isNullableString(record.vn_candidates) ||
    !isNullableString(record.search_title) ||
    !(record.egs_id === null || isIntegerAtLeast(record.egs_id, 1)) ||
    !(record.egs_match_source === null || record.egs_match_source === 'auto' || record.egs_match_source === 'manual') ||
    !isNullableString(record.egs_title) ||
    !isNullableString(record.egs_brand) ||
    !isNullableString(record.egs_release_date) ||
    !isNullableString(record.egs_image_url) ||
    !isNullableString(record.egs_vndb_raw) ||
    !isBinaryNumber(record.in_collection) ||
    !isBinaryNumber(record.in_wishlist) ||
    !isNullableFiniteNumber(record.last_matched_at) ||
    !isIntegerAtLeast(record.fetched_at, 0) ||
    !isIntegerAtLeast(record.updated_at, 0) ||
    !isNullableString(record.vn_image_url) ||
    !isNullableString(record.vn_local_image) ||
    !(record.vn_image_sexual === null || isIntegerAtLeast(record.vn_image_sexual, 0)) ||
    !isNullableString(record.vn_developers)
  ) {
    return null;
  }
  return {
    code: record.code,
    title: record.title,
    jan: record.jan,
    release_date: record.release_date,
    list_price: record.list_price,
    sale_price: record.sale_price,
    vn_id: record.vn_id?.toLowerCase() ?? null,
    vn_match_source: record.vn_match_source,
    vn_candidates: record.vn_candidates,
    search_title: record.search_title,
    egs_id: record.egs_id,
    egs_match_source: record.egs_match_source,
    egs_title: record.egs_title,
    egs_brand: record.egs_brand,
    egs_release_date: record.egs_release_date,
    egs_image_url: record.egs_image_url,
    egs_vndb_raw: record.egs_vndb_raw,
    in_collection: record.in_collection,
    in_wishlist: record.in_wishlist,
    last_matched_at: record.last_matched_at,
    fetched_at: record.fetched_at,
    updated_at: record.updated_at,
    vn_image_url: record.vn_image_url,
    vn_local_image: record.vn_local_image,
    vn_image_sexual: record.vn_image_sexual,
    vn_developers: record.vn_developers,
  };
}

function decodeKobeStats(value: unknown): KobeClientStats | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isIntegerAtLeast(record.total, 0) ||
    !isIntegerAtLeast(record.matched, 0) ||
    !isIntegerAtLeast(record.vndb_matched, 0) ||
    !isIntegerAtLeast(record.egs_only, 0) ||
    !isIntegerAtLeast(record.unmatched, 0) ||
    !isIntegerAtLeast(record.unprocessed, 0) ||
    !isIntegerAtLeast(record.none_found, 0) ||
    !isIntegerAtLeast(record.in_collection, 0) ||
    !isIntegerAtLeast(record.in_wishlist, 0)
  ) {
    return null;
  }
  return {
    total: record.total,
    matched: record.matched,
    vndb_matched: record.vndb_matched,
    egs_only: record.egs_only,
    unmatched: record.unmatched,
    unprocessed: record.unprocessed,
    none_found: record.none_found,
    in_collection: record.in_collection,
    in_wishlist: record.in_wishlist,
  };
}

function decodePendingCounts(value: unknown): KobePendingCounts | null {
  const record = asJsonRecord(value);
  return record && isIntegerAtLeast(record.vndb_pending, 0) && isIntegerAtLeast(record.egs_pending, 0)
    ? { vndb_pending: record.vndb_pending, egs_pending: record.egs_pending }
    : null;
}

/**
 * Decode the AliceNet Kobe stock-browser payload before replacing client state.
 *
 * @param value Parsed local API payload.
 * @returns Safe browser snapshot, or `null` for malformed input.
 */
export function decodeKobeClientSnapshot(value: unknown): KobeClientSnapshot | null {
  const record = asJsonRecord(value);
  const items = decodeArray(record?.items, decodeKobeItem);
  const stats = decodeKobeStats(record?.stats);
  const pending = decodePendingCounts(record?.pending);
  return items && stats && pending && isNullableFiniteNumber(record?.last_fetch)
    ? { items, stats, pending, last_fetch: record.last_fetch }
    : null;
}

/**
 * Decode the source-page stock synchronization result.
 *
 * @param value Parsed local API payload.
 * @returns Safe synchronization counters, or `null` for malformed input.
 */
export function decodeKobeStockSyncResult(value: unknown): KobeStockSyncResult | null {
  const record = asJsonRecord(value);
  return (
    record &&
    isIntegerAtLeast(record.count, 0) &&
    isIntegerAtLeast(record.added, 0) &&
    isIntegerAtLeast(record.updated, 0) &&
    isIntegerAtLeast(record.removed, 0) &&
    isIntegerAtLeast(record.fetched_at, 0)
  )
    ? {
      count: record.count,
      added: record.added,
      updated: record.updated,
      removed: record.removed,
      fetched_at: record.fetched_at,
    }
    : null;
}

/**
 * Decode one AliceNet Kobe batch-loop progress payload.
 *
 * @param value Parsed local API payload.
 * @returns Safe loop counters, or `null` for malformed input.
 */
export function decodeKobeLoopResult(value: unknown): KobeLoopResult | null {
  const record = asJsonRecord(value);
  return (
    record &&
    isIntegerAtLeast(record.processed, 0) &&
    (record.matched === undefined || isIntegerAtLeast(record.matched, 0)) &&
    isIntegerAtLeast(record.remaining, 0)
  )
    ? {
      processed: record.processed,
      matched: record.matched,
      remaining: record.remaining,
    }
    : null;
}
