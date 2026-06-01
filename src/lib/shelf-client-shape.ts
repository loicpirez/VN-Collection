import { asJsonRecord } from './json-shape';
import { isValidVnId } from './vn-id-shape';
import type {
  ShelfDisplaySlotEntry,
  ShelfEntry,
  ShelfSlotEntry,
  ShelfUnit,
  ShelfUnitWithCount,
} from './db';
import { BOX_TYPES, type BoxType } from './types';

const BOX_TYPE_SET: ReadonlySet<string> = new Set(BOX_TYPES);

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isBoxType(value: unknown): value is BoxType {
  return typeof value === 'string' && BOX_TYPE_SET.has(value);
}

function isIntegerAtLeast(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function decodeShelfUnit(value: unknown): ShelfUnit | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isIntegerAtLeast(record.id, 1) ||
    !isString(record.name) ||
    !isIntegerAtLeast(record.cols, 1) ||
    !isIntegerAtLeast(record.rows, 1) ||
    !isIntegerAtLeast(record.order_index, 0) ||
    !isFiniteNumber(record.created_at) ||
    !isFiniteNumber(record.updated_at)
  ) {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    cols: record.cols,
    rows: record.rows,
    order_index: record.order_index,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function decodeShelfUnitWithCount(value: unknown): ShelfUnitWithCount | null {
  const shelf = decodeShelfUnit(value);
  const record = asJsonRecord(value);
  if (!shelf || !record || !isIntegerAtLeast(record.placed_count, 0)) return null;
  return { ...shelf, placed_count: record.placed_count };
}

function decodeShelfItemBase(value: unknown): {
  vn_id: string;
  release_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  rel_image_thumb: string | null;
  rel_image_url: string | null;
  rel_local_image_thumb: string | null;
  rel_image_sexual: number | null;
  edition_label: string | null;
  box_type: BoxType;
  condition: string | null;
  owned_platform: string | null;
  physical_location: string[];
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  vn_platforms: string[];
  vn_languages: string[];
  vn_released: string | null;
  rel_title: string | null;
  rel_platforms: string[];
  rel_languages: string[];
  rel_released: string | null;
  rel_resolution: string | null;
  dumped: boolean;
} | null {
  const record = asJsonRecord(value);
  const physicalLocation = decodeStringArray(record?.physical_location);
  const vnPlatforms = decodeStringArray(record?.vn_platforms);
  const vnLanguages = decodeStringArray(record?.vn_languages);
  const relPlatforms = decodeStringArray(record?.rel_platforms);
  const relLanguages = decodeStringArray(record?.rel_languages);
  if (
    !record ||
    !isString(record.vn_id) ||
    !isValidVnId(record.vn_id) ||
    !isString(record.release_id) ||
    !isString(record.vn_title) ||
    !isNullableString(record.vn_image_thumb) ||
    !isNullableString(record.vn_image_url) ||
    !isNullableString(record.vn_local_image_thumb) ||
    !isNullableNumber(record.vn_image_sexual) ||
    !isNullableString(record.rel_image_thumb) ||
    !isNullableString(record.rel_image_url) ||
    !isNullableString(record.rel_local_image_thumb) ||
    !isNullableNumber(record.rel_image_sexual) ||
    !isNullableString(record.edition_label) ||
    !isBoxType(record.box_type) ||
    !isNullableString(record.condition) ||
    !isNullableString(record.owned_platform) ||
    !physicalLocation ||
    !isNullableNumber(record.price_paid) ||
    !isNullableString(record.currency) ||
    !isNullableString(record.acquired_date) ||
    !vnPlatforms ||
    !vnLanguages ||
    !isNullableString(record.vn_released) ||
    !isNullableString(record.rel_title) ||
    !relPlatforms ||
    !relLanguages ||
    !isNullableString(record.rel_released) ||
    !isNullableString(record.rel_resolution) ||
    typeof record.dumped !== 'boolean'
  ) {
    return null;
  }
  return {
    vn_id: record.vn_id.toLowerCase(),
    release_id: record.release_id,
    vn_title: record.vn_title,
    vn_image_thumb: record.vn_image_thumb,
    vn_image_url: record.vn_image_url,
    vn_local_image_thumb: record.vn_local_image_thumb,
    vn_image_sexual: record.vn_image_sexual,
    rel_image_thumb: record.rel_image_thumb,
    rel_image_url: record.rel_image_url,
    rel_local_image_thumb: record.rel_local_image_thumb,
    rel_image_sexual: record.rel_image_sexual,
    edition_label: record.edition_label,
    box_type: record.box_type,
    condition: record.condition,
    owned_platform: record.owned_platform,
    physical_location: physicalLocation,
    price_paid: record.price_paid,
    currency: record.currency,
    acquired_date: record.acquired_date,
    vn_platforms: vnPlatforms,
    vn_languages: vnLanguages,
    vn_released: record.vn_released,
    rel_title: record.rel_title,
    rel_platforms: relPlatforms,
    rel_languages: relLanguages,
    rel_released: record.rel_released,
    rel_resolution: record.rel_resolution,
    dumped: record.dumped,
  };
}

function decodeShelfSlot(value: unknown): ShelfSlotEntry | null {
  const record = asJsonRecord(value);
  const item = decodeShelfItemBase(value);
  if (
    !record ||
    !item ||
    !isIntegerAtLeast(record.shelf_id, 1) ||
    !isIntegerAtLeast(record.row, 0) ||
    !isIntegerAtLeast(record.col, 0)
  ) {
    return null;
  }
  return { ...item, shelf_id: record.shelf_id, row: record.row, col: record.col };
}

function decodeShelfDisplay(value: unknown): ShelfDisplaySlotEntry | null {
  const record = asJsonRecord(value);
  const item = decodeShelfItemBase(value);
  if (
    !record ||
    !item ||
    !isIntegerAtLeast(record.shelf_id, 1) ||
    !isIntegerAtLeast(record.after_row, 0) ||
    !isIntegerAtLeast(record.position, 0) ||
    !isFiniteNumber(record.placed_at)
  ) {
    return null;
  }
  return {
    ...item,
    shelf_id: record.shelf_id,
    after_row: record.after_row,
    position: record.position,
    placed_at: record.placed_at,
  };
}

function decodeShelfEntry(value: unknown): ShelfEntry | null {
  const record = asJsonRecord(value);
  const item = decodeShelfItemBase(value);
  if (
    !record ||
    !item ||
    !isNullableString(record.notes) ||
    !isString(record.location) ||
    !isFiniteNumber(record.added_at) ||
    !isNullableNumber(record.rel_minage) ||
    typeof record.rel_patch !== 'boolean' ||
    typeof record.rel_freeware !== 'boolean' ||
    typeof record.rel_official !== 'boolean' ||
    typeof record.rel_has_ero !== 'boolean'
  ) {
    return null;
  }
  return {
    ...item,
    notes: record.notes,
    location: record.location,
    added_at: record.added_at,
    rel_minage: record.rel_minage,
    rel_patch: record.rel_patch,
    rel_freeware: record.rel_freeware,
    rel_official: record.rel_official,
    rel_has_ero: record.rel_has_ero,
  };
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

/**
 * Decode one shelf-detail response used for hydration and reconciliation.
 *
 * @param value Parsed local API payload.
 * @returns Safe shelf state, or `null` for malformed input.
 */
export function decodeShelfDetailResponse(value: unknown): {
  shelf: ShelfUnitWithCount;
  slots: ShelfSlotEntry[];
  displays: ShelfDisplaySlotEntry[];
} | null {
  const record = asJsonRecord(value);
  const shelf = decodeShelfUnit(record?.shelf);
  const slots = decodeArray(record?.slots, decodeShelfSlot);
  const displays = decodeArray(record?.displays, decodeShelfDisplay);
  if (!shelf || !slots || !displays) return null;
  return { shelf: { ...shelf, placed_count: slots.length + displays.length }, slots, displays };
}

/**
 * Decode shelf-list response data, including an optional unplaced pool.
 *
 * @param value Parsed local API payload.
 * @returns Safe shelf metadata and optional pool, or `null` for malformed input.
 */
export function decodeShelfListResponse(value: unknown): {
  shelves: ShelfUnitWithCount[];
  unplaced?: ShelfEntry[];
} | null {
  const record = asJsonRecord(value);
  const shelves = decodeArray(record?.shelves, decodeShelfUnitWithCount);
  if (!record || !shelves) return null;
  if (record.unplaced === undefined) return { shelves };
  const unplaced = decodeArray(record.unplaced, decodeShelfEntry);
  return unplaced ? { shelves, unplaced } : null;
}

/**
 * Decode a shelf-create response.
 *
 * @param value Parsed local API payload.
 * @returns Safe created shelf, or `null` for malformed input.
 */
export function decodeShelfCreateResponse(value: unknown): { shelf: ShelfUnit } | null {
  const record = asJsonRecord(value);
  const shelf = decodeShelfUnit(record?.shelf);
  return shelf ? { shelf } : null;
}

/**
 * Decode a slot-placement response.
 *
 * @param value Parsed local API payload.
 * @returns Safe authoritative slots, or `null` for malformed input.
 */
export function decodeShelfSlotsResponse(value: unknown): { slots: ShelfSlotEntry[] } | null {
  const record = asJsonRecord(value);
  const slots = decodeArray(record?.slots, decodeShelfSlot);
  return slots ? { slots } : null;
}

/**
 * Decode a shelf-resize response.
 *
 * @param value Parsed local API payload.
 * @returns Safe resized shelf state, or `null` for malformed input.
 */
export function decodeShelfResizeResponse(value: unknown): {
  shelf: ShelfUnit;
  slots: ShelfSlotEntry[];
  evicted: { vn_id: string; release_id: string }[];
} | null {
  const record = asJsonRecord(value);
  const shelf = decodeShelfUnit(record?.shelf);
  const slots = decodeArray(record?.slots, decodeShelfSlot);
  const evicted = decodeArray(record?.evicted, (row) => {
    const item = asJsonRecord(row);
    return item && isString(item.vn_id) && isValidVnId(item.vn_id) && isString(item.release_id)
      ? [{ vn_id: item.vn_id.toLowerCase(), release_id: item.release_id }][0]
      : null;
  });
  return shelf && slots && evicted ? { shelf, slots, evicted } : null;
}
