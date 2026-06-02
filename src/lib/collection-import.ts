import type { CollectionExportPayload } from './db';
import { asJsonRecord } from './json-shape';
import { parsePhysicalLocations } from './physical-location-input';
import { normalizeVnId, isValidVnId } from './vn-id-shape';
import { EDITION_TYPES, LOCATIONS, STATUSES, type SeriesRow } from './types';
import type { ValidationResult } from './input-validators';

const MAX_IMPORT_ROWS = 50_000;
const MAX_NESTED_ROWS = 20_000;
const MAX_TEXT = 100_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_SET = new Set<string>(STATUSES);
const LOCATION_SET = new Set<string>(LOCATIONS);
const EDITION_TYPE_SET = new Set<string>(EDITION_TYPES);

function fail(error: string): ValidationResult<never> {
  return { ok: false, error };
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableString(value: unknown, max = MAX_TEXT): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= max);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isOptionalNullableString(value: unknown, max = MAX_TEXT): boolean {
  return value === undefined || isNullableString(value, max);
}

function isOptionalNullableFiniteNumber(value: unknown): boolean {
  return value === undefined || isNullableFiniteNumber(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isBoundedStringArray(value: unknown, max = MAX_NESTED_ROWS): value is string[] {
  return Array.isArray(value)
    && value.length <= max
    && value.every((item) => typeof item === 'string' && item.length <= MAX_TEXT);
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isBoundedStringArray(value);
}

function isProducerCredit(value: unknown): boolean {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.id === 'string'
    && /^p\d+$/i.test(row.id)
    && typeof row.name === 'string'
    && row.name.length <= MAX_TEXT;
}

function isTagCredit(value: unknown): boolean {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.id === 'string'
    && /^g\d+$/i.test(row.id)
    && typeof row.name === 'string'
    && row.name.length <= MAX_TEXT
    && typeof row.rating === 'number'
    && Number.isFinite(row.rating)
    && typeof row.spoiler === 'number'
    && Number.isFinite(row.spoiler)
    && (row.lie === undefined || typeof row.lie === 'boolean')
    && (row.category === undefined || row.category === null || row.category === 'cont' || row.category === 'ero' || row.category === 'tech');
}

function isImage(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const row = asJsonRecord(value);
  return row !== null
    && isOptionalNullableString(row.url, 4000)
    && isOptionalNullableString(row.thumbnail, 4000)
    && isOptionalNullableFiniteNumber(row.sexual)
    && isOptionalNullableFiniteNumber(row.violence)
    && (row.dims === undefined
      || (Array.isArray(row.dims)
        && row.dims.length === 2
        && row.dims.every((dimension) => typeof dimension === 'number' && Number.isFinite(dimension))));
}

function isRelation(value: unknown): boolean {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.id === 'string'
    && isValidVnId(row.id)
    && typeof row.title === 'string'
    && row.title.length <= MAX_TEXT
    && isOptionalNullableString(row.alttitle)
    && isOptionalNullableString(row.released, 32)
    && isOptionalNullableFiniteNumber(row.rating)
    && isOptionalNullableFiniteNumber(row.votecount)
    && isOptionalNullableFiniteNumber(row.length_minutes)
    && isOptionalStringArray(row.languages)
    && isOptionalStringArray(row.platforms)
    && (row.developers === undefined
      || (Array.isArray(row.developers)
        && row.developers.length <= MAX_NESTED_ROWS
        && row.developers.every((developer) => {
          const credit = asJsonRecord(developer);
          return credit !== null
            && (credit.id === undefined || (typeof credit.id === 'string' && /^p\d+$/i.test(credit.id)))
            && typeof credit.name === 'string'
            && credit.name.length <= MAX_TEXT;
        })))
    && isImage(row.image)
    && typeof row.relation === 'string'
    && row.relation.length <= 100
    && typeof row.relation_official === 'boolean';
}

function isTitle(value: unknown): boolean {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.lang === 'string'
    && typeof row.title === 'string'
    && isNullableString(row.latin)
    && typeof row.official === 'boolean'
    && typeof row.main === 'boolean';
}

function isEdition(value: unknown): boolean {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.eid === 'number'
    && Number.isSafeInteger(row.eid)
    && isNullableString(row.lang, 32)
    && typeof row.name === 'string'
    && row.name.length <= MAX_TEXT
    && typeof row.official === 'boolean';
}

function isExtlink(value: unknown): boolean {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.url === 'string'
    && row.url.length <= 4000
    && typeof row.label === 'string'
    && row.label.length <= 500
    && typeof row.name === 'string'
    && row.name.length <= 500;
}

function isOptionalBoundedArray(value: unknown, validate: (item: unknown) => boolean): boolean {
  return value === undefined
    || (Array.isArray(value) && value.length <= MAX_NESTED_ROWS && value.every(validate));
}

function validateRawVnPayload(value: unknown): boolean {
  if (value === null) return true;
  const row = asJsonRecord(value);
  return row !== null
    && isOptionalNullableString(row.id, 100)
    && isOptionalNullableString(row.title)
    && isOptionalNullableString(row.alttitle)
    && isOptionalStringArray(row.aliases)
    && isOptionalBoundedArray(row.titles, isTitle)
    && isOptionalNullableString(row.released, 32)
    && isOptionalNullableString(row.olang, 32)
    && (row.devstatus === undefined || row.devstatus === null || row.devstatus === 0 || row.devstatus === 1 || row.devstatus === 2)
    && isOptionalStringArray(row.languages)
    && isOptionalStringArray(row.platforms)
    && isOptionalNullableFiniteNumber(row.length_minutes)
    && isOptionalNullableFiniteNumber(row.length)
    && isOptionalNullableFiniteNumber(row.length_votes)
    && isOptionalNullableFiniteNumber(row.rating)
    && isOptionalNullableFiniteNumber(row.votecount)
    && isOptionalNullableFiniteNumber(row.average)
    && isOptionalNullableString(row.description)
    && isImage(row.image)
    && isOptionalBoundedArray(row.extlinks, isExtlink)
    && isOptionalBoolean(row.has_anime)
    && isOptionalBoundedArray(row.editions, isEdition)
    && (row.staff === undefined || (Array.isArray(row.staff) && row.staff.length <= MAX_NESTED_ROWS))
    && (row.va === undefined || (Array.isArray(row.va) && row.va.length <= MAX_NESTED_ROWS))
    && isOptionalBoundedArray(row.developers, isProducerCredit)
    && isOptionalBoundedArray(row.tags, isTagCredit)
    && (row.screenshots === undefined || (Array.isArray(row.screenshots) && row.screenshots.length <= MAX_NESTED_ROWS))
    && isOptionalBoundedArray(row.relations, isRelation);
}

function normalizePhysicalLocation(value: unknown): ValidationResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return fail('collection physical_location must be a string or null');
  let decoded: unknown = value;
  try {
    decoded = JSON.parse(value);
  } catch {
    decoded = value;
  }
  const parsed = parsePhysicalLocations(decoded);
  if (!parsed.ok) return fail(parsed.error);
  return { ok: true, value: parsed.value.length > 0 ? JSON.stringify(parsed.value) : null };
}

function decodeVn(value: unknown, index: number): ValidationResult<CollectionExportPayload['vns'][number]> {
  const row = asJsonRecord(value);
  if (row === null) return fail(`vns[${index}] must be an object`);
  if (typeof row.id !== 'string' || !isValidVnId(row.id)) return fail(`vns[${index}].id must match v\\d+ or egs_\\d+`);
  if (typeof row.title !== 'string' || row.title.trim().length === 0 || row.title.length > 1000) {
    return fail(`vns[${index}].title must be a non-empty string at most 1000 characters`);
  }
  const raw = row.raw ?? null;
  if (!validateRawVnPayload(raw)) return fail(`vns[${index}].raw has an invalid shape`);
  if (!isSafeTimestamp(row.fetched_at)) return fail(`vns[${index}].fetched_at must be a non-negative safe integer`);
  return {
    ok: true,
    value: {
      id: normalizeVnId(row.id),
      title: row.title.trim(),
      raw,
      fetched_at: row.fetched_at,
    },
  };
}

function decodeCollectionRow(value: unknown, index: number): ValidationResult<CollectionExportPayload['collection'][number]> {
  const row = asJsonRecord(value);
  if (row === null) return fail(`collection[${index}] must be an object`);
  if (typeof row.vn_id !== 'string' || !isValidVnId(row.vn_id)) return fail(`collection[${index}].vn_id must match v\\d+ or egs_\\d+`);
  if (typeof row.status !== 'string' || !STATUS_SET.has(row.status)) return fail(`collection[${index}].status is invalid`);
  const userRating = row.user_rating ?? null;
  if (userRating !== null && (typeof userRating !== 'number' || !Number.isSafeInteger(userRating) || userRating < 10 || userRating > 100)) {
    return fail(`collection[${index}].user_rating must be an integer 10-100 or null`);
  }
  const playtime = row.playtime_minutes ?? 0;
  if (typeof playtime !== 'number' || !Number.isSafeInteger(playtime) || playtime < 0 || playtime > 10_000_000) {
    return fail(`collection[${index}].playtime_minutes must be a non-negative safe integer`);
  }
  const startedDate = row.started_date ?? null;
  const finishedDate = row.finished_date ?? null;
  if (startedDate !== null && (typeof startedDate !== 'string' || !ISO_DATE_RE.test(startedDate))) return fail(`collection[${index}].started_date is invalid`);
  if (finishedDate !== null && (typeof finishedDate !== 'string' || !ISO_DATE_RE.test(finishedDate))) return fail(`collection[${index}].finished_date is invalid`);
  const notes = row.notes ?? null;
  if (!isNullableString(notes, 50_000)) return fail(`collection[${index}].notes must be a string or null`);
  const favorite = row.favorite ?? 0;
  if (favorite !== 0 && favorite !== 1 && typeof favorite !== 'boolean') return fail(`collection[${index}].favorite must be 0, 1, or boolean`);
  const location = row.location ?? 'unknown';
  if (typeof location !== 'string' || !LOCATION_SET.has(location)) return fail(`collection[${index}].location is invalid`);
  const editionType = row.edition_type ?? 'none';
  if (typeof editionType !== 'string' || !EDITION_TYPE_SET.has(editionType)) return fail(`collection[${index}].edition_type is invalid`);
  const editionLabel = row.edition_label ?? null;
  if (!isNullableString(editionLabel, 200)) return fail(`collection[${index}].edition_label must be a string or null`);
  const physicalLocation = normalizePhysicalLocation(row.physical_location);
  if (!physicalLocation.ok) return fail(`collection[${index}].${physicalLocation.error}`);
  const addedAt = row.added_at ?? Date.now();
  const updatedAt = row.updated_at ?? Date.now();
  if (!isSafeTimestamp(addedAt)) return fail(`collection[${index}].added_at must be a non-negative safe integer`);
  if (!isSafeTimestamp(updatedAt)) return fail(`collection[${index}].updated_at must be a non-negative safe integer`);
  return {
    ok: true,
    value: {
      vn_id: normalizeVnId(row.vn_id),
      status: row.status,
      user_rating: userRating,
      playtime_minutes: playtime,
      started_date: startedDate,
      finished_date: finishedDate,
      notes,
      favorite: favorite ? 1 : 0,
      location,
      edition_type: editionType,
      edition_label: editionLabel,
      physical_location: physicalLocation.value,
      added_at: addedAt,
      updated_at: updatedAt,
    },
  };
}

function decodeSeries(value: unknown, index: number): ValidationResult<SeriesRow> {
  const row = asJsonRecord(value);
  if (row === null) return fail(`series[${index}] must be an object`);
  if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0) return fail(`series[${index}].id must be a positive safe integer`);
  if (typeof row.name !== 'string' || row.name.trim().length === 0 || row.name.length > 200) return fail(`series[${index}].name must be a non-empty string at most 200 characters`);
  const description = row.description ?? null;
  const coverPath = row.cover_path ?? null;
  const bannerPath = row.banner_path ?? null;
  if (!isNullableString(description, 20_000)) return fail(`series[${index}].description must be a string or null`);
  if (!isNullableString(coverPath, 300)) return fail(`series[${index}].cover_path must be a string or null`);
  if (!isNullableString(bannerPath, 300)) return fail(`series[${index}].banner_path must be a string or null`);
  if (!isSafeTimestamp(row.created_at)) return fail(`series[${index}].created_at must be a non-negative safe integer`);
  if (!isSafeTimestamp(row.updated_at)) return fail(`series[${index}].updated_at must be a non-negative safe integer`);
  return {
    ok: true,
    value: {
      id: row.id,
      name: row.name.trim(),
      description,
      cover_path: coverPath,
      banner_path: bannerPath,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

function decodeSeriesLink(value: unknown, index: number): ValidationResult<CollectionExportPayload['series_vn'][number]> {
  const row = asJsonRecord(value);
  if (row === null) return fail(`series_vn[${index}] must be an object`);
  if (typeof row.series_id !== 'number' || !Number.isSafeInteger(row.series_id) || row.series_id <= 0) return fail(`series_vn[${index}].series_id must be a positive safe integer`);
  if (typeof row.vn_id !== 'string' || !isValidVnId(row.vn_id)) return fail(`series_vn[${index}].vn_id must match v\\d+ or egs_\\d+`);
  if (typeof row.order_index !== 'number' || !Number.isSafeInteger(row.order_index) || row.order_index < 0 || row.order_index > 1_000_000) {
    return fail(`series_vn[${index}].order_index must be a non-negative safe integer`);
  }
  return {
    ok: true,
    value: {
      series_id: row.series_id,
      vn_id: normalizeVnId(row.vn_id),
      order_index: row.order_index,
    },
  };
}

function decodeRows<T>(
  value: unknown,
  field: string,
  decode: (row: unknown, index: number) => ValidationResult<T>,
): ValidationResult<T[]> {
  if (!Array.isArray(value)) return fail(`${field} must be an array`);
  if (value.length > MAX_IMPORT_ROWS) return fail(`${field} exceeds row cap`);
  const out: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const decoded = decode(value[index], index);
    if (!decoded.ok) return decoded;
    out.push(decoded.value);
  }
  return { ok: true, value: out };
}

function hasDuplicate<T>(items: readonly T[], key: (item: T) => string): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) return true;
    seen.add(value);
  }
  return false;
}

/**
 * Decode and normalize one uploaded JSON collection backup before mutation.
 *
 * @param value Untrusted JSON value from the import request.
 * @returns A validated version-2 backup or a bounded field-scoped error.
 */
export function decodeCollectionImportPayload(value: unknown): ValidationResult<CollectionExportPayload> {
  const row = asJsonRecord(value);
  if (row === null) return fail('import payload must be an object');
  if (row.version !== 2) return fail('import payload version must be 2');
  if (!isSafeTimestamp(row.exported_at)) return fail('exported_at must be a non-negative safe integer');
  const vns = decodeRows(row.vns, 'vns', decodeVn);
  if (!vns.ok) return vns;
  const collection = decodeRows(row.collection, 'collection', decodeCollectionRow);
  if (!collection.ok) return collection;
  const series = decodeRows(row.series, 'series', decodeSeries);
  if (!series.ok) return series;
  const seriesVn = decodeRows(row.series_vn, 'series_vn', decodeSeriesLink);
  if (!seriesVn.ok) return seriesVn;
  if (hasDuplicate(vns.value, (vn) => vn.id)) return fail('vns contains duplicate ids');
  if (hasDuplicate(collection.value, (entry) => entry.vn_id)) return fail('collection contains duplicate vn_ids');
  if (hasDuplicate(series.value, (entry) => String(entry.id))) return fail('series contains duplicate ids');
  if (hasDuplicate(seriesVn.value, (entry) => `${entry.series_id}|${entry.vn_id}`)) return fail('series_vn contains duplicate memberships');
  return {
    ok: true,
    value: {
      version: 2,
      exported_at: row.exported_at,
      vns: vns.value,
      collection: collection.value,
      series: series.value,
      series_vn: seriesVn.value,
    },
  };
}
