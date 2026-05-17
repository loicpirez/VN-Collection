/**
 * Pure helpers for the new `<VnTagsGroupedView>` on the VN detail
 * page. The VN tag chip row used to be a flat top-16 list with
 * implicit `!` markers; this module groups tags by VNDB category
 * (`cont` / `ero` / `tech`), sorts by rating descending, and
 * exposes a "summary" filter that keeps only the top-12 entries.
 *
 * Spoiler filtering follows the VNDB convention:
 *   - `none`     → drop every tag with `spoiler > 0`
 *   - `minor`    → drop only `spoiler === 2`
 *   - `all`      → keep everything (the UI then blurs spoiler-2)
 *
 * Stays free of React imports so the consumer can render it from a
 * server component (the VN detail page is RSC) and unit tests can
 * assert the slicing logic in isolation.
 */

export type TagCategory = 'cont' | 'ero' | 'tech';
export type TagSpoilerMode = 'none' | 'minor' | 'all';
export type TagViewMode = 'summary' | 'all';

export interface RawVnTag {
  id: string;
  name: string;
  rating: number;
  spoiler: number;
  lie?: boolean;
  category?: TagCategory | null;
}

export interface GroupedTags {
  cont: RawVnTag[];
  ero: RawVnTag[];
  tech: RawVnTag[];
}

const SUMMARY_LIMIT = 12;

export function filterAndGroupTags(
  tags: readonly RawVnTag[],
  opts: { spoilerMode: TagSpoilerMode; view: TagViewMode },
): GroupedTags {
  const allowed = (t: RawVnTag): boolean => {
    if (opts.spoilerMode === 'none') return t.spoiler === 0;
    if (opts.spoilerMode === 'minor') return t.spoiler <= 1;
    return true;
  };
  const sorted = [...tags].filter(allowed).sort((a, b) => b.rating - a.rating);
  // Summary mode keeps only the top-N regardless of category. The
  // grouping happens AFTER the slice so a low-rated `cont` tag does
  // not shadow a high-rated `tech` tag.
  const sliced = opts.view === 'summary' ? sorted.slice(0, SUMMARY_LIMIT) : sorted;
  const grouped: GroupedTags = { cont: [], ero: [], tech: [] };
  for (const tag of sliced) {
    const category: TagCategory = tag.category ?? 'cont';
    grouped[category].push(tag);
  }
  return grouped;
}

export interface TagLinks {
  /** Library filter URL — the operator's primary destination. */
  libraryHref: string;
  /** Local tag-page URL with VNDB fallback CTA. Falls back when the
   *  caller does not have a local /tag/[id] route yet. */
  tagPageHref: string;
  /** External VNDB tag page (opens in a new tab). */
  vndbExternal: string;
}

export function tagLinks(tagId: string): TagLinks {
  const id = tagId.toLowerCase();
  return {
    libraryHref: `/?tag=${encodeURIComponent(id)}`,
    tagPageHref: `/tag/${encodeURIComponent(id)}`,
    vndbExternal: `https://vndb.org/${id}`,
  };
}
