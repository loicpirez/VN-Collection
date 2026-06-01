import { isAspectKey, type AspectKey } from './aspect-ratio';
import { asJsonRecord } from './json-shape';
import { BOX_TYPES, LOCATIONS, type BoxType, type Location } from './types';
import type { VndbRelease } from './vndb-types';
import { isValidVnId } from './vn-id-shape';
import { decodeVndbRelease } from './vndb-release-shape';

const MAX_RELEASE_ROWS = 100;
const RELEASE_ID_RE = /^(?:r\d+|synthetic:(?:v\d+|egs_\d+))$/i;

/** One owned-edition row rendered on the VN-detail page. */
export interface OwnedEditionClientRow {
  vn_id: string;
  release_id: string;
  notes: string | null;
  location: Location;
  physical_location: string[];
  box_type: BoxType;
  edition_label: string | null;
  condition: string | null;
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  purchase_place: string | null;
  owned_platform: string | null;
  rel_platforms: string[];
  dumped: boolean;
  added_at: number;
  shelf:
    | { kind: 'cell'; id: number; name: string; row: number; col: number }
    | { kind: 'display'; id: number; name: string; afterRow: number; position: number }
    | null;
  aspect: {
    width: number | null;
    height: number | null;
    raw_resolution: string | null;
    aspect_key: AspectKey;
    source: 'manual' | 'vndb' | 'unknown';
    note: string | null;
  };
}

/** VN-detail aspect endpoint response. */
export interface VnAspectClientState {
  override: { aspect_key: AspectKey; note: string | null } | null;
  derived: AspectKey;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

/**
 * Decode one release row returned by the local VN-detail release route.
 *
 * @param value Parsed release row.
 * @returns Safe release row, or `null` for malformed input.
 */
export function decodeVnDetailRelease(value: unknown): VndbRelease | null {
  return decodeVndbRelease(value);
}

/**
 * Decode a local VN release-list response.
 *
 * @param value Parsed local API payload.
 * @returns Safe releases, or `null` for malformed input.
 */
export function decodeVnDetailReleasesResponse(value: unknown): VndbRelease[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.releases) || record.releases.length > MAX_RELEASE_ROWS) return null;
  const releases = record.releases.map(decodeVnDetailRelease);
  return releases.some((release) => release === null) ? null : releases as VndbRelease[];
}

function decodeOwnedShelf(value: unknown): OwnedEditionClientRow['shelf'] | undefined {
  if (value === null) return null;
  const row = asJsonRecord(value);
  if (!row || !isString(row.kind) || !isSafeInteger(row.id) || !isString(row.name)) return undefined;
  if (row.kind === 'cell' && isSafeInteger(row.row) && isSafeInteger(row.col)) {
    return { kind: 'cell', id: row.id, name: row.name, row: row.row, col: row.col };
  }
  if (row.kind === 'display' && isSafeInteger(row.afterRow) && isSafeInteger(row.position)) {
    return { kind: 'display', id: row.id, name: row.name, afterRow: row.afterRow, position: row.position };
  }
  return undefined;
}

function decodeOwnedAspect(value: unknown): OwnedEditionClientRow['aspect'] | null {
  const row = asJsonRecord(value);
  return row &&
    isNullableFiniteNumber(row.width) &&
    isNullableFiniteNumber(row.height) &&
    isNullableString(row.raw_resolution) &&
    isAspectKey(row.aspect_key) &&
    (row.source === 'manual' || row.source === 'vndb' || row.source === 'unknown') &&
    isNullableString(row.note)
    ? {
        width: row.width,
        height: row.height,
        raw_resolution: row.raw_resolution,
        aspect_key: row.aspect_key,
        source: row.source,
        note: row.note,
      }
    : null;
}

function decodeOwnedEdition(value: unknown): OwnedEditionClientRow | null {
  const row = asJsonRecord(value);
  const physicalLocation = decodeStringArray(row?.physical_location);
  const relPlatforms = decodeStringArray(row?.rel_platforms);
  const shelf = decodeOwnedShelf(row?.shelf);
  const aspect = decodeOwnedAspect(row?.aspect);
  if (
    !row ||
    !isString(row.vn_id) ||
    !isValidVnId(row.vn_id) ||
    !isString(row.release_id) ||
    !RELEASE_ID_RE.test(row.release_id) ||
    !isNullableString(row.notes) ||
    !isString(row.location) ||
    !(LOCATIONS as readonly string[]).includes(row.location) ||
    !physicalLocation ||
    !isString(row.box_type) ||
    !(BOX_TYPES as readonly string[]).includes(row.box_type) ||
    !isNullableString(row.edition_label) ||
    !isNullableString(row.condition) ||
    !isNullableFiniteNumber(row.price_paid) ||
    !isNullableString(row.currency) ||
    !isNullableString(row.acquired_date) ||
    !isNullableString(row.purchase_place) ||
    !isNullableString(row.owned_platform) ||
    !relPlatforms ||
    typeof row.dumped !== 'boolean' ||
    !isFiniteNumber(row.added_at) ||
    shelf === undefined ||
    !aspect
  ) {
    return null;
  }
  return {
    vn_id: row.vn_id.toLowerCase(),
    release_id: row.release_id.toLowerCase(),
    notes: row.notes,
    location: row.location as Location,
    physical_location: physicalLocation,
    box_type: row.box_type as BoxType,
    edition_label: row.edition_label,
    condition: row.condition,
    price_paid: row.price_paid,
    currency: row.currency,
    acquired_date: row.acquired_date,
    purchase_place: row.purchase_place,
    owned_platform: row.owned_platform,
    rel_platforms: relPlatforms,
    dumped: row.dumped,
    added_at: row.added_at,
    shelf,
    aspect,
  };
}

/**
 * Decode a local owned-editions response.
 *
 * @param value Parsed local API payload.
 * @returns Safe owned editions, or `null` for malformed input.
 */
export function decodeOwnedEditionsResponse(value: unknown): OwnedEditionClientRow[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.owned)) return null;
  const owned = record.owned.map(decodeOwnedEdition);
  return owned.some((edition) => edition === null) ? null : owned as OwnedEditionClientRow[];
}

/**
 * Decode the local VN-aspect response.
 *
 * @param value Parsed local API payload.
 * @returns Safe aspect state, or `null` for malformed input.
 */
export function decodeVnAspectClientState(value: unknown): VnAspectClientState | null {
  const record = asJsonRecord(value);
  const override = record?.override === null ? null : asJsonRecord(record?.override);
  if (
    !record ||
    !isAspectKey(record.derived) ||
    (override !== null && (!isAspectKey(override.aspect_key) || !isNullableString(override.note)))
  ) {
    return null;
  }
  return {
    derived: record.derived,
    override: override === null
      ? null
      : { aspect_key: override.aspect_key as AspectKey, note: override.note as string | null },
  };
}
