import { asJsonRecord } from './json-shape';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const MAX_EGS_SUGGESTIONS = 1_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One local update suggested by the EGS synchronization preview. */
export interface EgsSyncClientSuggestion {
  vn_id: string;
  vn_title: string;
  egs_id: number;
  egs_gamename: string;
  local_minutes: number;
  egs_minutes: number | null;
  local_rating: number | null;
  egs_score: number | null;
  egs_finish_date: string | null;
  egs_start_date: string | null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number' && Number.isFinite(value);
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && ISO_DATE_RE.test(value);
}

function decodeSuggestion(value: unknown): EgsSyncClientSuggestion | null {
  const row = asJsonRecord(value);
  const vnId = typeof row?.vn_id === 'string' && isVndbVnId(row.vn_id)
    ? normalizeVnId(row.vn_id)
    : null;
  if (
    !row ||
    !vnId ||
    typeof row.vn_title !== 'string' ||
    !isPositiveInteger(row.egs_id) ||
    typeof row.egs_gamename !== 'string' ||
    !isNonNegativeInteger(row.local_minutes) ||
    !isNullableNonNegativeInteger(row.egs_minutes) ||
    !isNullableFiniteNumber(row.local_rating) ||
    !isNullableFiniteNumber(row.egs_score) ||
    !isNullableIsoDate(row.egs_finish_date) ||
    !isNullableIsoDate(row.egs_start_date)
  ) {
    return null;
  }
  return {
    vn_id: vnId,
    vn_title: row.vn_title,
    egs_id: row.egs_id,
    egs_gamename: row.egs_gamename,
    local_minutes: row.local_minutes,
    egs_minutes: row.egs_minutes,
    local_rating: row.local_rating,
    egs_score: row.egs_score,
    egs_finish_date: row.egs_finish_date,
    egs_start_date: row.egs_start_date,
  };
}

/**
 * Decode the EGS username reflected by the local settings endpoint.
 *
 * @param value Parsed local API payload.
 * @returns Stored username, or `null` for malformed input.
 */
export function decodeEgsUsernameSetting(value: unknown): string | null {
  const username = asJsonRecord(value)?.egs_username;
  return typeof username === 'string' ? username : null;
}

/**
 * Decode an EGS synchronization preview.
 *
 * @param value Parsed local API payload.
 * @returns Safe synchronization preview, or `null` for malformed input.
 */
export function decodeEgsSyncPreview(value: unknown): {
  needsConfig: boolean;
  suggestions: EgsSyncClientSuggestion[];
} | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    record.ok !== true ||
    typeof record.needsConfig !== 'boolean' ||
    !Array.isArray(record.suggestions) ||
    record.suggestions.length > MAX_EGS_SUGGESTIONS
  ) {
    return null;
  }
  const suggestions = record.suggestions.map(decodeSuggestion);
  return suggestions.some((suggestion) => suggestion === null)
    ? null
    : { needsConfig: record.needsConfig, suggestions: suggestions as EgsSyncClientSuggestion[] };
}

/**
 * Decode the applied-row count returned by EGS synchronization.
 *
 * @param value Parsed local API payload.
 * @returns Applied-row count, or `null` for malformed input.
 */
export function decodeEgsSyncAppliedCount(value: unknown): number | null {
  const applied = asJsonRecord(value)?.applied;
  return isNonNegativeInteger(applied) ? applied : null;
}

/**
 * Decode the queued-VN count returned by selective full download.
 *
 * @param value Parsed local API payload.
 * @returns Queued-VN count, or `null` for malformed input.
 */
export function decodeSelectiveDownloadQueuedCount(value: unknown): number | null {
  const queued = asJsonRecord(value)?.queued;
  return isNonNegativeInteger(queued) ? queued : null;
}

/**
 * Decode the completed-credit count returned by a staff download.
 *
 * @param value Parsed local API payload.
 * @returns Downloaded-credit count, or `null` for malformed input.
 */
export function decodeStaffDownloadCreditCount(value: unknown): number | null {
  const record = asJsonRecord(value);
  return record &&
    record.ok === true &&
    isNonNegativeInteger(record.productionCount) &&
    isNonNegativeInteger(record.vaCount) &&
    isNonNegativeInteger(record.fetched_at)
    ? record.productionCount + record.vaCount
    : null;
}
