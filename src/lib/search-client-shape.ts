import { decodeEgsCandidates, decodeEgsGame } from './egs-cache-shape';
import type { EgsCandidate, EgsGame } from './erogamescape';
import { asJsonRecord } from './json-shape';
import type { VndbSearchHit } from './types';
import { isValidVnId, isVndbVnId, normalizeVnId } from './vn-id-shape';
import { decodeVndbSearchRow } from './vndb-search-row-shape';

const MAX_SEARCH_ROWS = 100;

/** Compact VNDB row rendered by manual-link search dialogs. */
export interface VndbPickerHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

/** Current manually pinned EGS-to-VNDB row. */
export interface EgsVndbManualLink {
  egs_id: number;
  vn_id: string | null;
  note: string | null;
  updated_at: number;
}

/** Current VN-to-EGS mapping state rendered by the picker dialog. */
export interface VnEgsMappingState {
  egs_id: number | null;
  source: VnEgsMappingSource;
}

/** Provenance labels returned by the VN-to-EGS resolver. */
export type VnEgsMappingSource = 'manual' | 'manual-none' | 'extlink' | 'search' | null;

/** Full VN-to-EGS resolver payload rendered by the VN detail panel. */
export interface VnEgsGameSnapshot {
  game: EgsGame | null;
  source: VnEgsMappingSource;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isMappingSource(value: unknown): value is VnEgsMappingSource {
  return value === null || value === 'manual' || value === 'manual-none' || value === 'extlink' || value === 'search';
}

function decodeSearchHit(value: unknown): VndbSearchHit | null {
  const record = asJsonRecord(value);
  const row = decodeVndbSearchRow(value);
  if (!record || !row || typeof record.in_collection !== 'boolean') return null;
  return {
    ...row,
    in_collection: record.in_collection,
  };
}

function decodePickerHit(value: unknown): VndbPickerHit | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.id) ||
    !isVndbVnId(record.id) ||
    !isString(record.title) ||
    !isNullableString(record.released)
  ) {
    return null;
  }
  const developers = Array.isArray(record.developers)
    ? record.developers.flatMap((developer) => {
      const row = asJsonRecord(developer);
      return row && isString(row.id) && /^p\d+$/i.test(row.id) && isString(row.name)
        ? [{ id: row.id.toLowerCase(), name: row.name }]
        : [];
    })
    : undefined;
  return {
    id: record.id.toLowerCase(),
    title: record.title,
    released: record.released,
    ...(developers ? { developers } : {}),
  };
}

function decodeResults<T>(value: unknown, decodeRow: (row: unknown) => T | null): T[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.results) || record.results.length > MAX_SEARCH_ROWS) return null;
  const out: T[] = [];
  for (const row of record.results) {
    const decoded = decodeRow(row);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

/**
 * Decode rich VNDB card-search results returned by local search routes.
 *
 * @param value Parsed local API payload.
 * @returns Safe card rows, or `null` for malformed input.
 */
export function decodeVndbSearchResults(value: unknown): VndbSearchHit[] | null {
  return decodeResults(value, decodeSearchHit);
}

/**
 * Decode compact VNDB picker rows returned by the local search route.
 *
 * @param value Parsed local API payload.
 * @returns Safe picker rows, or `null` for malformed input.
 */
export function decodeVndbPickerResults(value: unknown): VndbPickerHit[] | null {
  return decodeResults(value, decodePickerHit);
}

/**
 * Decode EGS search candidates returned by the local EGS search route.
 *
 * @param value Parsed local API payload.
 * @returns Safe EGS candidates, or `null` for malformed input.
 */
export function decodeEgsSearchCandidates(value: unknown): EgsCandidate[] | null {
  return decodeEgsCandidates(asJsonRecord(value)?.candidates);
}

/**
 * Decode an EGS-to-VNDB manual mapping payload.
 *
 * @param value Parsed local API payload.
 * @returns Safe mapping row, or `null` for absent or malformed input.
 */
export function decodeEgsVndbManualLink(value: unknown): EgsVndbManualLink | null | undefined {
  const link = asJsonRecord(value)?.link;
  if (link === null) return null;
  const record = asJsonRecord(link);
  if (
    !record ||
    !isPositiveInteger(record.egs_id) ||
    !(record.vn_id === null || (isString(record.vn_id) && isVndbVnId(record.vn_id))) ||
    !isNullableString(record.note) ||
    !isNonNegativeFiniteNumber(record.updated_at)
  ) {
    return undefined;
  }
  return {
    egs_id: record.egs_id,
    vn_id: record.vn_id?.toLowerCase() ?? null,
    note: record.note,
    updated_at: record.updated_at,
  };
}

/**
 * Decode the current VN-to-EGS mapping payload.
 *
 * @param value Parsed local API payload.
 * @returns Safe mapping state, or `null` for malformed input.
 */
export function decodeVnEgsMappingState(value: unknown): VnEgsMappingState | null {
  const record = asJsonRecord(value);
  const game = record?.game === null ? null : asJsonRecord(record?.game);
  const manual = record?.manual === null ? null : asJsonRecord(record?.manual);
  if (
    !record ||
    !(game === null || (game && isPositiveInteger(game.id))) ||
    !(manual === null || (manual && (manual.egs_id === null || isPositiveInteger(manual.egs_id)))) ||
    !isMappingSource(record.source)
  ) {
    return null;
  }
  const egsId = manual && isPositiveInteger(manual.egs_id)
    ? manual.egs_id
    : game && isPositiveInteger(game.id)
      ? game.id
      : null;
  return {
    egs_id: egsId,
    source: record.source,
  };
}

/**
 * Decode one VN-to-EGS resolver response before rendering full game metadata.
 *
 * @param value Parsed local API payload.
 * @returns Safe resolver snapshot, or `null` for malformed input.
 */
export function decodeVnEgsGameSnapshot(value: unknown): VnEgsGameSnapshot | null {
  const record = asJsonRecord(value);
  if (!record || !isMappingSource(record.source)) return null;
  if (record.game === null) return { game: null, source: record.source };
  const game = decodeEgsGame(record.game);
  return game ? { game, source: record.source } : null;
}

/**
 * Decode the synthetic EGS-only collection-add response.
 *
 * @param value Parsed local API payload.
 * @returns Canonical local VN id, or `null` for malformed input.
 */
export function decodeAddedEgsVnId(value: unknown): string | null {
  const id = asJsonRecord(value)?.vn_id;
  return isString(id) && isValidVnId(id) ? normalizeVnId(id) : null;
}
