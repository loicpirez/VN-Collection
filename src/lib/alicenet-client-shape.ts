import { asJsonRecord } from './json-shape';
import { isVndbVnId } from './vn-id-shape';
import { decodeOffsetPageMeta, type OffsetPageMeta } from './server-pagination';

/** One AliceNet stock row rendered by the client browser. */
export interface AliceNetClientItem {
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
  server_group_key?: string;
  server_group_count?: number;
}

/** Header counters returned with the AliceNet stock list. */
export interface AliceNetClientStats {
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

/** Pending metadata download counters returned with the AliceNet stock list. */
export interface AliceNetPendingCounts {
  vndb_pending: number;
  egs_pending: number;
}

/** Paging window returned with each AliceNet stock page. */
export type AliceNetPageMeta = OffsetPageMeta;

/** Producer option calculated from the full AliceNet result set. */
export interface AliceNetProducerOption {
  id: string;
  name: string;
  count: number;
}

/** First AliceNet stock-browser page: items plus header counters and paging window. */
export interface AliceNetClientSnapshot {
  items: AliceNetClientItem[];
  stats: AliceNetClientStats;
  pending: AliceNetPendingCounts;
  last_fetch: number | null;
  page?: AliceNetPageMeta;
  producers: AliceNetProducerOption[];
  wishlist_available: boolean;
}

/** A follow-up AliceNet stock page: items plus the paging window only. */
export interface AliceNetClientPage {
  items: AliceNetClientItem[];
  page: AliceNetPageMeta;
}

/** Result returned after synchronizing the AliceNet source page. */
export interface AliceNetStockSyncResult {
  count: number;
  added: number;
  updated: number;
  removed: number;
  fetched_at: number;
}

/** Progress payload returned by each AliceNet processing loop. */
export interface AliceNetLoopResult {
  processed: number;
  matched?: number;
  remaining: number;
}

/** AliceNet background operation accepted by the server job queue. */
export interface AliceNetRunAccepted {
  jobId: string;
  op: 'download' | 'pipeline' | 'match-vndb' | 'match-egs';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isIntegerAtLeast(value: unknown, min: number): value is number {
  if (typeof value !== 'number') return false;
  if (!Number.isFinite(value)) return false;
  if (!Number.isInteger(value)) return false;
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) return false;
  if (value < min) return false;
  return true;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isBinaryNumber(value: unknown): value is number {
  return value === 0 || value === 1;
}

/** Decode the accepted response from `POST /api/alicenet/run`. */
export function decodeAliceNetRunAccepted(value: unknown): AliceNetRunAccepted | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    typeof record.jobId !== 'string' ||
    record.jobId.length === 0 ||
    !(record.op === 'download' || record.op === 'pipeline' || record.op === 'match-vndb' || record.op === 'match-egs')
  ) {
    return null;
  }
  return { jobId: record.jobId, op: record.op };
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

function decodeAliceNetItem(value: unknown): AliceNetClientItem | null {
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
    !isNullableNonNegativeNumber(record.vn_image_sexual) ||
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
    server_group_key: isString(record.server_group_key) ? record.server_group_key : '',
    server_group_count: isIntegerAtLeast(record.server_group_count, 0) ? record.server_group_count : 0,
  };
}

function decodeProducerOption(value: unknown): AliceNetProducerOption | null {
  const record = asJsonRecord(value);
  return record && isString(record.id) && isString(record.name) && isIntegerAtLeast(record.count, 0)
    ? { id: record.id, name: record.name, count: record.count }
    : null;
}

function decodeAliceNetStats(value: unknown): AliceNetClientStats | null {
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

function decodePendingCounts(value: unknown): AliceNetPendingCounts | null {
  const record = asJsonRecord(value);
  return record && isIntegerAtLeast(record.vndb_pending, 0) && isIntegerAtLeast(record.egs_pending, 0)
    ? { vndb_pending: record.vndb_pending, egs_pending: record.egs_pending }
    : null;
}

function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function decodeAliceNetPageMeta(value: unknown): AliceNetPageMeta | null {
  return decodeOffsetPageMeta(value, 240);
}

/**
 * Decode the AliceNet stock-browser payload before replacing client state.
 *
 * @param value Parsed local API payload.
 * @returns Safe browser snapshot, or `null` for malformed input.
 */
export function decodeAliceNetClientSnapshot(value: unknown): AliceNetClientSnapshot | null {
  const record = asJsonRecord(value);
  const items = decodeArray(record?.items, decodeAliceNetItem);
  const stats = decodeAliceNetStats(record?.stats);
  const pending = decodePendingCounts(record?.pending);
  if (!items || !stats || !pending || !isNullableFiniteNumber(record?.last_fetch)) return null;
  const producers = record.producers === undefined ? [] : decodeArray(record.producers, decodeProducerOption);
  if (!producers) return null;
  const wishlistAvailable = record.wishlist_available === undefined ? true : record.wishlist_available;
  if (!isBoolean(wishlistAvailable)) return null;
  if (record.page === undefined) {
    return { items, stats, pending, last_fetch: record.last_fetch, producers, wishlist_available: wishlistAvailable };
  }
  const page = decodeAliceNetPageMeta(record.page);
  return page ? { items, stats, pending, last_fetch: record.last_fetch, page, producers, wishlist_available: wishlistAvailable } : null;
}

/**
 * Decode a follow-up AliceNet stock page (items plus paging window only).
 *
 * @param value Parsed local API payload.
 * @returns Safe page, or `null` for malformed input.
 */
export function decodeAliceNetStockPage(value: unknown): AliceNetClientPage | null {
  const record = asJsonRecord(value);
  const items = decodeArray(record?.items, decodeAliceNetItem);
  const page = decodeAliceNetPageMeta(record?.page);
  return items && page ? { items, page } : null;
}

/**
 * Decode the source-page stock synchronization result.
 *
 * @param value Parsed local API payload.
 * @returns Safe synchronization counters, or `null` for malformed input.
 */
export function decodeAliceNetStockSyncResult(value: unknown): AliceNetStockSyncResult | null {
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
 * Decode one AliceNet batch-loop progress payload.
 *
 * @param value Parsed local API payload.
 * @returns Safe loop counters, or `null` for malformed input.
 */
export function decodeAliceNetLoopResult(value: unknown): AliceNetLoopResult | null {
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
