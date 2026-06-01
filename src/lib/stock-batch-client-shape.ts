import { asJsonRecord } from './json-shape';
import { STOCK_PROVIDER_IDS, type StockProviderId } from './stock-provider-constants';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_QUEUE_PAGE_ROWS = 500;
const MAX_JOB_ID_LENGTH = 200;

/** One stock-batch queue row hydrated from a scope endpoint. */
export interface StockBatchQueueEntry {
  vnId: string;
  title?: string;
}

/** One paginated stock-batch scope response. */
export interface StockBatchQueuePage {
  entries: StockBatchQueueEntry[];
  nextPage: number | null;
}

/** Accepted stock-batch background job response. */
export interface StockBatchStart {
  jobId: string;
  queued: number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Decode disabled stock providers from the settings payload.
 *
 * @param value Parsed local settings API payload.
 * @returns Safe provider ids, or `null` for malformed input.
 */
export function decodeDisabledStockProviders(value: unknown): StockProviderId[] | null {
  const raw = asJsonRecord(value)?.stock_disabled_providers;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  const out: StockProviderId[] = [];
  for (const provider of raw) {
    if (typeof provider !== 'string' || !allowed.has(provider)) return null;
    const typed = provider as StockProviderId;
    if (!out.includes(typed)) out.push(typed);
  }
  return out;
}

/**
 * Decode one stock-batch queue page before merging it into client state.
 *
 * @param value Parsed local queue API payload.
 * @returns Safe queue page, or `null` for malformed input.
 */
export function decodeStockBatchQueuePage(value: unknown): StockBatchQueuePage | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.entries) || record.entries.length > MAX_QUEUE_PAGE_ROWS) return null;
  const entries: StockBatchQueueEntry[] = [];
  for (const entry of record.entries) {
    const row = asJsonRecord(entry);
    if (
      !row ||
      typeof row.vn_id !== 'string' ||
      !isValidVnId(row.vn_id) ||
      !(row.title === null || typeof row.title === 'string')
    ) {
      return null;
    }
    entries.push({
      vnId: normalizeVnId(row.vn_id),
      ...(typeof row.title === 'string' ? { title: row.title } : {}),
    });
  }
  const nextPage = record.next_page;
  if (!(nextPage === null || isPositiveInteger(nextPage))) return null;
  return { entries, nextPage };
}

/**
 * Decode a newly accepted stock-batch job.
 *
 * @param value Parsed local batch API payload.
 * @returns Safe job identity and queue count, or `null` for malformed input.
 */
export function decodeStockBatchStart(value: unknown): StockBatchStart | null {
  const record = asJsonRecord(value);
  return (
    record &&
    typeof record.jobId === 'string' &&
    record.jobId.length > 0 &&
    record.jobId.length <= MAX_JOB_ID_LENGTH &&
    isNonNegativeInteger(record.queued)
  )
    ? { jobId: record.jobId, queued: record.queued }
    : null;
}
