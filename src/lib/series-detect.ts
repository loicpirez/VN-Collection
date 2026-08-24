import 'server-only';
import { getSeriesRepository } from './db/repositories/series';

export interface SeriesSuggestion {
  /** Existing series to join, when at least one related VN already belongs to one. */
  existing: { id: number; name: string }[];
  /** Suggested name for a new series, derived from the shared title prefix. */
  suggestedName: string | null;
  /** VN ids the user owns that share a `seq` / `preq` / `set` / `fan` relation with the seed. */
  relatedInCollection: { id: string; title: string; relation: string }[];
}

/**
 * BFS through VN relations starting from `seedVnId`, following only
 * series-strength relations (`seq` / `preq` / `set` / `fan` / `alt` / `orig`).
 * Returns every reachable VN we have a `vn` row for, in discovery order.
 *
 * VNDB stores relations per-VN one hop deep; the first volume of a
 * series doesn't directly list the third volume, but the second volume
 * links both. Walking transitively surfaces the full chain so the
 * series picker can offer the whole family.
 *
 * Excludes the seed itself from the returned list.
 */
/**
 * Defensive cap on the BFS frontier so a pathological VN with
 * thousands of series-strength relations (or a corrupted JSON column
 * containing a cycle the visited-set somehow misses) doesn't run
 * away with memory. 500 is well above the largest legitimate
 * series chain (~30-50 entries for long-running franchises) but
 * still keeps `addVnToSeries(... expand=true)` from issuing 999+
 * UPDATEs in a single transaction.
 */
export async function walkSeriesRelations(
  seedVnId: string,
): Promise<Array<{ id: string; title: string; relation: string }>> {
  return getSeriesRepository().walkRelations(seedVnId);
}

/**
 * Inspect a VN's VNDB relations and the local collection to propose
 * series membership. Returns nothing when there's no signal — caller
 * should hide the suggestion card.
 *
 * Rules:
 *   - Only relations in SERIES_RELATIONS are considered (seq, preq, set, …).
 *     `char` / `side` / `par` etc. are too weak to imply a series.
 *   - "Existing series": any series that already contains at least one
 *     related VN. The user can join the seed VN with one click.
 *   - "Suggested new series": the longest common prefix of the seed +
 *     the in-collection related titles, falling back to a trimmed seed
 *     title if no common prefix emerges.
 */
export async function detectSeriesForVn(vnId: string): Promise<SeriesSuggestion | null> {
  return getSeriesRepository().suggest(vnId);
}
