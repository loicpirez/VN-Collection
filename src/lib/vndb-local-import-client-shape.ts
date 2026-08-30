import { asJsonRecord } from '@/lib/json-shape';
import { isValidStatus, type Status } from '@/lib/types';
import { isVndbReleaseId, isVndbVnId } from '@/lib/vn-id-shape';
import { isVndbReleaseListStatus, type VndbReleaseListStatus } from '@/lib/vndb-release-list-shape';

const MAX_ROWS = 10_000;
const MAX_APPLY_ROWS = 100;

/** Client-safe selectable local VN import row. */
export interface VndbLocalImportVnCandidateClient {
  kind: 'vn';
  key: string;
  vn_id: string;
  title: string;
  local_status: Status;
}

/** Client-safe selectable owned-edition import row. */
export interface VndbLocalImportReleaseCandidateClient {
  kind: 'release';
  key: string;
  vn_id: string;
  release_id: string;
  title: string;
  edition_label: string | null;
  remote_status: VndbReleaseListStatus | null;
}

/** Client-safe selectable local-to-VNDB import row. */
export type VndbLocalImportCandidateClient =
  | VndbLocalImportVnCandidateClient
  | VndbLocalImportReleaseCandidateClient;

/** Client-safe local row that cannot be imported before mapping. */
export interface VndbLocalImportIneligibleClient {
  kind: 'vn' | 'release';
  key: string;
  vn_id: string;
  release_id: string | null;
  title: string;
  reason: 'unmapped_vn' | 'synthetic_release';
}

/** Client-safe import preview response. */
export interface VndbLocalImportPreviewClient {
  ok: true;
  action: 'preview';
  needsAuth: false;
  canApply: boolean;
  candidates: VndbLocalImportCandidateClient[];
  ineligible: VndbLocalImportIneligibleClient[];
  summary: {
    scanned_vns: number;
    scanned_releases: number;
    already_in_vndb: number;
    already_obtained: number;
    ineligible: number;
  };
}

/** Client-safe import apply response. */
export interface VndbLocalImportApplyClient {
  ok: true;
  action: 'apply';
  needsAuth: false;
  applied: string[];
  conflicts: Array<{ key: string; reason: 'local_missing' | 'local_changed' | 'remote_changed' }>;
  failures: Array<{ key: string; code: 'vndb_write_failed' | 'vndb_token_required' }>;
}

/** Client-safe authentication or permission response. */
export interface VndbLocalImportErrorClient {
  ok: false;
  action: 'preview' | 'apply';
  needsAuth: boolean;
  errorCode: 'vndb_token_required' | 'vndb_list_read_permission_required' | 'vndb_list_write_permission_required';
}

/** Client-safe union returned by the local-to-VNDB import route. */
export type VndbLocalImportResponseClient =
  | VndbLocalImportPreviewClient
  | VndbLocalImportApplyClient
  | VndbLocalImportErrorClient;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeCandidate(value: unknown): VndbLocalImportCandidateClient | null {
  const row = asJsonRecord(value);
  if (
    !row
    || typeof row.vn_id !== 'string'
    || !isVndbVnId(row.vn_id)
    || typeof row.title !== 'string'
  ) return null;
  const vnId = row.vn_id.toLowerCase();
  if (
    row.kind === 'vn'
    && row.key === `vn:${vnId}`
    && isValidStatus(row.local_status)
  ) {
    return { kind: 'vn', key: row.key, vn_id: vnId, title: row.title, local_status: row.local_status };
  }
  if (
    row.kind === 'release'
    && typeof row.release_id === 'string'
    && isVndbReleaseId(row.release_id)
    && row.key === `release:${row.release_id.toLowerCase()}`
    && (row.edition_label === null || typeof row.edition_label === 'string')
    && (row.remote_status === null || isVndbReleaseListStatus(row.remote_status))
  ) {
    return {
      kind: 'release',
      key: row.key,
      vn_id: vnId,
      release_id: row.release_id.toLowerCase(),
      title: row.title,
      edition_label: row.edition_label,
      remote_status: row.remote_status,
    };
  }
  return null;
}

function decodeIneligible(value: unknown): VndbLocalImportIneligibleClient | null {
  const row = asJsonRecord(value);
  if (
    !row
    || (row.kind !== 'vn' && row.kind !== 'release')
    || typeof row.key !== 'string'
    || typeof row.vn_id !== 'string'
    || !(row.release_id === null || typeof row.release_id === 'string')
    || typeof row.title !== 'string'
    || (row.reason !== 'unmapped_vn' && row.reason !== 'synthetic_release')
  ) return null;
  return {
    kind: row.kind,
    key: row.key,
    vn_id: row.vn_id.toLowerCase(),
    release_id: row.release_id?.toLowerCase() ?? null,
    title: row.title,
    reason: row.reason,
  };
}

function decodeStringArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some((entry) => typeof entry !== 'string')) return null;
  return new Set(value).size === value.length ? value : null;
}

/** Decode and bound a local-to-VNDB import response before rendering it. */
export function decodeVndbLocalImportResponse(value: unknown): VndbLocalImportResponseClient | null {
  const row = asJsonRecord(value);
  if (
    !row
    || typeof row.ok !== 'boolean'
    || (row.action !== 'preview' && row.action !== 'apply')
    || typeof row.needsAuth !== 'boolean'
  ) return null;
  if (!row.ok) {
    if (
      row.errorCode !== 'vndb_token_required'
      && row.errorCode !== 'vndb_list_read_permission_required'
      && row.errorCode !== 'vndb_list_write_permission_required'
    ) return null;
    return { ok: false, action: row.action, needsAuth: row.needsAuth, errorCode: row.errorCode };
  }
  if (row.action === 'preview') {
    const summary = asJsonRecord(row.summary);
    if (
      row.needsAuth
      || typeof row.canApply !== 'boolean'
      || !Array.isArray(row.candidates)
      || row.candidates.length > MAX_ROWS
      || !Array.isArray(row.ineligible)
      || row.ineligible.length > MAX_ROWS
      || !summary
      || !isNonNegativeInteger(summary.scanned_vns)
      || !isNonNegativeInteger(summary.scanned_releases)
      || !isNonNegativeInteger(summary.already_in_vndb)
      || !isNonNegativeInteger(summary.already_obtained)
      || !isNonNegativeInteger(summary.ineligible)
    ) return null;
    const candidates = row.candidates.map(decodeCandidate);
    const ineligible = row.ineligible.map(decodeIneligible);
    if (candidates.some((candidate) => !candidate) || ineligible.some((entry) => !entry)) return null;
    const candidateRows = candidates as VndbLocalImportCandidateClient[];
    if (new Set(candidateRows.map((candidate) => candidate.key)).size !== candidateRows.length) return null;
    return {
      ok: true,
      action: 'preview',
      needsAuth: false,
      canApply: row.canApply,
      candidates: candidateRows,
      ineligible: ineligible as VndbLocalImportIneligibleClient[],
      summary: {
        scanned_vns: summary.scanned_vns,
        scanned_releases: summary.scanned_releases,
        already_in_vndb: summary.already_in_vndb,
        already_obtained: summary.already_obtained,
        ineligible: summary.ineligible,
      },
    };
  }
  if (row.needsAuth) return null;
  const applied = decodeStringArray(row.applied, MAX_APPLY_ROWS);
  if (!applied || !Array.isArray(row.conflicts) || row.conflicts.length > MAX_APPLY_ROWS || !Array.isArray(row.failures) || row.failures.length > MAX_APPLY_ROWS) {
    return null;
  }
  const conflicts: VndbLocalImportApplyClient['conflicts'] = [];
  for (const value of row.conflicts) {
    const conflict = asJsonRecord(value);
    if (
      !conflict
      || typeof conflict.key !== 'string'
      || (conflict.reason !== 'local_missing' && conflict.reason !== 'local_changed' && conflict.reason !== 'remote_changed')
    ) return null;
    conflicts.push({ key: conflict.key, reason: conflict.reason });
  }
  const failures: VndbLocalImportApplyClient['failures'] = [];
  for (const value of row.failures) {
    const failure = asJsonRecord(value);
    if (
      !failure
      || typeof failure.key !== 'string'
      || (failure.code !== 'vndb_write_failed' && failure.code !== 'vndb_token_required')
    ) return null;
    failures.push({ key: failure.key, code: failure.code });
  }
  return { ok: true, action: 'apply', needsAuth: false, applied, conflicts, failures };
}
