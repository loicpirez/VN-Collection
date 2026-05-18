import 'server-only';

/**
 * R5-058 / R5-106 / R5-215 — central registry of "scoped refresh"
 * targets. The old `<RefreshPageButton/>` always called
 * `/api/refresh/global`, which busted every page-level cache on the
 * site (stats, schema, authinfo, ALL release rows, ALL producer
 * rows, every tag/trait, every top-ranked surface). The user
 * complaint: clicking "Refresh" on `/tag/gNNN` or `/upcoming?tab=
 * anticipated` should refresh ONLY that page's relevant cache rows.
 *
 * Each scope maps to a list of `cache_key LIKE` patterns the
 * `/api/refresh/scope` route busts when invoked. Patterns can be
 * templated via `{param}` placeholders that the API resolves from
 * the request body — e.g. `tag-detail` substitutes `{gid}` from
 * `params.gid` so a single click on `/tag/g73` only invalidates
 * the rows for that specific tag.
 *
 * Adding a new scope:
 *   1. Append it here with a stable scope id (kebab-case).
 *   2. Add the matching label keys under `refreshScope.<id>.{title,cta}`
 *      in `src/lib/i18n/dictionaries.ts` (fr, en, ja).
 *   3. Switch the call site from `<RefreshPageButton/>` to
 *      `<RefreshScopeButton scope="..."/>`.
 */
export interface RefreshScope {
  /** Cache-key LIKE patterns to delete. `{param}` placeholders are
   *  substituted from the API body's `params` map. */
  patterns: readonly string[];
  /** Lowercase i18n key under `refreshScope.<id>` for the button
   *  label + tooltip. */
  i18nKey: string;
}

export const REFRESH_SCOPES: Readonly<Record<string, RefreshScope>> = {
  // /tags  — search-result + tag-detail caches (no /vn, no /release).
  'tags-list': {
    patterns: ['% /tag|%', 'tag_full:%'],
    i18nKey: 'tagsList',
  },
  // /traits — search-result + trait-detail caches.
  'traits-list': {
    patterns: ['% /trait|%', 'trait_full:%'],
    i18nKey: 'traitsList',
  },
  // /tag/[id] — single tag's web detail + scraped DAG.
  'tag-detail': {
    patterns: ['tag_full:{gid}', 'scrape_tag:{gid}'],
    i18nKey: 'tagDetail',
  },
  // /upcoming?tab=anticipated — EGS anticipated only.
  'upcoming-anticipated': {
    patterns: ['egs:anticipated:%'],
    i18nKey: 'upcomingAnticipated',
  },
  // /upcoming (collection tab) — collection-scoped upcoming.
  'upcoming-collection': {
    patterns: ['% /release:upcoming|%'],
    i18nKey: 'upcomingCollection',
  },
  // /upcoming (all tab) — full upcoming list.
  'upcoming-all': {
    patterns: ['% /release:upcoming-all|%'],
    i18nKey: 'upcomingAll',
  },
  // /top-ranked — VNDB + EGS top-ranked caches.
  'top-ranked': {
    patterns: ['% /vn:top-ranked:%', 'egs:top-ranked:%'],
    i18nKey: 'topRanked',
  },
  // /schema — VNDB schema dump.
  'schema': {
    patterns: ['% /schema|%'],
    i18nKey: 'schema',
  },
} as const;

export type RefreshScopeId = keyof typeof REFRESH_SCOPES;

/**
 * Resolve a scope id + params into the concrete `cache_key LIKE`
 * patterns. Throws on unknown scope id, unbound `{param}`
 * placeholder, or placeholder values that contain unsafe LIKE
 * metacharacters. The strictness prevents an arbitrary-pattern
 * cache-bust vector via the API body.
 */
export function resolveScopePatterns(
  scopeId: string,
  params: Record<string, string> = {},
): string[] {
  const scope = REFRESH_SCOPES[scopeId];
  if (!scope) throw new Error(`unknown refresh scope: ${scopeId}`);
  return scope.patterns.map((tpl) => {
    return tpl.replace(/\{(\w+)\}/g, (_match, key) => {
      const v = params[key];
      if (typeof v !== 'string' || v.length === 0) {
        throw new Error(`refresh scope ${scopeId}: missing param ${key}`);
      }
      // Reject LIKE metacharacters in params so a caller can't pass
      // `%` / `_` / `|` to widen the bust pattern at will. SQLite's
      // `LIKE` treats both `%` (any sequence) and `_` (single char)
      // as wildcards — the allowlist below excludes both. `|` is
      // our cache-key separator; allowing it would let a caller
      // jump segments.
      if (!/^[A-Za-z0-9-]+$/.test(v)) {
        throw new Error(`refresh scope ${scopeId}: unsafe param value`);
      }
      return v;
    });
  });
}
