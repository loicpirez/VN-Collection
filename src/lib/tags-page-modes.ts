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
  return { tab };
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
export function tagPageTabHref(tagId: string, tab: TagPageTab): string {
  const id = tagId.toLowerCase();
  if (tab === 'vndb') return `/tag/${encodeURIComponent(id)}?tab=vndb`;
  return `/tag/${encodeURIComponent(id)}`;
}
