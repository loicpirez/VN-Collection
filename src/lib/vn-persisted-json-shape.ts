import { asJsonRecord, parseJsonArray } from './json-shape';
import type { ReleaseImage, Screenshot, VnRelation, VnRow } from './types';
import { isVndbVnId } from './vn-id-shape';

const MAX_ROWS = 5000;
const RELEASE_IMAGE_TYPES = new Set<ReleaseImage['type']>(['pkgfront', 'pkgback', 'pkgcontent', 'pkgside', 'pkgmed', 'dig']);

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

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.length <= MAX_ROWS && value.every(guard);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || isNullableString(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalNullableFiniteNumber(value: unknown): boolean {
  return value === undefined || isNullableFiniteNumber(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isDims(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isProducerSummary(value: unknown): value is { id: string; name: string } {
  const row = asJsonRecord(value);
  return row !== null && typeof row.id === 'string' && /^p\d+$/i.test(row.id) && typeof row.name === 'string';
}

function isRelationDeveloper(value: unknown): value is { id?: string; name: string } {
  const row = asJsonRecord(value);
  return row !== null &&
    (row.id === undefined || (typeof row.id === 'string' && /^p\d+$/i.test(row.id))) &&
    typeof row.name === 'string';
}

/** Validate a bounded persisted string array. */
export function isPersistedStringArray(value: unknown): value is string[] {
  return isArrayOf(value, isString);
}

/** Validate persisted VN developer or publisher summaries. */
export function isPersistedProducerSummaries(value: unknown): value is Array<{ id: string; name: string }> {
  return isArrayOf(value, isProducerSummary);
}

/** Decode persisted VN developer or publisher summaries. */
export function decodePersistedProducerSummaries(raw: string | null | undefined): Array<{ id: string; name: string }> {
  const value = parseJsonArray(raw);
  return isPersistedProducerSummaries(value) ? value : [];
}

/** Validate persisted VN tag summaries. */
export function isPersistedTags(value: unknown): value is VnRow['tags'] {
  return isArrayOf(value, (item): item is VnRow['tags'][number] => {
    const row = asJsonRecord(item);
    return row !== null &&
      typeof row.id === 'string' &&
      /^g\d+$/i.test(row.id) &&
      typeof row.name === 'string' &&
      isFiniteNumber(row.rating) &&
      isFiniteNumber(row.spoiler) &&
      isOptionalBoolean(row.lie) &&
      (row.category === undefined || row.category === null || row.category === 'cont' || row.category === 'ero' || row.category === 'tech');
  });
}

/** Validate persisted screenshots selected from VNDB. */
export function isPersistedScreenshots(value: unknown): value is Screenshot[] {
  return isArrayOf(value, (item): item is Screenshot => {
    const row = asJsonRecord(item);
    const release = row?.release === undefined || row.release === null ? row?.release : asJsonRecord(row.release);
    return row !== null &&
      typeof row.url === 'string' &&
      typeof row.thumbnail === 'string' &&
      (row.id === undefined || typeof row.id === 'string') &&
      isOptionalFiniteNumber(row.sexual) &&
      isOptionalFiniteNumber(row.violence) &&
      (row.dims === undefined || isDims(row.dims)) &&
      (release === undefined || release === null || (typeof release.id === 'string' && /^r\d+$/i.test(release.id))) &&
      isOptionalNullableString(row.local) &&
      isOptionalNullableString(row.local_thumb);
  });
}

/** Validate persisted release images mirrored from release fan-out. */
export function isPersistedReleaseImages(value: unknown): value is ReleaseImage[] {
  return isArrayOf(value, (item): item is ReleaseImage => {
    const row = asJsonRecord(item);
    return row !== null &&
      (row.id === undefined || typeof row.id === 'string') &&
      typeof row.release_id === 'string' &&
      /^r\d+$/i.test(row.release_id) &&
      typeof row.release_title === 'string' &&
      typeof row.type === 'string' &&
      RELEASE_IMAGE_TYPES.has(row.type as ReleaseImage['type']) &&
      typeof row.url === 'string' &&
      isOptionalNullableString(row.thumbnail) &&
      (row.dims === undefined || row.dims === null || isDims(row.dims)) &&
      isOptionalFiniteNumber(row.sexual) &&
      isOptionalFiniteNumber(row.violence) &&
      (row.languages === undefined || row.languages === null || isPersistedStringArray(row.languages)) &&
      isOptionalBoolean(row.photo) &&
      isOptionalNullableString(row.local) &&
      isOptionalNullableString(row.local_thumb);
  });
}

/** Validate persisted relation summaries used by collection cards. */
export function isPersistedRelations(value: unknown): value is VnRelation[] {
  return isArrayOf(value, (item): item is VnRelation => {
    const row = asJsonRecord(item);
    return row !== null &&
      typeof row.id === 'string' &&
      isVndbVnId(row.id) &&
      typeof row.title === 'string' &&
      isNullableString(row.alttitle) &&
      isNullableString(row.released) &&
      isNullableFiniteNumber(row.rating) &&
      isNullableFiniteNumber(row.votecount) &&
      isNullableFiniteNumber(row.length_minutes) &&
      isPersistedStringArray(row.languages) &&
      isPersistedStringArray(row.platforms) &&
      isArrayOf(row.developers, isRelationDeveloper) &&
      (row.publishers === undefined || isArrayOf(row.publishers, isRelationDeveloper)) &&
      isNullableString(row.image_url) &&
      isNullableString(row.image_thumb) &&
      isNullableFiniteNumber(row.image_sexual) &&
      typeof row.relation === 'string' &&
      typeof row.relation_official === 'boolean';
  });
}

/** Validate persisted VN external links. */
export function isPersistedExtlinks(value: unknown): value is VnRow['extlinks'] {
  return isArrayOf(value, (item): item is VnRow['extlinks'][number] => {
    const row = asJsonRecord(item);
    return row !== null && typeof row.url === 'string' && typeof row.label === 'string' && typeof row.name === 'string';
  });
}

/** Validate persisted multilingual VN titles. */
export function isPersistedTitles(value: unknown): value is VnRow['titles'] {
  return isArrayOf(value, (item): item is VnRow['titles'][number] => {
    const row = asJsonRecord(item);
    return row !== null &&
      typeof row.lang === 'string' &&
      typeof row.title === 'string' &&
      isNullableString(row.latin) &&
      typeof row.official === 'boolean' &&
      typeof row.main === 'boolean';
  });
}

/** Validate persisted VN edition summaries. */
export function isPersistedEditions(value: unknown): value is VnRow['editions'] {
  return isArrayOf(value, (item): item is VnRow['editions'][number] => {
    const row = asJsonRecord(item);
    return row !== null &&
      isSafeInteger(row.eid) &&
      isNullableString(row.lang) &&
      typeof row.name === 'string' &&
      typeof row.official === 'boolean';
  });
}

/** Validate persisted VN staff credit summaries. */
export function isPersistedStaff(value: unknown): value is VnRow['staff'] {
  return isArrayOf(value, (item): item is VnRow['staff'][number] => {
    const row = asJsonRecord(item);
    return row !== null &&
      (row.eid === null || isSafeInteger(row.eid)) &&
      typeof row.role === 'string' &&
      isNullableString(row.note) &&
      typeof row.id === 'string' &&
      /^s\d+$/i.test(row.id) &&
      isSafeInteger(row.aid) &&
      typeof row.name === 'string' &&
      isNullableString(row.original) &&
      isNullableString(row.lang);
  });
}

/** Validate persisted VN voice-credit summaries. */
export function isPersistedVa(value: unknown): value is VnRow['va'] {
  return isArrayOf(value, (item): item is VnRow['va'][number] => {
    const row = asJsonRecord(item);
    const character = asJsonRecord(row?.character);
    const staff = asJsonRecord(row?.staff);
    const image = character?.image === undefined || character.image === null ? character?.image : asJsonRecord(character.image);
    return row !== null &&
      isNullableString(row.note) &&
      character !== null &&
      typeof character.id === 'string' &&
      /^c\d+$/i.test(character.id) &&
      typeof character.name === 'string' &&
      isNullableString(character.original) &&
      (image === undefined || image === null || typeof image.url === 'string') &&
      staff !== null &&
      typeof staff.id === 'string' &&
      /^s\d+$/i.test(staff.id) &&
      isSafeInteger(staff.aid) &&
      typeof staff.name === 'string' &&
      isNullableString(staff.original) &&
      isNullableString(staff.lang);
  });
}
