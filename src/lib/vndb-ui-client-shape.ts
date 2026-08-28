import { asJsonRecord } from './json-shape';
import {
  decodeVndbUlistEntryDetailRow,
  decodeVndbUlistEntryRow,
  decodeVndbUlistLabelsResponse,
} from './vndb-client-shape';
import type { VndbUlistEntry, VndbUlistEntryDetail, VndbUlistLabel } from './vndb';
import { isVndbReleaseListStatus, type VndbReleaseListStatus } from './vndb-release-list-shape';
import type { WishlistFacets, WishlistPageMetadata, WishlistSummary } from './wishlist-pagination';
import { decodeNumberedPageMeta } from './server-pagination';
import { isValidVnId, normalizeVnId } from './vn-id-shape';
import { isValidStatus } from './types';
import {
  VNDB_SYNC_FIELDS,
  type LocalVndbUserData,
  type VndbSyncField,
  type VndbUserDataDifference,
} from './vndb-user-data-sync';

const MAX_WISHLIST_ROWS = 1_000;

/** Local VNDB-status route payload consumed by VN detail surfaces. */
export interface VndbStatusClientState {
  entry: VndbUlistEntryDetail | null;
  labels: VndbUlistLabel[];
  needsAuth: boolean;
  local: LocalVndbUserData | null;
  differences: VndbUserDataDifference[];
}

/** Local release-list route payload consumed by the release detail page. */
export interface VndbReleaseListClientState {
  needsAuth: boolean;
  status: VndbReleaseListStatus | null;
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
  page?: WishlistPageMetadata;
  facets?: WishlistFacets;
  summary?: WishlistSummary;
  download_items?: Array<{ id: string; title: string }>;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeUniqueStrings(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum || !value.every((entry) => typeof entry === 'string')) return null;
  return new Set(value).size === value.length ? value : null;
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
  const local = decodeLocalVndbUserData(record.local);
  const differences = decodeVndbUserDataDifferences(record.differences);
  if (local === undefined || differences === null) return null;
  return {
    entry,
    labels: labels.labels,
    needsAuth: record.needsAuth === true,
    local,
    differences,
  };
}

/** Decode one release-list route response before assigning React state. */
export function decodeVndbReleaseListClientState(value: unknown): VndbReleaseListClientState | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    (record.needsAuth !== undefined && typeof record.needsAuth !== 'boolean') ||
    !(record.status === null || isVndbReleaseListStatus(record.status))
  ) {
    return null;
  }
  return {
    needsAuth: record.needsAuth === true,
    status: record.status,
  };
}

function decodeLocalVndbUserData(value: unknown): LocalVndbUserData | null | undefined {
  if (value === undefined || value === null) return null;
  const record = asJsonRecord(value);
  if (
    !record ||
    !(record.status === null || isValidStatus(record.status)) ||
    !(record.vote === null || typeof record.vote === 'number' && Number.isSafeInteger(record.vote) && record.vote >= 10 && record.vote <= 100) ||
    !(record.started === null || typeof record.started === 'string') ||
    !(record.finished === null || typeof record.finished === 'string') ||
    !(record.notes === null || typeof record.notes === 'string')
  ) {
    return undefined;
  }
  return {
    status: record.status,
    vote: record.vote,
    started: record.started,
    finished: record.finished,
    notes: record.notes,
  };
}

function decodeSyncValue(field: VndbSyncField, value: unknown): string | number | null | undefined {
  if (value === null) return null;
  if (field === 'status') return isValidStatus(value) ? value : undefined;
  if (field === 'vote') {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 10 && value <= 100
      ? value
      : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function decodeVndbUserDataDifferences(rawValue: unknown): VndbUserDataDifference[] | null {
  if (rawValue === undefined) return [];
  if (!Array.isArray(rawValue) || rawValue.length > VNDB_SYNC_FIELDS.length) return null;
  const allowed = new Set<string>(VNDB_SYNC_FIELDS);
  const differences: VndbUserDataDifference[] = [];
  for (const value of rawValue) {
    const row = asJsonRecord(value);
    if (!row || typeof row.field !== 'string' || !allowed.has(row.field)) return null;
    const field = row.field as VndbSyncField;
    const local = decodeSyncValue(field, row.local);
    const remote = decodeSyncValue(field, row.remote);
    if (
      local === undefined ||
      remote === undefined ||
      typeof row.canPullRemote !== 'boolean' ||
      typeof row.canPushLocal !== 'boolean'
    ) {
      return null;
    }
    differences.push({ field, local, remote, canPullRemote: row.canPullRemote, canPushLocal: row.canPushLocal });
  }
  return new Set(differences.map((difference) => difference.field)).size === differences.length
    ? differences
    : null;
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
  const base: WishlistClientState = {
    needsAuth: record.needsAuth === true,
    items,
  };
  if (record.page === undefined) return base;
  const page = decodeNumberedPageMeta(record.page, 120);
  const pageRecord = asJsonRecord(record.page);
  const facets = asJsonRecord(record.facets);
  const summary = asJsonRecord(record.summary);
  const languages = decodeUniqueStrings(facets?.languages, 256);
  const platforms = decodeUniqueStrings(facets?.platforms, 256);
  if (
    !page ||
    !pageRecord ||
    typeof pageRecord.grouped !== 'boolean' ||
    !facets || !languages || !platforms ||
    !summary ||
    !isNonNegativeInteger(summary.total) ||
    !isNonNegativeInteger(summary.owned) ||
    !isNonNegativeInteger(summary.todo) ||
    summary.owned + summary.todo !== summary.total ||
    !Array.isArray(record.download_items) ||
    record.download_items.length > MAX_WISHLIST_ROWS
  ) {
    return null;
  }
  const downloadItems: Array<{ id: string; title: string }> = [];
  const downloadIds = new Set<string>();
  for (const value of record.download_items) {
    const row = asJsonRecord(value);
    if (!row || typeof row.id !== 'string' || !isValidVnId(row.id) || typeof row.title !== 'string') return null;
    const id = normalizeVnId(row.id);
    if (downloadIds.has(id)) return null;
    downloadIds.add(id);
    downloadItems.push({ id, title: row.title });
  }
  return {
    ...base,
    page: {
      page: page.page,
      page_size: page.page_size,
      total: page.total,
      total_pages: page.total_pages,
      start: page.start,
      end: page.end,
      grouped: pageRecord.grouped,
    },
    facets: { languages, platforms },
    summary: { total: summary.total, owned: summary.owned, todo: summary.todo },
    download_items: downloadItems,
  };
}
