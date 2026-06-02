import { asJsonRecord } from './json-shape';
import { isVndbVnId } from './vn-id-shape';
import type {
  EgsAnticipated,
  EgsCandidate,
  EgsGame,
  EgsTopRanked,
  EgsUserReviewRow,
} from './erogamescape';

const MAX_CACHE_ROWS = 2000;
const MAX_RAW_COLUMNS = 512;
const MAX_RAW_KEY_LENGTH = 128;
const MAX_RAW_VALUE_LENGTH = 20_000;
const MAX_TEXT_LENGTH = 100_000;
const MAX_URL_LENGTH = 4096;
const EGS_GAME_URL_PREFIX = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=';

/** Validated page envelope stored for paginated EGS surfaces. */
export interface EgsCachedPage<T> {
  rows: T[];
  hasMore: boolean;
}

function isString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isNullableString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string | null {
  return value === null || isString(value, maxLength);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function isNullablePositiveSafeInteger(value: unknown): value is number | null {
  return value === null || isPositiveSafeInteger(value);
}

function decodeRows<T>(value: unknown, decode: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_CACHE_ROWS) return null;
  const rows: T[] = [];
  for (const row of value) {
    const decoded = decode(row);
    if (decoded === null) return null;
    rows.push(decoded);
  }
  return rows;
}

function decodePage<T>(value: unknown, decode: (row: unknown) => T | null): EgsCachedPage<T> | null {
  const record = asJsonRecord(value);
  if (!record || typeof record.hasMore !== 'boolean') return null;
  const rows = decodeRows(record.rows, decode);
  return rows ? { rows, hasMore: record.hasMore } : null;
}

function decodeVndbId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && isVndbVnId(value) ? value.toLowerCase() : undefined;
}

/**
 * Decode the persisted EGS raw-column map.
 *
 * @param value Decoded raw-column JSON value.
 * @returns A copied column map, or `undefined` when the value is malformed.
 */
export function decodeEgsRawColumnMap(value: unknown): Record<string, string | null> | undefined {
  const record = asJsonRecord(value);
  if (!record) return undefined;
  const entries = Object.entries(record);
  if (entries.length > MAX_RAW_COLUMNS) return undefined;
  const out: Record<string, string | null> = {};
  for (const [key, item] of entries) {
    if (key.length > MAX_RAW_KEY_LENGTH || !isNullableString(item, MAX_RAW_VALUE_LENGTH)) return undefined;
    out[key] = item;
  }
  return out;
}

/**
 * Decode one cached EGS game.
 *
 * @param value Decoded cache value.
 * @returns A validated game, or `null` when the payload is malformed.
 */
export function decodeEgsGame(value: unknown): EgsGame | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isPositiveSafeInteger(record.id) ||
    !isString(record.gamename) ||
    !isNullableString(record.gamename_furigana) ||
    !isNullablePositiveSafeInteger(record.brand_id) ||
    !isNullableString(record.brand_name) ||
    !isNullableString(record.model) ||
    !isNullableString(record.description) ||
    !isNullableString(record.image_url, MAX_URL_LENGTH) ||
    !(record.okazu === null || typeof record.okazu === 'boolean') ||
    !(record.erogame === null || typeof record.erogame === 'boolean') ||
    !isNullableNonNegativeNumber(record.median) ||
    !isNullableNonNegativeNumber(record.average) ||
    !isNullableNonNegativeNumber(record.dispersion) ||
    !isNullableNonNegativeNumber(record.count) ||
    !isNullableString(record.sellday) ||
    !isNullableNonNegativeNumber(record.playtime_median_minutes) ||
    record.url !== `${EGS_GAME_URL_PREFIX}${record.id}`
  ) {
    return null;
  }
  const raw = record.raw === undefined ? undefined : decodeEgsRawColumnMap(record.raw);
  if (record.raw !== undefined && raw === undefined) return null;
  return {
    id: record.id,
    gamename: record.gamename,
    gamename_furigana: record.gamename_furigana,
    brand_id: record.brand_id,
    brand_name: record.brand_name,
    model: record.model,
    description: record.description,
    image_url: record.image_url,
    okazu: record.okazu,
    erogame: record.erogame,
    median: record.median,
    average: record.average,
    dispersion: record.dispersion,
    count: record.count,
    sellday: record.sellday,
    playtime_median_minutes: record.playtime_median_minutes,
    url: record.url,
    ...(raw ? { raw } : {}),
  };
}

function decodeEgsCandidate(value: unknown): EgsCandidate | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isPositiveSafeInteger(record.id) ||
    !isString(record.gamename) ||
    !isNullableString(record.gamename_furigana) ||
    !isNullableNonNegativeNumber(record.median) ||
    !isNullableNonNegativeNumber(record.count) ||
    !isNullableString(record.sellday)
  ) {
    return null;
  }
  return {
    id: record.id,
    gamename: record.gamename,
    gamename_furigana: record.gamename_furigana,
    median: record.median,
    count: record.count,
    sellday: record.sellday,
  };
}

/**
 * Decode cached EGS manual-link candidates.
 *
 * @param value Decoded cache value.
 * @returns Validated candidates, or `null` when the payload is malformed.
 */
export function decodeEgsCandidates(value: unknown): EgsCandidate[] | null {
  return decodeRows(value, decodeEgsCandidate);
}

function decodeEgsUserReview(value: unknown): EgsUserReviewRow | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    !isPositiveSafeInteger(record.egs_id) ||
    !isString(record.gamename) ||
    !isNullableNonNegativeNumber(record.tokuten) ||
    !isNullableNonNegativeNumber(record.total_play_time_hours) ||
    !isNullableString(record.start_date) ||
    !isNullableString(record.finish_date) ||
    !isNullableString(record.timestamp)
  ) {
    return null;
  }
  return {
    egs_id: record.egs_id,
    gamename: record.gamename,
    tokuten: record.tokuten,
    total_play_time_hours: record.total_play_time_hours,
    start_date: record.start_date,
    finish_date: record.finish_date,
    timestamp: record.timestamp,
  };
}

/**
 * Decode cached EGS account review rows.
 *
 * @param value Decoded cache value.
 * @returns Validated reviews, or `null` when the payload is malformed.
 */
export function decodeEgsUserReviews(value: unknown): EgsUserReviewRow[] | null {
  return decodeRows(value, decodeEgsUserReview);
}

function decodeEgsAnticipated(value: unknown): EgsAnticipated | null {
  const record = asJsonRecord(value);
  const vndbId = record ? decodeVndbId(record.vndb_id) : undefined;
  if (
    !record ||
    !isPositiveSafeInteger(record.egs_id) ||
    !isString(record.gamename) ||
    !isNullableString(record.brand_name) ||
    !isString(record.sellday) ||
    vndbId === undefined ||
    !isNonNegativeNumber(record.will_buy) ||
    !isNonNegativeNumber(record.probably_buy) ||
    !isNonNegativeNumber(record.watching)
  ) {
    return null;
  }
  return {
    egs_id: record.egs_id,
    gamename: record.gamename,
    brand_name: record.brand_name,
    sellday: record.sellday,
    vndb_id: vndbId,
    will_buy: record.will_buy,
    probably_buy: record.probably_buy,
    watching: record.watching,
  };
}

/**
 * Decode cached EGS anticipated rows.
 *
 * @param value Decoded cache value.
 * @returns Validated rows, or `null` when the payload is malformed.
 */
export function decodeEgsAnticipatedRows(value: unknown): EgsAnticipated[] | null {
  return decodeRows(value, decodeEgsAnticipated);
}

/**
 * Decode a cached EGS anticipated page.
 *
 * @param value Decoded cache value.
 * @returns A validated page, or `null` when the payload is malformed.
 */
export function decodeEgsAnticipatedPage(value: unknown): EgsCachedPage<EgsAnticipated> | null {
  return decodePage(value, decodeEgsAnticipated);
}

function decodeEgsTopRanked(value: unknown): EgsTopRanked | null {
  const record = asJsonRecord(value);
  const vndbId = record ? decodeVndbId(record.vndb_id) : undefined;
  if (
    !record ||
    !isPositiveSafeInteger(record.egs_id) ||
    !isString(record.gamename) ||
    !isNullableString(record.furigana) ||
    !isNullablePositiveSafeInteger(record.brand_id) ||
    !isNullableString(record.brand_name) ||
    !isNullableNonNegativeNumber(record.median) ||
    !isNullableNonNegativeNumber(record.average) ||
    !isNullableNonNegativeNumber(record.count) ||
    !isNullableString(record.sellday) ||
    !isNullableString(record.banner_url, MAX_URL_LENGTH) ||
    typeof record.okazu !== 'boolean' ||
    typeof record.erogame !== 'boolean' ||
    vndbId === undefined
  ) {
    return null;
  }
  return {
    egs_id: record.egs_id,
    gamename: record.gamename,
    furigana: record.furigana,
    brand_id: record.brand_id,
    brand_name: record.brand_name,
    median: record.median,
    average: record.average,
    count: record.count,
    sellday: record.sellday,
    banner_url: record.banner_url,
    okazu: record.okazu,
    erogame: record.erogame,
    vndb_id: vndbId,
  };
}

/**
 * Decode cached EGS top-ranked rows.
 *
 * @param value Decoded cache value.
 * @returns Validated rows, or `null` when the payload is malformed.
 */
export function decodeEgsTopRankedRows(value: unknown): EgsTopRanked[] | null {
  return decodeRows(value, decodeEgsTopRanked);
}

/**
 * Decode a cached EGS top-ranked page.
 *
 * @param value Decoded cache value.
 * @returns A validated page, or `null` when the payload is malformed.
 */
export function decodeEgsTopRankedPage(value: unknown): EgsCachedPage<EgsTopRanked> | null {
  return decodePage(value, decodeEgsTopRanked);
}
