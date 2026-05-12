import 'server-only';
import type { Status } from './types';

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
