import { asJsonRecord } from './json-shape';
import type { SeriesRow } from './types';

const MAX_LIST_ROWS = 2_000;
const MAX_FILTER_ROWS = 500;
const MAX_STORAGE_PATH_LENGTH = 200;

/** Compact user-list row rendered by list membership controls. */
export interface OrganizerUserList {
  id: number;
  name: string;
  color: string | null;
  pinned: number;
}

/** Saved library-filter row rendered by the saved-filter popover. */
export interface OrganizerSavedFilter {
  id: number;
  name: string;
  params: string;
  position: number;
  created_at: number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function decodeSeriesRow(value: unknown): SeriesRow | null {
  const row = asJsonRecord(value);
  return row &&
    isPositiveInteger(row.id) &&
    typeof row.name === 'string' &&
    isNullableString(row.description) &&
    isNullableString(row.cover_path) &&
    isNullableString(row.banner_path) &&
    isNonNegativeInteger(row.created_at) &&
    isNonNegativeInteger(row.updated_at)
    ? {
      id: row.id,
      name: row.name,
      description: row.description,
      cover_path: row.cover_path,
      banner_path: row.banner_path,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
    : null;
}

function decodeUserList(value: unknown): OrganizerUserList | null {
  const record = asJsonRecord(value);
  return record &&
    isPositiveInteger(record.id) &&
    typeof record.name === 'string' &&
    (record.color === null || typeof record.color === 'string') &&
    (record.pinned === 0 || record.pinned === 1)
    ? { id: record.id, name: record.name, color: record.color, pinned: record.pinned }
    : null;
}

/**
 * Decode a local user-list registry or VN-membership response.
 *
 * @param value Parsed local API payload.
 * @returns Safe list rows, or `null` for malformed input.
 */
export function decodeOrganizerUserLists(value: unknown): OrganizerUserList[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.lists) || record.lists.length > MAX_LIST_ROWS) return null;
  const lists = record.lists.map(decodeUserList);
  return lists.some((list) => list === null) ? null : lists as OrganizerUserList[];
}

/**
 * Decode a newly created user list.
 *
 * @param value Parsed local API payload.
 * @returns Safe list row, or `null` for malformed input.
 */
export function decodeCreatedOrganizerUserList(value: unknown): OrganizerUserList | null {
  return decodeUserList(asJsonRecord(value)?.list);
}

/**
 * Decode saved library-filter rows.
 *
 * @param value Parsed local API payload.
 * @returns Safe filter rows, or `null` for malformed input.
 */
export function decodeOrganizerSavedFilters(value: unknown): OrganizerSavedFilter[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.filters) || record.filters.length > MAX_FILTER_ROWS) return null;
  const filters: OrganizerSavedFilter[] = [];
  for (const value of record.filters) {
    const row = asJsonRecord(value);
    if (
      !row ||
      !isPositiveInteger(row.id) ||
      typeof row.name !== 'string' ||
      typeof row.params !== 'string' ||
      !isNonNegativeInteger(row.position) ||
      !isNonNegativeInteger(row.created_at)
    ) {
      return null;
    }
    filters.push({
      id: row.id,
      name: row.name,
      params: row.params,
      position: row.position,
      created_at: row.created_at,
    });
  }
  return filters;
}

/**
 * Decode a newly created series identity.
 *
 * @param value Parsed local API payload.
 * @returns Positive series id, or `null` for malformed input.
 */
export function decodeCreatedSeriesId(value: unknown): number | null {
  const id = asJsonRecord(asJsonRecord(value)?.series)?.id;
  return isPositiveInteger(id) ? id : null;
}

/**
 * Decode a newly created series row before appending it to organizer state.
 *
 * @param value Parsed local API payload.
 * @returns Safe series row, or `null` for malformed input.
 */
export function decodeCreatedSeriesRow(value: unknown): SeriesRow | null {
  return decodeSeriesRow(asJsonRecord(value)?.series);
}

/**
 * Decode a relative storage path returned after a series image upload.
 *
 * @param value Parsed local API payload.
 * @returns Relative storage path, or `null` for malformed input.
 */
export function decodeSeriesImagePath(value: unknown): string | null {
  const path = asJsonRecord(value)?.path;
  return typeof path === 'string' &&
    path.length > 0 &&
    path.length <= MAX_STORAGE_PATH_LENGTH &&
    !path.includes('..') &&
    !path.includes('\0') &&
    /^[A-Za-z0-9._/-]+$/.test(path)
    ? path
    : null;
}
