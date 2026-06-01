import { asJsonRecord } from './json-shape';
import {
  decodeVndbUlistEntryDetailRow,
  decodeVndbUlistEntryRow,
  decodeVndbUlistLabelsResponse,
} from './vndb-client-shape';
import type { VndbUlistEntry, VndbUlistEntryDetail, VndbUlistLabel } from './vndb';

const MAX_WISHLIST_ROWS = 1_000;

/** Local VNDB-status route payload consumed by VN detail surfaces. */
export interface VndbStatusClientState {
  entry: VndbUlistEntryDetail | null;
  labels: VndbUlistLabel[];
  needsAuth: boolean;
}

/** EGS summary attached to a VNDB wishlist row. */
export interface WishlistEgsSummary {
  median: number | null;
  playtime_median_minutes: number | null;
}

/** One VNDB wishlist row enriched with local collection and EGS state. */
export interface WishlistClientItem extends VndbUlistEntry {
  in_collection: boolean;
  egs: WishlistEgsSummary | null;
}

/** Local wishlist route payload consumed by the wishlist page. */
export interface WishlistClientState {
  needsAuth: boolean;
  items: WishlistClientItem[];
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function decodeWishlistEgsSummary(value: unknown): WishlistEgsSummary | null | undefined {
  if (value === null) return null;
  const record = asJsonRecord(value);
  return record &&
    isNullableFiniteNumber(record.median) &&
    isNullableFiniteNumber(record.playtime_median_minutes)
    ? {
        median: record.median,
        playtime_median_minutes: record.playtime_median_minutes,
      }
    : undefined;
}

/**
 * Decode a VNDB-status route response before assigning React state.
 *
 * @param value Parsed local API payload.
 * @returns Safe status state, or `null` for malformed input.
 */
export function decodeVndbStatusClientState(value: unknown): VndbStatusClientState | null {
  const record = asJsonRecord(value);
  const rawEntry = record?.entry;
  const labels = decodeVndbUlistLabelsResponse({ labels: record?.labels });
  const entry = rawEntry === null
    ? null
    : decodeVndbUlistEntryDetailRow(rawEntry);
  if (
    !record ||
    (record.needsAuth !== undefined && typeof record.needsAuth !== 'boolean') ||
    !labels ||
    (entry === null && rawEntry !== null)
  ) {
    return null;
  }
  return {
    entry,
    labels: labels.labels,
    needsAuth: record.needsAuth === true,
  };
}

/**
 * Decode the local wishlist response before rendering cards.
 *
 * @param value Parsed local API payload.
 * @returns Safe wishlist state, or `null` for malformed input.
 */
export function decodeWishlistClientState(value: unknown): WishlistClientState | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    (record.needsAuth !== undefined && typeof record.needsAuth !== 'boolean') ||
    !Array.isArray(record.items) ||
    record.items.length > MAX_WISHLIST_ROWS
  ) {
    return null;
  }
  const items: WishlistClientItem[] = [];
  for (const value of record.items) {
    const row = asJsonRecord(value);
    const entry = decodeVndbUlistEntryRow(value);
    const egs = decodeWishlistEgsSummary(row?.egs);
    if (!row || !entry || typeof row.in_collection !== 'boolean' || egs === undefined) {
      return null;
    }
    items.push({ ...entry, in_collection: row.in_collection, egs });
  }
  return {
    needsAuth: record.needsAuth === true,
    items,
  };
}
