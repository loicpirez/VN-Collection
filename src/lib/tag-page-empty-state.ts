/**
 * Pure helper for the `/tag/[id]` empty-state CTA. Centralised so the
 * page and its unit test agree on the exact set of fallback links.
 */
export interface TagPageEmptyState {
  isEmpty: boolean;
  /** Canonical VNDB tag page (always rendered, even when non-empty). */
  vndbExternal: string;
  /** Library filter URL for the same tag; used as the page's primary
   *  "browse" link when there's at least one match. */
  fallbackLibrary: string;
}

export function tagPageEmptyState({
  tagId,
  collectionCount,
}: {
  tagId: string;
  collectionCount: number;
}): TagPageEmptyState {
  const id = tagId.toLowerCase();
  return {
    isEmpty: collectionCount === 0,
    vndbExternal: `https://vndb.org/${id}`,
    fallbackLibrary: `/?tag=${encodeURIComponent(id)}`,
  };
}
