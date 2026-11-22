/**
 * URL-routing helpers for the active collection, archive, and VNDB modes
 * on the `/tags` browser and `/tag/[id]` details.
 *
 * Kept dependency-free so the routing contract can be pinned in unit
 * tests without any React or Next.js runtime.
 *
 * - `/tags?mode=local`  →  browse tags from the local collection;
 *                          clicking a tag goes to `/tag/<id>`.
 * - `/tags?mode=sold`   →  browse themes represented by sold games.
 * - `/tags?mode=vndb`   →  browse every VNDB-indexed tag.
 *
 * The local mode is the default so the page paints instantly from
 * SQLite; the VNDB tab requires a network round-trip and is opt-in.
 */

export type TagsPageMode = 'local' | 'sold' | 'vndb';
export type TagPageTab = TagsPageMode;

export interface TagsPageState {
  mode: TagsPageMode;
}

export interface TagPageState {
  tab: TagPageTab;
  page: number;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Parse /tags URL state. `mode` defaults to `'local'` on missing / unknown input. */
export function parseTagsPageParams(
  raw: Record<string, string | string[] | undefined>,
): TagsPageState {
  const value = pickFirst(raw.mode);
  const mode = value === 'vndb' || value === 'sold' ? value : 'local';
  return { mode };
}

/**
 * Parse /tag/[id] URL state. `tab` defaults to `'local'`; `page` clamps to
 * `[1, +∞)` and falls back to `1` on garbage input.
 */
export function parseTagPageParams(
  raw: Record<string, string | string[] | undefined>,
): TagPageState {
  const value = pickFirst(raw.tab);
  const tab = value === 'vndb' || value === 'sold' ? value : 'local';
  const parsedPage = Number(pickFirst(raw.page) ?? '1');
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  return { tab, page };
}

/**
 * Send a tag chip to its detail page with the matching source selected.
 */
export function tagChipHref(mode: TagsPageMode, tagId: string): string {
  const id = tagId.toLowerCase();
  return tagPageTabHref(id, mode);
}

/** Switch URL for the mode tab strip on `/tags`. */
export function tagsPageHref(mode: TagsPageMode, query = new URLSearchParams()): string {
  const params = new URLSearchParams(query);
  if (mode !== 'local') params.set('mode', mode);
  else params.delete('mode');
  const suffix = params.toString();
  return suffix ? `/tags?${suffix}` : '/tags';
}

/** Switch URL for the source tab strip on `/tag/[id]`. */
export function tagPageTabHref(tagId: string, tab: TagPageTab, page = 1): string {
  const id = tagId.toLowerCase();
  if (tab === 'sold') return `/tag/${encodeURIComponent(id)}?tab=sold`;
  if (tab === 'vndb') {
    const p = Math.max(1, Math.floor(page));
    return `/tag/${encodeURIComponent(id)}?tab=vndb${p > 1 ? `&page=${p}` : ''}`;
  }
  return `/tag/${encodeURIComponent(id)}`;
}

/**
 * Categories used by the tag explorer. The keys mirror VNDB's `cat`
 * field (`cont` / `ero` / `tech`); the `tkey` lookup is the
 * `t.tags.cat_*` i18n key so the renderer doesn't hardcode labels.
 *
 * Ordered "content first" because that's the bucket the operator
 * scans the most when browsing a collection.
 */
export const TAG_CATEGORY_ORDER = ['cont', 'ero', 'tech'] as const;
export type TagCategoryKey = (typeof TAG_CATEGORY_ORDER)[number];

export interface TagTreeBucket<T> {
  category: TagCategoryKey | 'other';
  tags: T[];
}

/**
 * Splits a flat tag list into one bucket per category, in canonical
 * `TAG_CATEGORY_ORDER`. Unknown categories collapse into an `other`
 * bucket so a fresh VNDB enum doesn't drop tags silently.
 *
 * The optional `query` parameter narrows the input by case-insensitive
 * substring against the tag name + aliases — used by the explorer's
 * search box without a server round-trip.
 *
 * Empty buckets are dropped from the result so the renderer can map
 * over the result without an "is this bucket empty?" guard.
 */
export function groupTagsByCategory<
  T extends { name: string; category?: string | null; aliases?: readonly string[] },
>(
  tags: readonly T[],
  query?: string,
): TagTreeBucket<T>[] {
  const needle = query?.trim().toLowerCase() ?? '';
  const buckets = new Map<TagCategoryKey | 'other', T[]>();
  for (const cat of TAG_CATEGORY_ORDER) buckets.set(cat, []);
  buckets.set('other', []);
  for (const tag of tags) {
    if (needle) {
      const hay = [tag.name, ...((tag.aliases ?? []) as string[])].join('\n').toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    const cat = tag.category as TagCategoryKey | undefined;
    if (cat && (TAG_CATEGORY_ORDER as readonly string[]).includes(cat)) {
      buckets.get(cat)!.push(tag);
    } else {
      buckets.get('other')!.push(tag);
    }
  }
  const out: TagTreeBucket<T>[] = [];
  for (const cat of [...TAG_CATEGORY_ORDER, 'other' as const]) {
    const list = buckets.get(cat)!;
    if (list.length === 0) continue;
    out.push({ category: cat, tags: list });
  }
  return out;
}

/**
 * Canonical href for the external VNDB page of a tag. Lives next to
 * the routing helpers so the tag-explorer source-link chip and any
 * other "show me this on VNDB" link share the same shape.
 */
export function vndbTagExternalHref(tagId: string): string {
  return `https://vndb.org/${encodeURIComponent(tagId.toLowerCase())}`;
}
