import { asJsonRecord } from './json-shape';
import type { VndbExtLink, VndbProducer, VndbStaff, VndbStaffAlias, VndbTag, VndbTrait } from './vndb';

const MAX_NESTED_ROWS = 5000;
const TAG_CATEGORIES = new Set(['cont', 'ero', 'tech']);

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function decodeArray<T>(value: unknown, decode: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_NESTED_ROWS) return null;
  const out: T[] = [];
  for (const item of value) {
    const decoded = decode(item);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function decodeStringArray(value: unknown): string[] | null {
  return decodeArray(value, (item) => isString(item) ? item : null);
}

function decodeExtLink(value: unknown): VndbExtLink | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    !isString(row.url) ||
    !isString(row.label) ||
    !isString(row.name) ||
    (row.id !== undefined && row.id !== null && !isString(row.id) && typeof row.id !== 'number')
  ) {
    return null;
  }
  return {
    url: row.url,
    label: row.label,
    name: row.name,
    ...(row.id !== undefined ? { id: row.id as string | number | null } : {}),
  };
}

function decodeStaffAlias(value: unknown): VndbStaffAlias | null {
  const row = asJsonRecord(value);
  return row &&
    isNonNegativeInteger(row.aid) &&
    isString(row.name) &&
    isNullableString(row.latin) &&
    typeof row.ismain === 'boolean'
    ? { aid: row.aid, name: row.name, latin: row.latin, ismain: row.ismain }
    : null;
}

/** Decode one full VNDB producer profile row. */
export function decodeVndbProducer(value: unknown): VndbProducer | null {
  const row = asJsonRecord(value);
  const aliases = decodeStringArray(row?.aliases);
  const extlinks = decodeArray(row?.extlinks, decodeExtLink);
  if (
    !row ||
    !isString(row.id) ||
    !/^p\d+$/i.test(row.id) ||
    !isString(row.name) ||
    !isNullableString(row.original) ||
    !aliases ||
    !isNullableString(row.lang) ||
    !isNullableString(row.type) ||
    !isNullableString(row.description) ||
    !extlinks
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    original: row.original,
    aliases,
    lang: row.lang,
    type: row.type,
    description: row.description,
    extlinks,
  };
}

/** Decode one full VNDB staff profile row. */
export function decodeVndbStaff(value: unknown): VndbStaff | null {
  const row = asJsonRecord(value);
  const aliases = decodeArray(row?.aliases, decodeStaffAlias);
  const extlinks = decodeArray(row?.extlinks, decodeExtLink);
  if (
    !row ||
    !isString(row.id) ||
    !/^s\d+$/i.test(row.id) ||
    !isNonNegativeInteger(row.aid) ||
    typeof row.ismain !== 'boolean' ||
    !isString(row.name) ||
    !isNullableString(row.original) ||
    !isNullableString(row.lang) ||
    !isNullableString(row.gender) ||
    !isNullableString(row.description) ||
    !aliases ||
    !extlinks
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    aid: row.aid,
    ismain: row.ismain,
    name: row.name,
    original: row.original,
    lang: row.lang,
    gender: row.gender,
    description: row.description,
    aliases,
    extlinks,
  };
}

/** Decode one full VNDB tag profile row. */
export function decodeVndbTag(value: unknown): VndbTag | null {
  const row = asJsonRecord(value);
  const aliases = decodeStringArray(row?.aliases);
  if (
    !row ||
    !isString(row.id) ||
    !/^g\d+$/i.test(row.id) ||
    !isString(row.name) ||
    !aliases ||
    !isNullableString(row.description) ||
    !isString(row.category) ||
    !TAG_CATEGORIES.has(row.category) ||
    typeof row.searchable !== 'boolean' ||
    typeof row.applicable !== 'boolean' ||
    !isNonNegativeInteger(row.vn_count)
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    aliases,
    description: row.description,
    category: row.category as VndbTag['category'],
    searchable: row.searchable,
    applicable: row.applicable,
    vn_count: row.vn_count,
  };
}

/** Decode one full VNDB trait profile row. */
export function decodeVndbTrait(value: unknown): VndbTrait | null {
  const row = asJsonRecord(value);
  const aliases = decodeStringArray(row?.aliases);
  if (
    !row ||
    !isString(row.id) ||
    !/^i\d+$/i.test(row.id) ||
    !isString(row.name) ||
    !aliases ||
    !isNullableString(row.description) ||
    typeof row.searchable !== 'boolean' ||
    typeof row.applicable !== 'boolean' ||
    typeof row.sexual !== 'boolean' ||
    !isNullableString(row.group_id) ||
    (row.group_id !== null && !/^i\d+$/i.test(row.group_id)) ||
    !isNullableString(row.group_name) ||
    !isNonNegativeInteger(row.char_count)
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    aliases,
    description: row.description,
    searchable: row.searchable,
    applicable: row.applicable,
    sexual: row.sexual,
    group_id: row.group_id === null ? null : row.group_id.toLowerCase(),
    group_name: row.group_name,
    char_count: row.char_count,
  };
}
