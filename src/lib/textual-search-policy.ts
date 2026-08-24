import type { CollectionFindMatch } from './collection-find-client-shape';

/** Number of strong title matches required before the secondary quote search is redundant. */
export const TEXTUAL_SEARCH_LOCAL_MATCH_THRESHOLD = 6;

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('und');
}

/**
 * Decide whether title search already produced a sufficiently strong local result set.
 *
 * @param query User-entered query.
 * @param matches Bounded local collection title matches.
 * @returns True only when enough primary or alternate titles exactly match or start with the query.
 */
export function hasEnoughStrongLocalMatches(
  query: string,
  matches: readonly CollectionFindMatch[],
): boolean {
  const needle = normalized(query);
  if (!needle) return false;
  let strong = 0;
  for (const match of matches) {
    const title = normalized(match.title);
    const alternate = match.alttitle ? normalized(match.alttitle) : '';
    if (title === needle || title.startsWith(needle) || alternate === needle || alternate.startsWith(needle)) {
      strong += 1;
      if (strong >= TEXTUAL_SEARCH_LOCAL_MATCH_THRESHOLD) return true;
    }
  }
  return false;
}
