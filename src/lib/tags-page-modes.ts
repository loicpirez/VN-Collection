/**
 * URL-routing helpers for the `/tags` (Local / VNDB) tab strip and the
 * `/tag/[id]` (Local / VNDB) per-tag detail tabs.
 *
 * Kept dependency-free so the routing contract can be pinned in unit
 * tests without any React or Next.js runtime.
 *
 * - `/tags?mode=local`  →  browse tags from the local collection;
 *                          clicking a tag goes to `/tag/<id>`.
 * - `/tags?mode=vndb`   →  browse every VNDB-indexed tag; clicking a
 *                          tag goes to `/tag/<id>`.
 *
 * The local mode is the default so the page paints instantly from
 * SQLite; the VNDB tab requires a network round-trip and is opt-in.
 */

export type TagsPageMode = 'local' | 'vndb';
export type TagPageTab = 'local' | 'vndb';

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

export function parseTagsPageParams(
  raw: Record<string, string | string[] | undefined>,
): TagsPageState {
  const mode = pickFirst(raw.mode) === 'vndb' ? 'vndb' : 'local';
  return { mode };
}

export function parseTagPageParams(
  raw: Record<string, string | string[] | undefined>,
): TagPageState {
  const tab = pickFirst(raw.tab) === 'vndb' ? 'vndb' : 'local';
  const parsedPage = Number(pickFirst(raw.page) ?? '1');
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  return { tab, page };
}

/**
 * Where a tag chip on /tags should send the operator. ALWAYS `/tag/<id>`
 * regardless of mode — the per-tag detail page is the canonical
 * destination because it carries Local + VNDB sub-tabs and richer
 * context (description, parent / child tags, sample VNs). The
 * Library tag filtering remains accessible from the detail page itself
 * but is no longer the primary chip click target.
 *
 * The `mode` argument is kept on the signature for back-compat with
 * call sites that still thread it through; the resulting URL is the
 * same in both modes, with `?tab=vndb` appended when the user is
 * already in VNDB browse mode so the detail page lands on the
 * matching sub-tab.
 */
export function tagChipHref(mode: TagsPageMode, tagId: string): string {
  const id = tagId.toLowerCase();
  if (mode === 'vndb') return `/tag/${encodeURIComponent(id)}?tab=vndb`;
  return `/tag/${encodeURIComponent(id)}`;
}

/** Switch URL for the mode tab strip on `/tags`. */
export function tagsPageHref(mode: TagsPageMode): string {
  return mode === 'vndb' ? '/tags?mode=vndb' : '/tags';
}

/** Switch URL for the Local/VNDB tab strip on `/tag/[id]`. */
export function tagPageTabHref(tagId: string, tab: TagPageTab, page = 1): string {
  const id = tagId.toLowerCase();
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
