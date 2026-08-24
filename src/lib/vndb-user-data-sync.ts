import type { Status } from './types';

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
  local: Status | number | string | null;
  remote: Status | number | string | null;
  canPullRemote: boolean;
  canPushLocal: boolean;
}

const STATUS_PRECEDENCE: readonly Status[] = ['completed', 'dropped', 'on_hold', 'playing', 'planning'];

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

/**
 * Validate a bounded, duplicate-free list of synchronization fields.
 *
 * @param value Untrusted API value.
 * @returns A normalized field list, or `null` when the value is malformed.
 */
export function decodeVndbSyncFields(value: unknown): VndbSyncField[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > VNDB_SYNC_FIELDS.length) return null;
  const allowed = new Set<string>(VNDB_SYNC_FIELDS);
  if (!value.every((field) => typeof field === 'string' && allowed.has(field))) return null;
  const fields = value as VndbSyncField[];
  return new Set(fields).size === fields.length ? fields : null;
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
