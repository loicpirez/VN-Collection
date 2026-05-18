/**
 * Pure helpers for the new `<VnTagsGroupedView>` on the VN detail
 * page. The VN tag chip row used to be a flat top-16 list with
 * implicit `!` markers; this module groups tags by VNDB category
 * (`cont` / `ero` / `tech`), sorts by rating descending, and
 * exposes a "summary" filter that keeps only the top-12 entries.
 *
 * Spoiler handling does NOT filter tags — VNDB hides spoiler chips
 * behind a click-to-reveal affordance and so do we. The grouped view
 * therefore keeps every tag in the result regardless of `spoilerMode`
 * and lets `<SpoilerChip>` mask the chip until the operator hovers,
 * focuses, or clicks. `spoilerModeToLevel` maps the local toggle to
 * the per-section level threshold passed down to each chip.
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

/**
 * Map the local `<VnTagsGroupedView>` `TagSpoilerMode` toggle to the
 * `0|1|2` threshold that `<SpoilerChip>` reads to decide whether a
 * tag is gated. `none → 0` keeps level-1 and level-2 chips masked,
 * `minor → 1` keeps only level-2 masked, `all → 2` reveals everything.
 */
export function spoilerModeToLevel(mode: TagSpoilerMode): 0 | 1 | 2 {
  if (mode === 'all') return 2;
  if (mode === 'minor') return 1;
  return 0;
}

export function filterAndGroupTags(
  tags: readonly RawVnTag[],
  opts: { view: TagViewMode },
): GroupedTags {
  // No spoiler filtering — every tag survives so the chip can mask
  // it instead of dropping it. The previous filter implementation
  // hid level-1/2 chips entirely so the operator could not even
  // hover/click to peek; the new contract delegates gating to
  // `<SpoilerChip>` (per-chip hover/focus/click reveal).
  const sorted = [...tags].sort((a, b) => b.rating - a.rating);
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
