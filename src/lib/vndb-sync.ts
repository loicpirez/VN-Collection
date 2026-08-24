import 'server-only';
import type { Status } from './types';
import { fetchUlistByLabel, getAuthInfo } from './vndb';
import { throttledFetch } from './vndb-throttle';
import { finishJob, jobCurrentItem, jobLabel, recordError, setJobCurrent, startJob, tickJob } from './download-status';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getCollectionCoreRepository } from './db/repositories/collection-core';
import { getVnReadRepository } from './db/repositories/vn-read';

import { isVndbVnId, normalizeVnId } from '@/lib/vn-id-shape';
import { isValidStatus } from './types';
import { statusFromVndbLabels, VNDB_STATUS_LABELS } from './vndb-user-data-sync';
/**
 * Two-way sync between local status and VNDB list labels.
 * The mapping is one-way directional but consistent so reading remote
 * labels back into local statuses is unambiguous.
 *
 *   local              vndb_label_id   vndb_label
 *   ───────────────    ─────────────    ─────────────────
 *   planning           5                Wishlist
 *   playing            1                Playing
 *   completed          2                Finished
 *   on_hold            3                Stalled
 *   dropped            4                Dropped
 *
 * `maybePushStatusToVndb` is called after a local collection transaction when
 * the app-setting `vndb_writeback = '1'` is enabled. Users who don't want their
 * local state mirrored remotely can leave the setting off (default).
 */

export const VNDB_LABELS = VNDB_STATUS_LABELS;

export const VNDB_LABELS_REVERSE: Record<number, Status> = Object.fromEntries(
  Object.entries(VNDB_LABELS).map(([k, v]) => [v, k as Status]),
) as Record<number, Status>;

export interface VndbWriteResult {
  ok: boolean;
  status?: number;
  message?: string;
}

/**
 * Patch the user's VNDB list for a VN to match the local status. The token
 * must carry the `listwrite` permission; otherwise VNDB returns 403 and we
 * surface it via the ok=false return.
 */
export async function pushStatusToVndb(
  vnId: string,
  status: Status | null,
  token: string,
): Promise<VndbWriteResult> {
  if (!isVndbVnId(vnId)) return { ok: false, message: 'not a vndb id' };
  // Compute which labels to set + unset based on the new status.
  const ALL = Object.values(VNDB_LABELS);
  const target = status ? VNDB_LABELS[status] : null;
  const labelsSet = target != null ? [target] : [];
  const labelsUnset = ALL.filter((l) => l !== target);

  if (status == null) {
    // Status cleared — full delete from list.
    const r = await throttledFetch(`https://api.vndb.org/kana/ulist/${vnId}`, {
      method: 'DELETE',
      headers: { Authorization: `Token ${token}` },
    });
    return { ok: r.ok, status: r.status };
  }

  const r = await throttledFetch(`https://api.vndb.org/kana/ulist/${vnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ labels_set: labelsSet, labels_unset: labelsUnset }),
  });
  return { ok: r.ok, status: r.status };
}

/**
 * Mirror a local status change when VNDB write-back is enabled.
 * Remote failures are intentionally isolated from the committed local change.
 */
export async function maybePushStatusToVndb(
  vnId: string,
  status: Status | null | undefined,
): Promise<void> {
  if (status === undefined || !isVndbVnId(vnId)) return;
  const settings = getAppSettingRepository();
  if (await settings.get('vndb_writeback') !== '1') return;
  const token = await settings.get('vndb_token');
  if (!token?.trim()) return;
  try {
    await pushStatusToVndb(vnId, status, token.trim());
  } catch {
    // A remote echo must never roll back or fail the local collection change.
  }
}

export interface PullChange {
  vn_id: string;
  title: string;
  from: Status;
  to: Status;
}

/** One operator-approved status transition from a previous preview. */
export interface PullSelection {
  vn_id: string;
  from: Status;
  to: Status;
}

/** Status-pull execution mode. Preview never writes; apply revalidates every selection. */
export type PullOptions =
  | { action: 'preview' }
  | { action: 'apply'; selections: PullSelection[] };

export interface PullResult {
  ok: boolean;
  action: PullOptions['action'];
  needsAuth?: boolean;
  scanned: number;
  updated: number;
  unchanged: number;
  skippedNotInCollection: number;
  conflicts: number;
  failedLabels: number[];
  changes: PullChange[];
  unmatched: { vn_id: string; status: Status }[];
  errorCode?: 'vndb_status_snapshot_incomplete';
  message?: string;
}

/**
 * Decode a bounded set of status transitions supplied by the settings client.
 *
 * @param value Untrusted request-body value.
 * @returns Normalized unique selections, or `null` for malformed input.
 */
export function decodePullSelections(value: unknown): PullSelection[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) return null;
  const selections: PullSelection[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.vn_id !== 'string' ||
      !isVndbVnId(row.vn_id) ||
      !isValidStatus(row.from) ||
      !isValidStatus(row.to) ||
      row.from === row.to
    ) {
      return null;
    }
    const vnId = normalizeVnId(row.vn_id);
    if (ids.has(vnId)) return null;
    ids.add(vnId);
    selections.push({ vn_id: vnId, from: row.from, to: row.to });
  }
  return selections;
}

/**
 * Precedence when a VN carries multiple status labels on VNDB. "completed"
 * wins over the in-progress states because the user has reached the terminal
 * outcome of having played and finished the game; "dropped" / "on_hold" reflect
 * abandonment so they outrank "playing" which itself outranks "planning".
 */
function pickStatusFromLabels(labelIds: number[]): Status | null {
  return statusFromVndbLabels(labelIds);
}

/**
 * Pull every status-bearing ulist entry from VNDB and align local statuses
 * accordingly. Only updates VNs already in the local collection — VNDB has
 * many more entries than the user actually owns locally and silently
 * importing them would surprise the user. To bring something new in, the
 * user clicks "Add" on /vn/[id] manually.
 *
 * Returns counts so the UI can show "updated N / X scanned".
 */
export async function pullStatusesFromVndb(options: PullOptions = { action: 'preview' }): Promise<PullResult> {
  const auth = await getAuthInfo();
  if (!auth) {
    return {
      ok: false,
      action: options.action,
      needsAuth: true,
      scanned: 0,
      updated: 0,
      unchanged: 0,
      skippedNotInCollection: 0,
      conflicts: 0,
      failedLabels: [],
      changes: [],
      unmatched: [],
      message: 'no vndb token',
    };
  }

  const account = auth.username ?? auth.id;
  const job = startJob('vndb-pull', jobLabel('pull_statuses_for_account', `Pulling statuses for ${account}`, { account }), Object.values(VNDB_LABELS).length);
  try {
    const labels: Record<string, number[]> = {};
    const failedLabels: number[] = [];
    for (const labelId of Object.values(VNDB_LABELS)) {
      setJobCurrent(job.id, jobCurrentItem('vndb_label', `label ${labelId}`, { labelId }));
      try {
        for (let page = 1; page <= 50; page++) {
          const r = await fetchUlistByLabel(auth.id, labelId, { results: 100, page });
          for (const entry of r.results) {
            const ids = (labels[entry.id] ??= []);
            for (const l of entry.labels) ids.push(l.id);
          }
          if (!r.more) break;
        }
      } catch (error) {
        failedLabels.push(labelId);
        recordError(job.id, `label-${labelId}`, (error as Error).message);
      }
      tickJob(job.id);
    }

    const scanned = Object.keys(labels).length;
    if (failedLabels.length > 0) {
      return {
        ok: false,
        action: options.action,
        scanned,
        updated: 0,
        unchanged: 0,
        skippedNotInCollection: 0,
        conflicts: 0,
        failedLabels,
        changes: [],
        unmatched: [],
        errorCode: 'vndb_status_snapshot_incomplete',
        message: 'incomplete vndb status snapshot',
      };
    }

    let unchanged = 0;
    let skipped = 0;
    const proposed: PullChange[] = [];
    const unmatched: { vn_id: string; status: Status }[] = [];
    const vnReader = getVnReadRepository();
    for (const [vnId, labelIds] of Object.entries(labels)) {
      const target = pickStatusFromLabels(labelIds);
      if (!target) {
        skipped += 1;
        continue;
      }
      const local = await vnReader.getCollectionItem(vnId);
      if (!local?.status) {
        skipped += 1;
        if (unmatched.length < 20) unmatched.push({ vn_id: vnId, status: target });
        continue;
      }
      if (local.status === target) {
        unchanged += 1;
        continue;
      }
      proposed.push({ vn_id: vnId, title: local.title, from: local.status, to: target });
    }

    if (options.action === 'preview') {
      return {
        ok: true,
        action: 'preview',
        scanned,
        updated: 0,
        unchanged,
        skippedNotInCollection: skipped,
        conflicts: 0,
        failedLabels: [],
        changes: proposed,
        unmatched,
      };
    }

    const proposals = new Map(proposed.map((change) => [change.vn_id, change]));
    const requested = new Map(options.selections.map((selection) => [selection.vn_id, selection]));
    const remaining: PullChange[] = [];
    const collection = getCollectionCoreRepository();
    let updated = 0;
    let conflicts = 0;

    for (const change of proposed) {
      const selection = requested.get(change.vn_id);
      if (!selection) {
        remaining.push(change);
        continue;
      }
      if (selection.from !== change.from || selection.to !== change.to) {
        conflicts += 1;
        remaining.push(change);
        continue;
      }
      const applied = await collection.updateStatusIfCurrent(change.vn_id, change.from, change.to);
      if (!applied) {
        const current = await vnReader.getCollectionItem(change.vn_id);
        conflicts += 1;
        if (current?.status && current.status !== change.to) {
          remaining.push({ ...change, from: current.status });
        }
        continue;
      }
      updated += 1;
    }

    for (const selection of options.selections) {
      if (!proposals.has(selection.vn_id)) conflicts += 1;
    }

    return {
      ok: true,
      action: 'apply',
      scanned,
      updated,
      unchanged,
      skippedNotInCollection: skipped,
      conflicts,
      failedLabels: [],
      changes: remaining,
      unmatched,
    };
  } finally {
    finishJob(job.id);
  }
}
