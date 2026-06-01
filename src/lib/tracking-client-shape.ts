import { asJsonRecord } from './json-shape';
import type { RouteRow } from './types';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_READING_QUEUE_ROWS = 1_000;
const MAX_ROUTE_ROWS = 1_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Maximum accepted yearly reading-goal target. */
export const READING_GOAL_TARGET_MAX = 1_000;

/** Reading-queue row consumed by the VN-detail toggle. */
export interface ReadingQueueClientEntry {
  vn_id: string;
  position: number;
  added_at: number;
}

/** Reading-goal row consumed by the stats card. */
export interface ReadingGoalClientRow {
  year: number;
  target: number;
  updated_at: number;
}

/** Reading-goal state consumed by the stats card. */
export interface ReadingGoalClientState {
  year: number;
  goal: ReadingGoalClientRow | null;
  finished: number;
}

/** Game-log row consumed by the per-VN journal. */
export interface TrackingGameLogEntry {
  id: number;
  vn_id: string;
  note: string;
  logged_at: number;
  session_minutes: number | null;
  created_at: number;
  updated_at: number;
}

/** Supported activity kinds rendered by the per-VN timeline. */
export type TrackingActivityKind =
  | 'status'
  | 'rating'
  | 'playtime'
  | 'favorite'
  | 'started'
  | 'finished'
  | 'note'
  | 'manual';

/** Activity row consumed by the per-VN timeline. */
export interface TrackingActivityEntry {
  id: number;
  vn_id: string;
  kind: TrackingActivityKind;
  payload: Record<string, unknown> | null;
  occurred_at: number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeVnId(value: unknown): string | null {
  return typeof value === 'string' && isValidVnId(value) ? normalizeVnId(value) : null;
}

function decodeReadingGoal(value: unknown): ReadingGoalClientRow | null {
  const row = asJsonRecord(value);
  return row &&
    isNonNegativeInteger(row.year) &&
    isNonNegativeInteger(row.target) &&
    row.target <= READING_GOAL_TARGET_MAX &&
    isNonNegativeInteger(row.updated_at)
    ? { year: row.year, target: row.target, updated_at: row.updated_at }
    : null;
}

function decodeGameLogEntry(value: unknown): TrackingGameLogEntry | null {
  const row = asJsonRecord(value);
  const vnId = decodeVnId(row?.vn_id);
  if (
    !row ||
    !isPositiveInteger(row.id) ||
    !vnId ||
    typeof row.note !== 'string' ||
    !isNonNegativeInteger(row.logged_at) ||
    !(row.session_minutes === null || isPositiveInteger(row.session_minutes)) ||
    !isNonNegativeInteger(row.created_at) ||
    !isNonNegativeInteger(row.updated_at)
  ) {
    return null;
  }
  return {
    id: row.id,
    vn_id: vnId,
    note: row.note,
    logged_at: row.logged_at,
    session_minutes: row.session_minutes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isActivityKind(value: unknown): value is TrackingActivityKind {
  return value === 'status' ||
    value === 'rating' ||
    value === 'playtime' ||
    value === 'favorite' ||
    value === 'started' ||
    value === 'finished' ||
    value === 'note' ||
    value === 'manual';
}

function decodeActivityEntry(value: unknown): TrackingActivityEntry | null {
  const row = asJsonRecord(value);
  const payload = row?.payload === null ? null : asJsonRecord(row?.payload);
  const vnId = decodeVnId(row?.vn_id);
  if (
    !row ||
    !isPositiveInteger(row.id) ||
    !vnId ||
    !isActivityKind(row.kind) ||
    payload === null && row.payload !== null ||
    !isNonNegativeInteger(row.occurred_at)
  ) {
    return null;
  }
  return {
    id: row.id,
    vn_id: vnId,
    kind: row.kind,
    payload,
    occurred_at: row.occurred_at,
  };
}

function decodeRouteRow(value: unknown): RouteRow | null {
  const row = asJsonRecord(value);
  const vnId = decodeVnId(row?.vn_id);
  if (
    !row ||
    !isPositiveInteger(row.id) ||
    !vnId ||
    typeof row.name !== 'string' ||
    typeof row.completed !== 'boolean' ||
    !(row.completed_date === null || typeof row.completed_date === 'string' && ISO_DATE_RE.test(row.completed_date)) ||
    !isNonNegativeInteger(row.order_index) ||
    !(row.notes === null || typeof row.notes === 'string') ||
    !isNonNegativeInteger(row.created_at) ||
    !isNonNegativeInteger(row.updated_at)
  ) {
    return null;
  }
  return {
    id: row.id,
    vn_id: vnId,
    name: row.name,
    completed: row.completed,
    completed_date: row.completed_date,
    order_index: row.order_index,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Decode reading-queue rows before the VN-detail toggle inspects membership.
 *
 * @param value Parsed local API payload.
 * @returns Safe queue rows, or `null` for malformed input.
 */
export function decodeReadingQueueResponse(value: unknown): { entries: ReadingQueueClientEntry[] } | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.entries) || record.entries.length > MAX_READING_QUEUE_ROWS) return null;
  const entries: ReadingQueueClientEntry[] = [];
  for (const value of record.entries) {
    const row = asJsonRecord(value);
    const vnId = decodeVnId(row?.vn_id);
    if (
      !row ||
      !vnId ||
      !isPositiveInteger(row.position) ||
      !isNonNegativeInteger(row.added_at)
    ) {
      return null;
    }
    entries.push({
      vn_id: vnId,
      position: row.position,
      added_at: row.added_at,
    });
  }
  return { entries };
}

/**
 * Decode reading-goal state before the stats card renders progress.
 *
 * @param value Parsed local API payload.
 * @returns Safe goal state, or `null` for malformed input.
 */
export function decodeReadingGoalResponse(value: unknown): ReadingGoalClientState | null {
  const record = asJsonRecord(value);
  const goal = record?.goal === null ? null : decodeReadingGoal(record?.goal);
  return record &&
    isNonNegativeInteger(record.year) &&
    (goal !== null || record.goal === null) &&
    isNonNegativeInteger(record.finished)
    ? { year: record.year, goal, finished: record.finished }
    : null;
}

/**
 * Decode a saved reading-goal response.
 *
 * @param value Parsed local API payload.
 * @returns Safe goal row, or `null` for malformed input.
 */
export function decodeReadingGoalMutationResponse(value: unknown): ReadingGoalClientRow | null {
  return decodeReadingGoal(asJsonRecord(value)?.goal);
}

/**
 * Decode a game-log mutation response.
 *
 * @param value Parsed local API payload.
 * @returns Safe game-log row, or `null` for malformed input.
 */
export function decodeGameLogEntryResponse(value: unknown): TrackingGameLogEntry | null {
  return decodeGameLogEntry(asJsonRecord(value)?.entry);
}

/**
 * Decode an activity mutation response.
 *
 * @param value Parsed local API payload.
 * @returns Safe activity row, or `null` for malformed input.
 */
export function decodeActivityEntryResponse(value: unknown): TrackingActivityEntry | null {
  return decodeActivityEntry(asJsonRecord(value)?.entry);
}

/**
 * Decode route rows before route-management state is replaced.
 *
 * @param value Parsed local API payload.
 * @returns Safe route rows, or `null` for malformed input.
 */
export function decodeRoutesResponse(value: unknown): RouteRow[] | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.routes) || record.routes.length > MAX_ROUTE_ROWS) return null;
  const routes = record.routes.map(decodeRouteRow);
  return routes.some((route) => route === null) ? null : routes as RouteRow[];
}
