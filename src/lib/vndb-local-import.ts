import { getVndbLocalImportRepository } from '@/lib/db/repositories/vndb-local-import';
import { isVndbReleaseId, isVndbVnId } from '@/lib/vn-id-shape';
import {
  fetchUlistEntriesByIds,
  getAuthInfo,
  patchRlistEntry,
  patchUlistEntry,
  type VndbUlistEntryDetail,
} from '@/lib/vndb';
import {
  isVndbReleaseListStatus,
  type VndbReleaseListStatus,
} from '@/lib/vndb-release-list-shape';
import { VNDB_STATUS_LABELS } from '@/lib/vndb-user-data-sync';
import { asJsonRecord } from '@/lib/json-shape';
import { isValidStatus, type Status } from '@/lib/types';

const REMOTE_BATCH_SIZE = 100;
const MAX_APPLY_SELECTIONS = 100;

/** One local VN missing from the authenticated VNDB user's list. */
export interface VndbLocalImportVnCandidate {
  kind: 'vn';
  key: string;
  vn_id: string;
  title: string;
  local_status: Status;
}

/** One locally owned edition not currently marked obtained on VNDB. */
export interface VndbLocalImportReleaseCandidate {
  kind: 'release';
  key: string;
  vn_id: string;
  release_id: string;
  title: string;
  edition_label: string | null;
  remote_status: VndbReleaseListStatus | null;
}

/** Selectable local-to-VNDB library import row. */
export type VndbLocalImportCandidate = VndbLocalImportVnCandidate | VndbLocalImportReleaseCandidate;

/** Reason why a local row cannot be sent to VNDB. */
export type VndbLocalImportIneligibleReason = 'unmapped_vn' | 'synthetic_release';

/** Local row that needs a VNDB identity before it can be imported. */
export interface VndbLocalImportIneligible {
  kind: 'vn' | 'release';
  key: string;
  vn_id: string;
  release_id: string | null;
  title: string;
  reason: VndbLocalImportIneligibleReason;
}

/** Stable VN selection snapshot posted back after preview. */
export interface VndbLocalImportVnSelection {
  kind: 'vn';
  vn_id: string;
  local_status: Status;
}

/** Stable owned-edition selection snapshot posted back after preview. */
export interface VndbLocalImportReleaseSelection {
  kind: 'release';
  vn_id: string;
  release_id: string;
  remote_status: VndbReleaseListStatus | null;
}

/** One explicitly selected local-to-VNDB import snapshot. */
export type VndbLocalImportSelection = VndbLocalImportVnSelection | VndbLocalImportReleaseSelection;

/** Summary counts shared by preview and apply responses. */
export interface VndbLocalImportSummary {
  scanned_vns: number;
  scanned_releases: number;
  already_in_vndb: number;
  already_obtained: number;
  ineligible: number;
}

/** Preview result for the local-to-VNDB library import. */
export interface VndbLocalImportPreviewResult {
  ok: true;
  action: 'preview';
  needsAuth: false;
  canApply: boolean;
  candidates: VndbLocalImportCandidate[];
  ineligible: VndbLocalImportIneligible[];
  summary: VndbLocalImportSummary;
}

/** One apply selection that changed after preview. */
export interface VndbLocalImportConflict {
  key: string;
  reason: 'local_missing' | 'local_changed' | 'remote_changed';
}

/** One apply selection rejected by the upstream write. */
export interface VndbLocalImportFailure {
  key: string;
  code: 'vndb_write_failed' | 'vndb_token_required';
}

/** Apply result with granular success, conflict, and failure identities. */
export interface VndbLocalImportApplyResult {
  ok: true;
  action: 'apply';
  needsAuth: false;
  applied: string[];
  conflicts: VndbLocalImportConflict[];
  failures: VndbLocalImportFailure[];
}

/** Non-success result for authentication or token-permission failures. */
export interface VndbLocalImportErrorResult {
  ok: false;
  action: 'preview' | 'apply';
  needsAuth: boolean;
  errorCode: 'vndb_token_required' | 'vndb_list_read_permission_required' | 'vndb_list_write_permission_required';
}

/** Complete server result for local-to-VNDB library import operations. */
export type VndbLocalImportResult = VndbLocalImportPreviewResult | VndbLocalImportApplyResult | VndbLocalImportErrorResult;

function vnKey(vnId: string): string {
  return `vn:${vnId}`;
}

function releaseKey(releaseId: string): string {
  return `release:${releaseId}`;
}

function localReleaseKey(vnId: string, releaseId: string): string {
  return `${vnId}:${releaseId}`;
}

function remoteReleaseStatuses(entries: Iterable<VndbUlistEntryDetail>): Map<string, VndbReleaseListStatus> {
  const statuses = new Map<string, VndbReleaseListStatus>();
  for (const entry of entries) {
    for (const release of entry.releases) statuses.set(release.id, release.list_status);
  }
  return statuses;
}

async function loadRemoteEntries(
  userId: string,
  vnIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, VndbUlistEntryDetail>> {
  const entries = new Map<string, VndbUlistEntryDetail>();
  const uniqueIds = [...new Set(vnIds)].sort();
  for (let offset = 0; offset < uniqueIds.length; offset += REMOTE_BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + REMOTE_BATCH_SIZE);
    const rows = await fetchUlistEntriesByIds(userId, batch, { fresh: true, signal });
    for (const row of rows) entries.set(row.id, row);
  }
  return entries;
}

/**
 * Decode bounded, duplicate-free apply snapshots from an untrusted request body.
 */
export function decodeVndbLocalImportSelections(value: unknown): VndbLocalImportSelection[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_APPLY_SELECTIONS) return null;
  const selections: VndbLocalImportSelection[] = [];
  const keys = new Set<string>();
  for (const raw of value) {
    const row = asJsonRecord(raw);
    if (!row || typeof row.vn_id !== 'string' || !isVndbVnId(row.vn_id)) return null;
    const vnId = row.vn_id.toLowerCase();
    let selection: VndbLocalImportSelection;
    if (row.kind === 'vn' && isValidStatus(row.local_status)) {
      selection = { kind: 'vn', vn_id: vnId, local_status: row.local_status };
    } else if (
      row.kind === 'release'
      && typeof row.release_id === 'string'
      && isVndbReleaseId(row.release_id)
      && (row.remote_status === null || isVndbReleaseListStatus(row.remote_status))
    ) {
      selection = {
        kind: 'release',
        vn_id: vnId,
        release_id: row.release_id.toLowerCase(),
        remote_status: row.remote_status,
      };
    } else {
      return null;
    }
    const key = selection.kind === 'vn' ? vnKey(selection.vn_id) : releaseKey(selection.release_id);
    if (keys.has(key)) return null;
    keys.add(key);
    selections.push(selection);
  }
  return selections;
}

async function preview(signal?: AbortSignal): Promise<VndbLocalImportResult> {
  const auth = await getAuthInfo();
  if (!auth) return { ok: false, action: 'preview', needsAuth: true, errorCode: 'vndb_token_required' };
  if (!auth.permissions.includes('listread')) {
    return { ok: false, action: 'preview', needsAuth: false, errorCode: 'vndb_list_read_permission_required' };
  }
  const snapshot = await getVndbLocalImportRepository().listSnapshot();
  const remoteVnIds = [
    ...snapshot.vns.filter((vn) => isVndbVnId(vn.vn_id)).map((vn) => vn.vn_id),
    ...snapshot.releases.filter((release) => isVndbVnId(release.vn_id)).map((release) => release.vn_id),
  ];
  const remote = await loadRemoteEntries(auth.id, remoteVnIds, signal);
  const remoteReleases = remoteReleaseStatuses(remote.values());
  const candidates: VndbLocalImportCandidate[] = [];
  const ineligible: VndbLocalImportIneligible[] = [];
  let alreadyInVndb = 0;
  let alreadyObtained = 0;
  const seenReleaseIds = new Set<string>();

  for (const vn of snapshot.vns) {
    if (!isVndbVnId(vn.vn_id)) {
      ineligible.push({
        kind: 'vn',
        key: vnKey(vn.vn_id),
        vn_id: vn.vn_id,
        release_id: null,
        title: vn.title,
        reason: 'unmapped_vn',
      });
    } else if (remote.has(vn.vn_id)) {
      alreadyInVndb += 1;
    } else {
      candidates.push({
        kind: 'vn',
        key: vnKey(vn.vn_id),
        vn_id: vn.vn_id,
        title: vn.title,
        local_status: vn.status,
      });
    }
  }

  for (const release of snapshot.releases) {
    if (seenReleaseIds.has(release.release_id)) continue;
    seenReleaseIds.add(release.release_id);
    if (!isVndbVnId(release.vn_id)) {
      ineligible.push({
        kind: 'release',
        key: releaseKey(release.release_id),
        vn_id: release.vn_id,
        release_id: release.release_id,
        title: release.vn_title,
        reason: 'unmapped_vn',
      });
      continue;
    }
    if (!isVndbReleaseId(release.release_id)) {
      ineligible.push({
        kind: 'release',
        key: releaseKey(release.release_id),
        vn_id: release.vn_id,
        release_id: release.release_id,
        title: release.vn_title,
        reason: 'synthetic_release',
      });
      continue;
    }
    const status = remoteReleases.get(release.release_id) ?? null;
    if (status === 2) {
      alreadyObtained += 1;
    } else {
      candidates.push({
        kind: 'release',
        key: releaseKey(release.release_id),
        vn_id: release.vn_id,
        release_id: release.release_id,
        title: release.vn_title,
        edition_label: release.edition_label,
        remote_status: status,
      });
    }
  }

  return {
    ok: true,
    action: 'preview',
    needsAuth: false,
    canApply: auth.permissions.includes('listwrite'),
    candidates,
    ineligible,
    summary: {
      scanned_vns: snapshot.vns.length,
      scanned_releases: snapshot.releases.length,
      already_in_vndb: alreadyInVndb,
      already_obtained: alreadyObtained,
      ineligible: ineligible.length,
    },
  };
}

async function apply(
  selections: readonly VndbLocalImportSelection[],
  signal?: AbortSignal,
): Promise<VndbLocalImportResult> {
  const auth = await getAuthInfo();
  if (!auth) return { ok: false, action: 'apply', needsAuth: true, errorCode: 'vndb_token_required' };
  if (!auth.permissions.includes('listread')) {
    return { ok: false, action: 'apply', needsAuth: false, errorCode: 'vndb_list_read_permission_required' };
  }
  if (!auth.permissions.includes('listwrite')) {
    return { ok: false, action: 'apply', needsAuth: false, errorCode: 'vndb_list_write_permission_required' };
  }
  const snapshot = await getVndbLocalImportRepository().listSnapshot();
  const localVns = new Map(snapshot.vns.map((vn) => [vn.vn_id, vn]));
  const localReleases = new Map(snapshot.releases.map((release) => [
    localReleaseKey(release.vn_id, release.release_id),
    release,
  ]));
  const selectedReleaseIds = new Set(selections.flatMap((selection) => selection.kind === 'release' ? [selection.release_id] : []));
  const remoteVnIds = [
    ...selections.map((selection) => selection.vn_id),
    ...snapshot.releases.flatMap((release) => selectedReleaseIds.has(release.release_id) && isVndbVnId(release.vn_id)
      ? [release.vn_id]
      : []),
  ];
  const remote = await loadRemoteEntries(auth.id, remoteVnIds, signal);
  const remoteReleases = remoteReleaseStatuses(remote.values());
  const applied: string[] = [];
  const conflicts: VndbLocalImportConflict[] = [];
  const failures: VndbLocalImportFailure[] = [];
  const ordered = [...selections].sort((left, right) => Number(left.kind === 'release') - Number(right.kind === 'release'));

  for (const selection of ordered) {
    const key = selection.kind === 'vn' ? vnKey(selection.vn_id) : releaseKey(selection.release_id);
    if (selection.kind === 'vn') {
      const local = localVns.get(selection.vn_id);
      if (!local) {
        conflicts.push({ key, reason: 'local_missing' });
        continue;
      }
      if (local.status !== selection.local_status) {
        conflicts.push({ key, reason: 'local_changed' });
        continue;
      }
      if (remote.has(selection.vn_id)) {
        conflicts.push({ key, reason: 'remote_changed' });
        continue;
      }
      const targetLabel = VNDB_STATUS_LABELS[local.status];
      try {
        const result = await patchUlistEntry(selection.vn_id, {
          labels_set: [targetLabel],
          labels_unset: Object.values(VNDB_STATUS_LABELS).filter((label) => label !== targetLabel),
        });
        if ('needsAuth' in result) failures.push({ key, code: 'vndb_token_required' });
        else applied.push(key);
      } catch {
        failures.push({ key, code: 'vndb_write_failed' });
      }
      continue;
    }

    const local = localReleases.get(localReleaseKey(selection.vn_id, selection.release_id));
    if (!local) {
      conflicts.push({ key, reason: 'local_missing' });
      continue;
    }
    const currentRemoteStatus = remoteReleases.get(selection.release_id) ?? null;
    if (currentRemoteStatus !== selection.remote_status) {
      conflicts.push({ key, reason: 'remote_changed' });
      continue;
    }
    try {
      const result = await patchRlistEntry(selection.release_id, 2);
      if ('needsAuth' in result) failures.push({ key, code: 'vndb_token_required' });
      else applied.push(key);
    } catch {
      failures.push({ key, code: 'vndb_write_failed' });
    }
  }

  return { ok: true, action: 'apply', needsAuth: false, applied, conflicts, failures };
}

/** Preview or apply an explicit local collection import into VNDB user lists. */
export async function importLocalLibraryToVndb(
  options: { action: 'preview'; signal?: AbortSignal } | {
    action: 'apply';
    selections: readonly VndbLocalImportSelection[];
    signal?: AbortSignal;
  },
): Promise<VndbLocalImportResult> {
  return options.action === 'preview'
    ? preview(options.signal)
    : apply(options.selections, options.signal);
}
