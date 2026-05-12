import 'server-only';
import type { Status } from './types';
import { getCollectionItem, updateCollection } from './db';
import { fetchUlistByLabel, getAuthInfo } from './vndb';

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
 * Scaffolded — the helper exposes the mapping + a `pushStatus(vnId, status)`
 * stub. Wiring it into `updateCollection` is gated behind an opt-in setting
 * (`vndb_writeback = '1'`) so users who don't want their local state
 * mirrored remotely can keep their VNDB list untouched.
 */

export const VNDB_LABELS: Record<Status, number> = {
  planning: 5,
  playing: 1,
  completed: 2,
  on_hold: 3,
  dropped: 4,
};

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
  if (!/^v\d+$/i.test(vnId)) return { ok: false, message: 'not a vndb id' };
  // Compute which labels to set + unset based on the new status.
  const ALL = Object.values(VNDB_LABELS);
  const target = status ? VNDB_LABELS[status] : null;
  const labelsSet = target != null ? [target] : [];
  const labelsUnset = ALL.filter((l) => l !== target);

  if (status == null) {
    // Status cleared — full delete from list.
    const r = await fetch(`https://api.vndb.org/kana/ulist/${vnId}`, {
      method: 'DELETE',
      headers: { Authorization: `Token ${token}` },
    });
    return { ok: r.ok, status: r.status };
  }

  const r = await fetch(`https://api.vndb.org/kana/ulist/${vnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ labels_set: labelsSet, labels_unset: labelsUnset }),
  });
  return { ok: r.ok, status: r.status };
}

export interface PullResult {
  ok: boolean;
  needsAuth?: boolean;
  scanned: number;
  updated: number;
  unchanged: number;
  skippedNotInCollection: number;
  message?: string;
}

/**
 * Precedence when a VN carries multiple status labels on VNDB. "completed"
 * wins over the in-progress states because the user has reached the terminal
 * outcome of having played and finished the game; "dropped" / "on_hold" reflect
 * abandonment so they outrank "playing" which itself outranks "planning".
 */
const STATUS_PRECEDENCE: Status[] = ['completed', 'dropped', 'on_hold', 'playing', 'planning'];

function pickStatusFromLabels(labelIds: number[]): Status | null {
  const localStatuses = labelIds
    .map((id) => VNDB_LABELS_REVERSE[id])
    .filter((s): s is Status => s != null);
  if (localStatuses.length === 0) return null;
  for (const s of STATUS_PRECEDENCE) {
    if (localStatuses.includes(s)) return s;
  }
  return localStatuses[0];
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
export async function pullStatusesFromVndb(): Promise<PullResult> {
  const auth = await getAuthInfo();
  if (!auth) {
    return {
      ok: false,
      needsAuth: true,
      scanned: 0,
      updated: 0,
      unchanged: 0,
      skippedNotInCollection: 0,
      message: 'no vndb token',
    };
  }

  // Accumulate status per vn id across all label queries, then resolve via
  // precedence at the end.
  const labels: Record<string, number[]> = {};
  for (const labelId of Object.values(VNDB_LABELS)) {
    for (let page = 1; page <= 50; page++) {
      const r = await fetchUlistByLabel(auth.id, labelId, { results: 100, page });
      for (const entry of r.results) {
        const ids = (labels[entry.id] ??= []);
        for (const l of entry.labels) ids.push(l.id);
      }
      if (!r.more) break;
    }
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const scanned = Object.keys(labels).length;
  for (const [vnId, labelIds] of Object.entries(labels)) {
    const target = pickStatusFromLabels(labelIds);
    if (!target) {
      skipped += 1;
      continue;
    }
    const local = getCollectionItem(vnId);
    if (!local) {
      skipped += 1;
      continue;
    }
    if (local.status === target) {
      unchanged += 1;
      continue;
    }
    updateCollection(vnId, { status: target });
    updated += 1;
  }

  return {
    ok: true,
    scanned,
    updated,
    unchanged,
    skippedNotInCollection: skipped,
  };
}

