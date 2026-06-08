import { asJsonRecord } from './json-shape';

const JOB_KINDS: ReadonlySet<string> = new Set([
  'staff',
  'characters',
  'producers',
  'vndb-pull',
  'egs-sync',
  'vn-fetch',
  'cache-refresh',
  'stock-batch',
  'alicenet',
]);

/**
 * One background-job error rendered in the download-status panel.
 */
export interface DownloadStatusJobError {
  item: string;
  message: string;
}

/**
 * Supported background-job categories rendered by the download-status panel.
 */
export type DownloadStatusJobKind =
  | 'staff'
  | 'characters'
  | 'producers'
  | 'vndb-pull'
  | 'egs-sync'
  | 'vn-fetch'
  | 'cache-refresh'
  | 'stock-batch'
  | 'alicenet';

/**
 * One normalized background job rendered in the download-status panel.
 */
export interface DownloadStatusJob {
  id: string;
  kind: DownloadStatusJobKind;
  vn_id: string | null;
  vn_title?: string | null;
  label: string;
  label_code?: string | null;
  label_params?: Record<string, string | number> | null;
  total: number;
  done: number;
  current_item?: string | null;
  current_item_code?: string | null;
  current_item_params?: Record<string, string | number> | null;
  current_item_name?: string | null;
  errors: DownloadStatusJobError[];
  started_at: number;
  finished_at: number | null;
  cancelled?: boolean;
  interrupted?: boolean;
}

/**
 * Normalized download-status API and SSE payload.
 */
export interface DownloadStatusSnapshot {
  throttle: {
    active: number;
    queued: number;
    recent429s?: number;
    circuitOpen?: boolean;
    retryAfterMs?: number;
  };
  jobs: DownloadStatusJob[];
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isDownloadStatusJobKind(value: unknown): value is DownloadStatusJobKind {
  return typeof value === 'string' && JOB_KINDS.has(value);
}

function decodeOptionalParams(value: unknown): Record<string, string | number> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const record = asJsonRecord(value);
  if (!record) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(record)) {
    if (!(typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))) {
      return undefined;
    }
    out[key] = item;
  }
  return out;
}

function decodeJob(value: unknown): DownloadStatusJob | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    typeof record.id !== 'string' ||
    !isDownloadStatusJobKind(record.kind) ||
    !isStringOrNull(record.vn_id) ||
    typeof record.label !== 'string' ||
    !isFiniteNonNegative(record.total) ||
    !isFiniteNonNegative(record.done) ||
    !Array.isArray(record.errors) ||
    !isFiniteNonNegative(record.started_at) ||
    !(record.finished_at === null || isFiniteNonNegative(record.finished_at)) ||
    !(record.vn_title === undefined || isStringOrNull(record.vn_title)) ||
    !(record.label_code === undefined || isStringOrNull(record.label_code)) ||
    !(record.current_item === undefined || isStringOrNull(record.current_item)) ||
    !(record.current_item_code === undefined || isStringOrNull(record.current_item_code)) ||
    !(record.current_item_name === undefined || isStringOrNull(record.current_item_name)) ||
    !(record.cancelled === undefined || typeof record.cancelled === 'boolean') ||
    !(record.interrupted === undefined || typeof record.interrupted === 'boolean')
  ) {
    return null;
  }
  const labelParams = decodeOptionalParams(record.label_params);
  const currentItemParams = decodeOptionalParams(record.current_item_params);
  if (
    (record.label_params !== undefined && labelParams === undefined) ||
    (record.current_item_params !== undefined && currentItemParams === undefined)
  ) {
    return null;
  }
  const errors = record.errors.flatMap((error) => {
    const item = asJsonRecord(error);
    return item && typeof item.item === 'string' && typeof item.message === 'string'
      ? [{ item: item.item, message: item.message }]
      : [];
  });
  return {
    id: record.id,
    kind: record.kind,
    vn_id: record.vn_id,
    ...(record.vn_title !== undefined ? { vn_title: record.vn_title } : {}),
    label: record.label,
    ...(record.label_code !== undefined ? { label_code: record.label_code } : {}),
    ...(labelParams !== undefined ? { label_params: labelParams } : {}),
    total: record.total,
    done: record.done,
    ...(record.current_item !== undefined ? { current_item: record.current_item } : {}),
    ...(record.current_item_code !== undefined ? { current_item_code: record.current_item_code } : {}),
    ...(currentItemParams !== undefined ? { current_item_params: currentItemParams } : {}),
    ...(record.current_item_name !== undefined ? { current_item_name: record.current_item_name } : {}),
    errors,
    started_at: record.started_at,
    finished_at: record.finished_at,
    ...(record.cancelled !== undefined ? { cancelled: record.cancelled } : {}),
    ...(record.interrupted !== undefined ? { interrupted: record.interrupted } : {}),
  };
}

/**
 * Decode a polling response or SSE frame for the download-status panel.
 *
 * @param value Parsed API or SSE JSON payload.
 * @returns A normalized snapshot, or `null` when the envelope is malformed.
 */
export function decodeDownloadStatusSnapshot(value: unknown): DownloadStatusSnapshot | null {
  const record = asJsonRecord(value);
  const throttle = asJsonRecord(record?.throttle);
  if (
    !record ||
    !throttle ||
    !isFiniteNonNegative(throttle.active) ||
    !isFiniteNonNegative(throttle.queued) ||
    !(throttle.recent429s === undefined || isFiniteNonNegative(throttle.recent429s)) ||
    !(throttle.retryAfterMs === undefined || isFiniteNonNegative(throttle.retryAfterMs)) ||
    !(throttle.circuitOpen === undefined || typeof throttle.circuitOpen === 'boolean') ||
    !Array.isArray(record.jobs)
  ) {
    return null;
  }
  return {
    throttle: {
      active: throttle.active,
      queued: throttle.queued,
      ...(throttle.recent429s !== undefined ? { recent429s: throttle.recent429s } : {}),
      ...(throttle.retryAfterMs !== undefined ? { retryAfterMs: throttle.retryAfterMs } : {}),
      ...(throttle.circuitOpen !== undefined ? { circuitOpen: throttle.circuitOpen } : {}),
    },
    jobs: record.jobs.flatMap((job) => decodeJob(job) ?? []),
  };
}
