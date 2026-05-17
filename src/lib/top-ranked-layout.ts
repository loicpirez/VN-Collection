/**
 * Pure helpers for the chip selection logic on `/top-ranked`. The
 * two tabs (VNDB / EGS) used to inline a near-identical chip cascade
 * with slightly different conditions, making it easy to silently
 * regress parity (e.g. drop the year chip from one side only). This
 * module is the single source of truth; the page renders the result
 * directly so the tests below pin the user-visible chip count.
 *
 * The split is intentional:
 *   - `primaryChips` returns the top-row chips that BOTH tabs render
 *     in identical positions. The presence rule (`value != null`) is
 *     the only thing that drops a chip; the tab kind does not change
 *     it.
 *   - `secondaryChips` returns chips that one tab has and the other
 *     doesn't (currently the EGS Bayesian shrunken score). Always
 *     rendered AFTER the primary row in a visibly secondary style.
 */

import { egsBayesianScore } from './erogamescape';

export type RankTab = 'vndb' | 'egs';

export interface PrimaryChipInput {
  kind: RankTab;
  /** 0-100 raw rating (VNDB stores 0-100; EGS median is also 0-100). */
  rating: number | null;
  /** Vote / reviewer count. Dropped when null. */
  votecount: number | null;
  /** 4-digit year string (e.g. "2018"). Pre-sliced by the caller so
   *  the helper stays date-format agnostic. */
  yearDigits: string | null;
}

export type PrimaryChipKind = 'rating' | 'votes' | 'year';

export interface PrimaryChip {
  kind: PrimaryChipKind;
}

/**
 * Returns the chip kinds rendered in the primary row for one card.
 * Both VNDB and EGS tabs must produce the same number of chips for
 * equivalent inputs — the layout-parity test asserts exactly that.
 */
export function primaryChips(input: PrimaryChipInput): PrimaryChip[] {
  const chips: PrimaryChip[] = [];
  if (input.rating != null) chips.push({ kind: 'rating' });
  if (input.votecount != null) chips.push({ kind: 'votes' });
  if (input.yearDigits) chips.push({ kind: 'year' });
  return chips;
}

export interface SecondaryChipInput {
  kind: RankTab;
  rating: number | null;
  count: number | null;
}

export interface BayesSecondaryChip {
  kind: 'bayes';
  /** Shrunken score on the 0-100 scale, rounded to integer. */
  value: number;
}

export type SecondaryChip = BayesSecondaryChip;

/**
 * Tab-specific extras rendered below the primary row. EGS adds the
 * Bayesian-shrunken score so the operator can tell at a glance how
 * a low-vote outlier was downweighted; VNDB has no equivalent extra
 * today and returns an empty array.
 */
export function secondaryChips(input: SecondaryChipInput): SecondaryChip[] {
  if (input.kind !== 'egs') return [];
  if (input.rating == null || input.count == null) return [];
  const shrunk = Math.round(egsBayesianScore(input.rating, input.count));
  return [{ kind: 'bayes', value: shrunk }];
}
