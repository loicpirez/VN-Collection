/**
 * Pure parsing helpers for /top-ranked URL params, extracted so they can
 * be unit-tested without booting Next.js / React.
 *
 * The on-screen behaviors these encode:
 *   - `tab` defaults to vndb on garbage / missing.
 *   - `page` clamps to [1, 20] (page-1 on garbage).
 *   - `min` snaps to the nearest preset in MIN_VOTES_PRESETS so cache
 *     keys converge — any arbitrary user-typed value (e.g.
 *     ?min=137) lands on the closest preset (100). Falls back to the
 *     supplied default on garbage.
 */
export type TopRankedTab = 'vndb' | 'egs';

export const MIN_VOTES_PRESETS: readonly number[] = [50, 100, 250, 500, 1000];
export const MAX_PAGE = 20;

export function parseTab(value: string | undefined): TopRankedTab {
  return value === 'egs' ? 'egs' : 'vndb';
}

export function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_PAGE, n);
}

export function parseMinVotes(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  // Snap to the closest preset; first match wins on a tie.
  let best = MIN_VOTES_PRESETS[0];
  let bestDist = Math.abs(n - best);
  for (const candidate of MIN_VOTES_PRESETS) {
    const d = Math.abs(n - candidate);
    if (d < bestDist) {
      best = candidate;
      bestDist = d;
    }
  }
  return best;
}
