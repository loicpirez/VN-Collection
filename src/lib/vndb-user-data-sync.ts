import { asJsonRecord } from './json-shape';
import { isValidStatus, type Status } from './types';

/** Local collection status to predefined VNDB ulist-label mapping. */
export const VNDB_STATUS_LABELS: Readonly<Record<Status, number>> = {
  planning: 5,
  playing: 1,
  completed: 2,
  on_hold: 3,
  dropped: 4,
};

/** User fields that can be compared and synchronized with a VNDB ulist entry. */
export const VNDB_SYNC_FIELDS = ['status', 'vote', 'started', 'finished', 'notes'] as const;
export type VndbSyncField = (typeof VNDB_SYNC_FIELDS)[number];
export type VndbSyncValue = Status | number | string | null;

/** One conflict snapshot selected for an explicit synchronization direction. */
export interface VndbSyncSelection {
  field: VndbSyncField;
  local: VndbSyncValue;
  remote: VndbSyncValue;
}

/** Normalized local values used by the conflict resolver. */
export interface LocalVndbUserData {
  status: Status | null;
  vote: number | null;
  started: string | null;
  finished: string | null;
  notes: string | null;
}

/** Normalized remote values used by the conflict resolver. */
export interface RemoteVndbUserData extends LocalVndbUserData {}

/** One field whose local and VNDB values differ. */
export interface VndbUserDataDifference {
  field: VndbSyncField;
  local: VndbSyncValue;
  remote: VndbSyncValue;
  canPullRemote: boolean;
  canPushLocal: boolean;
}

const STATUS_PRECEDENCE: readonly Status[] = ['completed', 'dropped', 'on_hold', 'playing', 'planning'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve predefined VNDB labels to one local collection status.
 *
 * @param labels VNDB label objects or numeric identifiers.
 * @returns The strongest mapped status, or `null` when no status label exists.
 */
export function statusFromVndbLabels(labels: ReadonlyArray<number | { id: number }>): Status | null {
  const ids = new Set(labels.map((label) => typeof label === 'number' ? label : label.id));
  for (const status of STATUS_PRECEDENCE) {
    if (ids.has(VNDB_STATUS_LABELS[status])) return status;
  }
  return null;
}

/** Return whether an untrusted value names one synchronizable VNDB field. */
function isVndbSyncField(value: unknown): value is VndbSyncField {
  return typeof value === 'string' && VNDB_SYNC_FIELDS.some((field) => field === value);
}

function decodeSnapshotValue(field: VndbSyncField, value: unknown): VndbSyncValue | undefined {
  if (value === null) return null;
  if (field === 'status') return isValidStatus(value) ? value : undefined;
  if (field === 'vote') {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 10 && value <= 100
      ? value
      : undefined;
  }
  if (field === 'started' || field === 'finished') {
    return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * Validate conflict values captured by the client before a synchronization.
 *
 * @param value Untrusted API value.
 * @returns A bounded, duplicate-free snapshot list, or `null` when malformed.
 */
export function decodeVndbSyncSelections(value: unknown): VndbSyncSelection[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > VNDB_SYNC_FIELDS.length) return null;
  const selections: VndbSyncSelection[] = [];
  for (const valueEntry of value) {
    const entry = asJsonRecord(valueEntry);
    if (!entry || !isVndbSyncField(entry.field)) return null;
    const local = decodeSnapshotValue(entry.field, entry.local);
    const remote = decodeSnapshotValue(entry.field, entry.remote);
    if (local === undefined || remote === undefined) return null;
    selections.push({ field: entry.field, local, remote });
  }
  return new Set(selections.map((selection) => selection.field)).size === selections.length
    ? selections
    : null;
}

/**
 * Compare local collection values with one normalized VNDB entry.
 *
 * @param local Local collection values.
 * @param remote VNDB ulist values.
 * @returns Differences in stable UI order.
 */
export function compareVndbUserData(
  local: LocalVndbUserData,
  remote: RemoteVndbUserData,
): VndbUserDataDifference[] {
  const differences: VndbUserDataDifference[] = [];
  for (const field of VNDB_SYNC_FIELDS) {
    if (local[field] === remote[field]) continue;
    differences.push({
      field,
      local: local[field],
      remote: remote[field],
      canPullRemote: field !== 'status' || remote.status !== null,
      canPushLocal: field !== 'notes' || local.notes === null || local.notes.length <= 10_000,
    });
  }
  return differences;
}

/**
 * Normalize nullable VNDB text fields so empty values compare as absent.
 *
 * @param value Upstream or persisted text.
 * @returns Trim-preserving text or `null` for empty input.
 */
export function normalizeVndbSyncText(value: string | null | undefined): string | null {
  return value == null || value.trim() === '' ? null : value;
}
