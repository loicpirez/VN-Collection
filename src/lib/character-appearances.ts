/**
 * Character-detail appearance projection.
 *
 * VNDB's `/character` endpoint returns one row per
 * (character, vn, release) tuple, so a character that appears
 * in N releases of the same VN shows up as N duplicate rows on
 * `char.vns`. The detail page used to render every duplicate as
 * its own "appears in" card, which:
 *
 *   - visually inflated the appearance count,
 *   - showed the same cover N times in a row,
 *   - hid the actual edition spread behind a noisy list.
 *
 * `dedupAppearances` collapses the list by VN id, keeping the
 * row with the most informative role (main > primary > side >
 * appears) and surfacing the release count so the card can
 * render "3 editions" next to the title when N > 1. The helper
 * is pure and small so it can stay covered by a unit test
 * without booting the App Router runtime.
 */

import type { VndbCharacterVn } from './vndb';

const ROLE_RANK: Record<string, number> = {
  main: 0,
  primary: 1,
  side: 2,
  appears: 3,
};

export interface AppearanceRow extends VndbCharacterVn {
  /**
   * Number of distinct release-tuple rows VNDB returned for
   * this VN id. Always >= 1. Surfaces as the "N editions" chip
   * on the appearance card. Computed from the input slice only —
   * never inferred from /release lookups.
   */
  releaseCount: number;
}

/**
 * Collapse VNDB character.vns rows by `id`. The "winning" row
 * for each VN is the one with the strongest role (main wins
 * over side); ties fall back to the first occurrence so the
 * caller's existing ordering survives. `releaseCount` reflects
 * the number of source rows that mapped to that VN id.
 *
 * Input is treated as read-only; the function never mutates the
 * caller's array or the row objects it returned.
 */
export function dedupAppearances(rows: readonly VndbCharacterVn[]): AppearanceRow[] {
  const out = new Map<string, AppearanceRow>();
  for (const row of rows) {
    const existing = out.get(row.id);
    if (!existing) {
      out.set(row.id, { ...row, releaseCount: 1 });
      continue;
    }
    const incomingRank = ROLE_RANK[row.role] ?? 9;
    const existingRank = ROLE_RANK[existing.role] ?? 9;
    const nextReleaseCount = existing.releaseCount + 1;
    if (incomingRank < existingRank) {
      out.set(row.id, { ...row, releaseCount: nextReleaseCount });
    } else {
      existing.releaseCount = nextReleaseCount;
    }
  }
  return Array.from(out.values());
}
