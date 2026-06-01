import { asJsonRecord } from './json-shape';
import { decodeEgsSearchCandidates, decodeVndbSearchResults } from './search-client-shape';
import { isValidVnId } from './vn-id-shape';

const MAX_PICKER_ROWS = 2_000;
const TAG_CATEGORIES = new Set(['cont', 'ero', 'tech']);

/** Compact tag row rendered by tag autocomplete. */
export interface TagPickerSummary {
  id: string;
  name: string;
  category: 'cont' | 'ero' | 'tech';
  vn_count: number;
}

/** Compact producer row rendered by the brand-overlap picker. */
export interface ProducerPickerRow {
  id: string;
  name: string;
  original: string | null;
  vn_count: number;
}

/** One normalized source row rendered by the unified VN picker. */
export interface VnSourcePickerRow {
  id: string;
  title: string;
  released: string | null;
  thumbnail: string | null;
  localThumbnail: string | null;
}

/** Successful producer-association refresh result. */
export interface ProducerRefreshSummary {
  developers: number;
  publishers: number;
  owned: number;
  stale: boolean;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Decode tag autocomplete rows.
 *
 * @param value Parsed local tags API payload.
 * @returns Safe tag rows, or `null` for malformed input.
 */
export function decodeTagPickerResults(value: unknown): TagPickerSummary[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.tags) || record.tags.length > MAX_PICKER_ROWS) return null;
  const rows: TagPickerSummary[] = [];
  for (const value of record.tags) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !/^g\d+$/i.test(row.id) ||
      typeof row.name !== 'string' ||
      typeof row.category !== 'string' ||
      !TAG_CATEGORIES.has(row.category) ||
      !isNonNegativeInteger(row.vn_count)
    ) {
      return null;
    }
    rows.push({
      id: row.id.toLowerCase(),
      name: row.name,
      category: row.category as TagPickerSummary['category'],
      vn_count: row.vn_count,
    });
  }
  return rows;
}

/**
 * Decode local producer rankings for the brand-overlap picker.
 *
 * @param value Parsed local producers API payload.
 * @returns Safe producer rows, or `null` for malformed input.
 */
export function decodeProducerPickerResults(value: unknown): ProducerPickerRow[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.producers) || record.producers.length > MAX_PICKER_ROWS) return null;
  const rows: ProducerPickerRow[] = [];
  for (const value of record.producers) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !/^p\d+$/i.test(row.id) ||
      typeof row.name !== 'string' ||
      !isNullableString(row.original) ||
      !isNonNegativeInteger(row.vn_count)
    ) {
      return null;
    }
    rows.push({ id: row.id.toLowerCase(), name: row.name, original: row.original, vn_count: row.vn_count });
  }
  return rows;
}

/**
 * Decode local collection lookup rows for the unified VN picker.
 *
 * @param value Parsed local collection-find payload.
 * @returns Safe normalized rows, or `null` for malformed input.
 */
export function decodeLocalVnSourcePickerResults(value: unknown): VnSourcePickerRow[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.matches) || record.matches.length > MAX_PICKER_ROWS) return null;
  const rows: VnSourcePickerRow[] = [];
  for (const value of record.matches) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !isValidVnId(row.id) ||
      typeof row.title !== 'string' ||
      !isNullableString(row.image_url) ||
      !isNullableString(row.image_thumb) ||
      !isNullableString(row.local_image) ||
      !isNullableString(row.local_image_thumb)
    ) {
      return null;
    }
    rows.push({
      id: row.id.toLowerCase(),
      title: row.title,
      released: null,
      thumbnail: row.image_thumb ?? row.image_url,
      localThumbnail: row.local_image_thumb ?? row.local_image,
    });
  }
  return rows;
}

/**
 * Decode VNDB search rows for the unified VN picker.
 *
 * @param value Parsed local VNDB search payload.
 * @returns Safe normalized rows, or `null` for malformed input.
 */
export function decodeVndbSourcePickerResults(value: unknown): VnSourcePickerRow[] | null {
  const rows = decodeVndbSearchResults(value);
  return rows?.map((row) => ({
    id: row.id,
    title: row.title,
    released: row.released,
    thumbnail: row.image?.thumbnail ?? row.image?.url ?? null,
    localThumbnail: null,
  })) ?? null;
}

/**
 * Decode EGS candidate rows for the unified VN picker.
 *
 * @param value Parsed local EGS search payload.
 * @returns Safe normalized rows, or `null` for malformed input.
 */
export function decodeEgsSourcePickerResults(value: unknown): VnSourcePickerRow[] | null {
  const rows = decodeEgsSearchCandidates(value);
  return rows?.map((row) => ({
    id: `egs_${row.id}`,
    title: row.gamename,
    released: row.sellday,
    thumbnail: null,
    localThumbnail: null,
  })) ?? null;
}

/**
 * Decode a successful producer refresh response.
 *
 * @param value Parsed local producer-refresh payload.
 * @returns Safe counters, or `null` for malformed input.
 */
export function decodeProducerRefreshSummary(value: unknown): ProducerRefreshSummary | null {
  const record = asJsonRecord(value);
  return record &&
    isNonNegativeFiniteNumber(record.developers) &&
    isNonNegativeFiniteNumber(record.publishers) &&
    isNonNegativeFiniteNumber(record.owned) &&
    typeof record.stale === 'boolean'
    ? {
        developers: record.developers,
        publishers: record.publishers,
        owned: record.owned,
        stale: record.stale,
      }
    : null;
}
