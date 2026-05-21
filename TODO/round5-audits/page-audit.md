# Page Audit Report — agent a055b433bb1fa08b3

Now I have a comprehensive view of the entire codebase. Let me compile the full audit report:

---

## Full Audit Report: `/Users/loicpirez/Perso/vndb-collection-new/src/app/`

---

### PAGES

---

ISSUE [page-audit] [src/app/page.tsx:36]
Severity: MEDIUM
Page: /
Description: `<Suspense>` has no `fallback` prop. While `loading.tsx` provides the route-segment skeleton, this inline Suspense wrapper renders nothing during hydration of client components (`HomeLayoutEditorTrigger`), creating an invisible loading gap.
Code: `<Suspense>`
Fix: Add `fallback={null}` explicitly or, if children can suspend (they are client components), provide a meaningful skeleton fallback.

---

ISSUE [page-audit] [src/app/page.tsx:18]
Severity: LOW
Page: /
Description: No `generateMetadata()` export. The home page has no `<title>` tag.
Code: No `generateMetadata` function present anywhere in the file.
Fix: Add `export async function generateMetadata()` returning `{ title: t.nav.library }` or similar.

---

ISSUE [page-audit] [src/app/page.tsx:18]
Severity: MEDIUM
Page: /
Description: `getAppSetting('home_section_layout_v1')` is a synchronous SQLite call made with no try/catch inside a React Server Component. If the DB throws (schema change, WAL issue), the entire page crashes and the root `error.tsx` is shown instead of a graceful degraded state.
Code: `const layout = parseHomeSectionLayoutV1(getAppSetting('home_section_layout_v1'));`
Fix: Wrap in try/catch and fall back to `parseHomeSectionLayoutV1(null)` (the default layout) on error.

---

ISSUE [page-audit] [src/app/activity/page.tsx:174-176]
Severity: MEDIUM
Page: /activity
Description: The VN-changes section and system-events section both share the same `page` URL parameter for pagination, but they are independent data sources with independent `hasMore` values. When the user navigates to page 2, both sections advance to offset 100 simultaneously — even if one of the two sections had no data beyond page 1. The two sections cannot be independently paginated.
Code:
```
const vnRowsAll = listRecentActivity(offset + PAGE_SIZE + 1);
const vnRows = vnRowsAll.slice(offset, offset + PAGE_SIZE);
const vnHasMore = vnRowsAll.length > offset + PAGE_SIZE;
// ... later both render <Pagination page={page} ...>
```
Fix: Use separate query parameters (e.g. `page` for VN changes and `syspage` for system events) so each section paginates independently.

---

ISSUE [page-audit] [src/app/activity/page.tsx:161]
Severity: LOW
Page: /activity
Description: The `entity` filter param is a free-text string accepted from `searchParams` with no allowlist validation before passing to `listUserActivity`. While the function uses parameterized SQL (no injection risk), arbitrary strings can be stored in query params and passed to the DB layer unexpectedly.
Code: `const entity = first(sp.entity).trim();`
Fix: Validate `entity` against the known entity types (`['vn', 'producer', 'character', 'staff', 'series', 'tag', 'trait', 'backup', 'collection', ...]`) before passing to `listUserActivity`.

---

ISSUE [page-audit] [src/app/activity/page.tsx]
Severity: LOW
Page: /activity
Description: No `error.tsx` sibling. If `listUserActivity` or `listRecentActivity` throws, the root-level error boundary catches it.
Fix: Add `src/app/activity/error.tsx`.

---

ISSUE [page-audit] [src/app/brand-overlap/page.tsx]
Severity: LOW
Page: /brand-overlap
Description: No `generateMetadata()` export — page has no `<title>` tag.
Fix: Add `export async function generateMetadata()` with a meaningful title.

---

ISSUE [page-audit] [src/app/brand-overlap/page.tsx]
Severity: LOW
Page: /brand-overlap
Description: No `error.tsx` sibling.
Fix: Add `src/app/brand-overlap/error.tsx`.

---

ISSUE [page-audit] [src/app/characters/page.tsx]
Severity: MEDIUM
Page: /characters
Description: Local results hard-limited to 200 with no pagination shown. If the user's collection has more than 200 characters matching the filter, the UI silently truncates without informing the user there are more results. The `/api/collection/characters` endpoint caps at 500 but the page uses 200.
Code: No pagination component rendered for local tab results.
Fix: Either add a pagination control for local results, or render an explicit "showing top 200" notice.

---

ISSUE [page-audit] [src/app/characters/page.tsx]
Severity: LOW
Page: /characters
Description: No `error.tsx` sibling.
Fix: Add `src/app/characters/error.tsx`.

---

ISSUE [page-audit] [src/app/compare/page.tsx]
Severity: LOW
Page: /compare
Description: No `error.tsx` sibling.
Fix: Add `src/app/compare/error.tsx`.

---

ISSUE [page-audit] [src/app/data/page.tsx]
Severity: LOW
Page: /data
Description: No `error.tsx` sibling.
Fix: Add `src/app/data/error.tsx`.

---

ISSUE [page-audit] [src/app/dumped/page.tsx]
Severity: LOW
Page: /dumped
Description: No `error.tsx` sibling.
Fix: Add `src/app/dumped/error.tsx`.

---

ISSUE [page-audit] [src/app/egs/page.tsx]
Severity: LOW
Page: /egs
Description: No `error.tsx` sibling (inline error string is caught but RSC-level throws are not covered).
Fix: Add `src/app/egs/error.tsx`.

---

ISSUE [page-audit] [src/app/labels/page.tsx]
Severity: LOW
Page: /labels
Description: No `generateMetadata()` export — page has no `<title>` tag.
Fix: Add `export async function generateMetadata()` returning e.g. `{ title: t.labels.title }`.

---

ISSUE [page-audit] [src/app/labels/page.tsx:55]
Severity: MEDIUM
Page: /labels
Description: The `ids` query param is parsed as a comma-separated list of IDs with no format validation on each element. Any string (including path-traversal attempts) can be passed as IDs and forwarded to `listCollection({ vnIds: idList })`. While `listCollection` uses parameterized SQL, unvalidated IDs are a hygiene issue.
Code: `const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);`
Fix: Filter each id against `/^(v\d+|egs_\d+)$/i` before passing to `listCollection`.

---

ISSUE [page-audit] [src/app/labels/page.tsx:91]
Severity: MEDIUM
Page: /labels
Description: `dangerouslySetInnerHTML={{ __html: qrs[i] }}` used to embed SVG. The SVG is generated server-side by the `qrcode` package (not user-controlled) and encodes a URL, so the XSS risk is low. However this is worth noting as the only `dangerouslySetInnerHTML` in the page layer, and any future change making the input user-controlled would be a direct XSS vector.
Code: `dangerouslySetInnerHTML={{ __html: qrs[i] }}`
Fix: No immediate action needed, but add a comment documenting why this is safe. Consider using React `<svg>` parsing or a safer SVG rendering approach.

---

ISSUE [page-audit] [src/app/lists/[id]/page.tsx]
Severity: LOW
Page: /lists/[id]
Description: No `error.tsx` sibling.
Fix: Add `src/app/lists/[id]/error.tsx`.

---

ISSUE [page-audit] [src/app/lists/page.tsx]
Severity: LOW
Page: /lists
Description: No `error.tsx` sibling.
Fix: Add `src/app/lists/error.tsx`.

---

ISSUE [page-audit] [src/app/producers/page.tsx]
Severity: LOW
Page: /producers
Description: No `error.tsx` sibling.
Fix: Add `src/app/producers/error.tsx`.

---

ISSUE [page-audit] [src/app/quotes/page.tsx:22]
Severity: LOW
Page: /quotes
Description: `listAllQuotes(q, 300)` hard-limits to 300 results with no pagination. If the user has more than 300 quotes, results are silently truncated.
Code: `const items = listAllQuotes(q, 300);`
Fix: Add pagination or render a "showing top 300" notice when results equal the limit.

---

ISSUE [page-audit] [src/app/quotes/page.tsx]
Severity: LOW
Page: /quotes
Description: No `error.tsx` sibling.
Fix: Add `src/app/quotes/error.tsx`.

---

ISSUE [page-audit] [src/app/recommendations/page.tsx]
Severity: LOW
Page: /recommendations
Description: No `error.tsx` sibling.
Fix: Add `src/app/recommendations/error.tsx`.

---

ISSUE [page-audit] [src/app/release/[id]/page.tsx:53-64]
Severity: HIGH
Page: /release/[id]
Description: DB write side-effect on page render. `upsertReleaseResolutionCache(...)` is called unconditionally on every GET request for this page. This violates the Next.js App Router requirement that RSC render functions must be pure (idempotent, no side effects), since streaming and concurrent rendering can call the function multiple times. It also makes the page non-cacheable by design.
Code: Lines 53-64 call `upsertReleaseResolutionCache(...)` inside the RSC render body.
Fix: Move this side effect into a dedicated API route (e.g. `POST /api/release/[id]/resolve`) called client-side on page load via `useEffect`, or trigger it from the `POST /api/collection/[id]/assets` endpoint which already handles data materialization.

---

ISSUE [page-audit] [src/app/release/[id]/page.tsx]
Severity: MEDIUM
Page: /release/[id]
Description: No `generateMetadata()` export — page has no `<title>` tag. The release detail page shows rich information but is untitled.
Fix: Add `export async function generateMetadata({ params })` that awaits params, fetches the release title, and returns `{ title: ... }`.

---

ISSUE [page-audit] [src/app/search/page.tsx]
Severity: HIGH
Page: /search
Description: Missing `export const dynamic = 'force-dynamic'`. The search page uses `searchParams` (via the client component) and should be dynamically rendered, but without this directive it may be statically cached by Next.js.
Fix: Add `export const dynamic = 'force-dynamic';` at the top of the file.

---

ISSUE [page-audit] [src/app/search/page.tsx]
Severity: MEDIUM
Page: /search
Description: `<Suspense>` wrapper around `<SearchClient />` has no `fallback` prop. The client component will render nothing while hydrating, showing a blank area.
Code: `<Suspense>` (no fallback)
Fix: Add `fallback={<SkeletonCardGrid />}` or a relevant skeleton component.

---

ISSUE [page-audit] [src/app/similar/page.tsx]
Severity: LOW
Page: /similar
Description: Results hard-capped at 24 with no pagination and no user notice.
Fix: Add a notice "showing top 24 results" or implement pagination.

---

ISSUE [page-audit] [src/app/similar/page.tsx]
Severity: LOW
Page: /similar
Description: No `error.tsx` sibling.
Fix: Add `src/app/similar/error.tsx`.

---

ISSUE [page-audit] [src/app/staff/page.tsx]
Severity: LOW
Page: /staff
Description: No `error.tsx` sibling.
Fix: Add `src/app/staff/error.tsx`.

---

ISSUE [page-audit] [src/app/stats/page.tsx:9-13]
Severity: LOW
Page: /stats
Description: `import` statements appear after an `export` statement (lines 9-13 have `generateMetadata`, then lines 13-18 have more imports). This is valid JavaScript but unusual ordering that some linters flag. Not a runtime bug but a code quality concern.
Fix: Reorder to have all imports at the top before any exports.

---

ISSUE [page-audit] [src/app/stats/page.tsx]
Severity: LOW
Page: /stats
Description: No `error.tsx` sibling.
Fix: Add `src/app/stats/error.tsx`.

---

ISSUE [page-audit] [src/app/tag/[id]/page.tsx]
Severity: MEDIUM
Page: /tag/[id]
Description: The "Local" tab (VNs in the user's collection with this tag) has no pagination. If the collection has 500+ VNs tagged with a popular tag, all results are returned in one render with no UI limit shown.
Code: Raw SQL query at lines 58-75 returns all matching rows with no LIMIT clause.
Fix: Add pagination for the local tab or at minimum a `LIMIT 200` with a "showing top N" notice.

---

ISSUE [page-audit] [src/app/tag/[id]/page.tsx]
Severity: LOW
Page: /tag/[id]
Description: No `error.tsx` sibling.
Fix: Add `src/app/tag/[id]/error.tsx`.

---

ISSUE [page-audit] [src/app/tags/page.tsx]
Severity: LOW
Page: /tags
Description: No `error.tsx` sibling.
Fix: Add `src/app/tags/error.tsx`.

---

ISSUE [page-audit] [src/app/top-ranked/page.tsx]
Severity: LOW
Page: /top-ranked
Description: No `error.tsx` sibling (per-tab errors are caught inline, but RSC-level throws are not).
Fix: Add `src/app/top-ranked/error.tsx`.

---

ISSUE [page-audit] [src/app/trait/[id]/page.tsx]
Severity: MEDIUM
Page: /trait/[id]
Description: No `generateMetadata()` export — page has no `<title>` tag. The trait detail page is missing a browser title.
Fix: Add `export async function generateMetadata({ params })` that awaits params and calls `getTrait(id)` for the name.

---

ISSUE [page-audit] [src/app/trait/[id]/page.tsx]
Severity: MEDIUM
Page: /trait/[id]
Description: `Promise.all([getTrait(id), getCharactersForTrait(id)])` — if `getTrait` throws a transient network error (e.g. VNDB timeout), `notFound()` is called, presenting the user with a 404 instead of an error page or retry. Transient failures are permanently misclassified as "not found."
Code:
```ts
const [trait, characters] = await Promise.all([...]);
if (!trait) notFound();
```
Fix: Distinguish between `null` (genuinely not found) and thrown errors (network/upstream failures). Wrap in try/catch; only call `notFound()` when the result is explicitly `null`; let other errors propagate to `error.tsx`.

---

ISSUE [page-audit] [src/app/upcoming/page.tsx]
Severity: LOW
Page: /upcoming
Description: No `error.tsx` sibling.
Fix: Add `src/app/upcoming/error.tsx`.

---

ISSUE [page-audit] [src/app/vn/[id]/page.tsx:818]
Severity: MEDIUM
Page: /vn/[id]
Description: Second `getAppSetting('vn_detail_section_layout_v1')` call inside the IIFE at line 818 — `getAppSetting` is a synchronous DB call. If `getAppSetting` throws (DB connection issue), the entire lower half of the page crashes mid-render with no boundary to catch it. The first call (for `home_section_layout_v1` near line 13) has the same unguarded pattern.
Code: `const layout = parseVnDetailLayoutV1(getAppSetting('vn_detail_section_layout_v1'));`
Fix: Wrap in try/catch falling back to `parseVnDetailLayoutV1(null)`.

---

ISSUE [page-audit] [src/app/vn/[id]/page.tsx]
Severity: MEDIUM
Page: /vn/[id]
Description: Multiple DB write side effects on page render: `materializeReleaseAspectsForVn`, `materializeReleaseMetaForVn`, and a second call to `materializeReleaseAspectsForVn` are called unconditionally inside the RSC render body. These are synchronous writes to the SQLite DB that happen on every page GET.
Fix: Move materializations to the `POST /api/collection/[id]/assets` route or trigger lazily client-side. At minimum, make the RSC calls idempotent and add comments documenting why they are intentionally on the render path.

---

ISSUE [page-audit] [src/app/wishlist/page.tsx]
Severity: LOW
Page: /wishlist
Description: Page delegates entirely to `<WishlistClient />` with no Suspense boundary and no server-side skeleton. On first render there is no loading indicator until the client component mounts and fires its own API calls.
Fix: Wrap `<WishlistClient />` in a `<Suspense>` with a skeleton fallback.

---

ISSUE [page-audit] [src/app/wishlist/page.tsx]
Severity: LOW
Page: /wishlist
Description: No `error.tsx` sibling.
Fix: Add `src/app/wishlist/error.tsx`.

---

ISSUE [page-audit] [src/app/year/page.tsx]
Severity: LOW
Page: /year
Description: No `error.tsx` sibling.
Fix: Add `src/app/year/error.tsx`.

---

ISSUE [page-audit] [src/app/shelf/page.tsx]
Severity: LOW
Page: /shelf
Description: No `error.tsx` sibling.
Fix: Add `src/app/shelf/error.tsx`.

---

ISSUE [page-audit] [src/app/series/page.tsx]
Severity: LOW
Page: /series
Description: No `error.tsx` sibling.
Fix: Add `src/app/series/error.tsx`.

---

ISSUE [page-audit] [src/app/steam/page.tsx]
Severity: MEDIUM
Page: /steam
Description: The entire page is a `'use client'` component file (not a server component). It has no `generateMetadata()`, no `dynamic = 'force-dynamic'`, and no `loading.tsx`/`error.tsx` siblings — all of which are server-side Next.js concepts. While client-only pages don't need these, the page can't produce a useful `<title>` tag, meaning users see no browser title on this page.
Fix: Create a thin `page.tsx` server wrapper with `generateMetadata()` that renders the `SteamSyncPage` client component as a child.

---

ISSUE [page-audit] [src/app/schema/page.tsx]
Severity: LOW
Page: /schema
Description: No `error.tsx` sibling (inline error is caught but RSC throws are not covered at the segment level).
Fix: Add `src/app/schema/error.tsx`.

---

### API ROUTES

---

ISSUE [page-audit] [src/app/api/collection/order/route.ts:14]
Severity: MEDIUM
Page: PATCH /api/collection/order
Description: No auth gate. Any network-reachable client (not just localhost/token) can PATCH the custom ordering of the entire collection. This is a mutation endpoint that should be gated, consistent with other write endpoints.
Code: No `requireLocalhostOrToken` call.
Fix: Add `const deny = requireLocalhostOrToken(req); if (deny) return deny;` at the top of both PATCH and DELETE handlers.

---

ISSUE [page-audit] [src/app/api/collection/order/route.ts:41]
Severity: MEDIUM
Page: DELETE /api/collection/order
Description: Same as above — no auth gate on DELETE.
Fix: Same as above.

---

ISSUE [page-audit] [src/app/api/lists/route.ts:13]
Severity: MEDIUM
Page: POST /api/lists
Description: No auth gate. Any network-reachable client can create lists.
Code: No `requireLocalhostOrToken` call in `POST`.
Fix: Add auth gate if list creation should be restricted to authenticated users.

---

ISSUE [page-audit] [src/app/api/saved-filters/route.ts]
Severity: LOW
Page: POST/DELETE/PATCH /api/saved-filters
Description: No auth gate on any of the mutating handlers. Saved filters are user-specific preferences but are not protected.
Fix: Add `requireLocalhostOrToken` to POST, DELETE, and PATCH handlers.

---

ISSUE [page-audit] [src/app/api/reading-queue/route.ts]
Severity: LOW
Page: POST/DELETE/PATCH /api/reading-queue
Description: No auth gate on mutation handlers. Any network-reachable client can add/remove/reorder the reading queue.
Fix: Add `requireLocalhostOrToken` to POST, DELETE, and PATCH handlers.

---

ISSUE [page-audit] [src/app/api/collection/find/route.ts]
Severity: LOW
Page: GET /api/collection/find
Description: No auth gate. The endpoint searches the local collection by title and returns VN IDs and titles — minor information disclosure to LAN clients.
Fix: Add `requireLocalhostOrToken` since this returns collection data.

---

ISSUE [page-audit] [src/app/api/collection/tags/route.ts]
Severity: LOW
Page: GET /api/collection/tags
Description: No auth gate. Returns all tags in the user's collection (aggregated) — minor information disclosure.
Fix: Add `requireLocalhostOrToken`.

---

ISSUE [page-audit] [src/app/api/collection/characters/route.ts]
Severity: LOW
Page: GET /api/collection/characters
Description: No auth gate. Returns cached character profiles linked to the user's collection.
Fix: Add `requireLocalhostOrToken`.

---

ISSUE [page-audit] [src/app/api/collection/traits/route.ts]
Severity: MEDIUM
Page: GET /api/collection/traits
Description: Iterates over every VN in the collection, reads their cached character profiles from disk (JSON blobs), and aggregates traits in memory — O(collection_size × characters_per_vn × traits_per_character). For a large collection this can be very slow (no database query, all in-process aggregation). No auth gate either.
Code:
```ts
for (const vnId of vnIds) {
  const chars = readCachedCharactersForVn(vnId);
  // ... nested loops over chars and traits
}
```
Fix: Add `requireLocalhostOrToken`. Consider pre-aggregating traits in a materialized DB table instead of computing on every request.

---

ISSUE [page-audit] [src/app/api/vndb/pull-statuses/route.ts]
Severity: MEDIUM
Page: POST /api/vndb/pull-statuses
Description: No auth gate. Any network-reachable client can trigger a full VNDB status pull that overwrites local collection statuses from the VNDB API. This is a destructive sync operation with no protection.
Code: No `requireLocalhostOrToken` call.
Fix: Add `requireLocalhostOrToken` to the POST handler.

---

ISSUE [page-audit] [src/app/api/vn/[id]/route.ts:21-22]
Severity: MEDIUM
Page: GET /api/vn/[id]
Description: No auth gate. The route fetches a VN from VNDB (network call), upserts it to the local DB, and fires three fire-and-forget fan-outs (staff/character/producer downloads). Any LAN-reachable client can trigger unlimited VNDB API calls and DB writes by cycling through VN ids.
Fix: Add `requireLocalhostOrToken` since this triggers expensive network and DB side-effects.

---

ISSUE [page-audit] [src/app/api/vn/[id]/quotes/route.ts]
Severity: LOW
Page: GET /api/vn/[id]/quotes
Description: No auth gate. Returns quote data including character associations from the user's collection.
Fix: Add `requireLocalhostOrToken`.

---

ISSUE [page-audit] [src/app/api/vn/[id]/lists/route.ts]
Severity: LOW
Page: GET /api/vn/[id]/lists
Description: No auth gate. Returns which user lists a VN belongs to.
Fix: Add `requireLocalhostOrToken`.

---

ISSUE [page-audit] [src/app/api/vn/[id]/aspect/route.ts]
Severity: LOW
Page: GET/PATCH/DELETE /api/vn/[id]/aspect
Description: No auth gate on any method. PATCH and DELETE mutate the local DB (aspect override).
Fix: Add `requireLocalhostOrToken` to PATCH and DELETE handlers.

---

ISSUE [page-audit] [src/app/api/shelves/route.ts:22]
Severity: MEDIUM
Page: POST/PATCH /api/shelves
Description: No auth gate on POST (create shelf) or PATCH (reorder shelves). These are write operations.
Fix: Add `requireLocalhostOrToken` to POST and PATCH handlers.

---

ISSUE [page-audit] [src/app/api/shelves/[id]/route.ts]
Severity: MEDIUM
Page: PATCH/DELETE /api/shelves/[id]
Description: No auth gate on PATCH (rename/resize) or DELETE (delete shelf).
Fix: Add `requireLocalhostOrToken` to PATCH and DELETE handlers.

---

ISSUE [page-audit] [src/app/api/shelves/[id]/slots/route.ts]
Severity: MEDIUM
Page: /api/shelves/[id]/slots (not read — high probability of same pattern)
Description: Slot assignment routes likely lack auth gate (pattern consistent with parent shelves routes).
Fix: Read and audit; add `requireLocalhostOrToken` to write handlers.

---

ISSUE [page-audit] [src/app/api/search/route.ts]
Severity: LOW
Page: GET /api/search
Description: No auth gate. Fires a VNDB API search (network call) on every unauthenticated request. Rate-limit budget can be exhausted by any LAN client.
Fix: Add `requireLocalhostOrToken` since this consumes VNDB API quota.

---

ISSUE [page-audit] [src/app/api/activity/route.ts (not read)]
Severity: LOW
Page: GET/POST /api/activity
Description: Not directly read but likely matches pattern of other activity routes. Verify auth gating on write handlers.
Fix: Confirm `requireLocalhostOrToken` on mutation handlers.

---

ISSUE [page-audit] [src/app/api/steam/sync/route.ts:22]
Severity: LOW
Page: GET /api/steam/sync
Description: No auth gate on GET (which fetches from Steam API and exposes suggestion data). POST does have no gate either but performs collection writes.
Fix: Add `requireLocalhostOrToken` to both GET and POST.

---

ISSUE [page-audit] [src/app/api/collection/[id]/activity/route.ts:30]
Severity: LOW
Page: DELETE /api/collection/[id]/activity
Description: `deleteActivity(eid)` — if `eid` belongs to a different VN's activity (not the VN identified by `id` in the route), the delete succeeds anyway. No ownership check that the activity entry belongs to the requested VN.
Code: `deleteActivity(eid);`
Fix: Verify the activity entry's `vn_id` matches `id` before deleting, or scope the SQL query to filter by both `eid` AND `vn_id`.

---

ISSUE [page-audit] [src/app/api/route/[routeId]/route.ts:42]
Severity: LOW
Page: PATCH /api/route/[routeId]
Description: No auth gate. Any LAN client can rename, complete, or update route entries for any VN.
Fix: Add `requireLocalhostOrToken`.

---

ISSUE [page-audit] [src/app/api/collection/export/route.ts (not read)]
Severity: LOW
Page: GET /api/collection/export
Description: This route likely requires auth gating (exports the full collection as JSON). Confirm `requireLocalhostOrToken` is present.

---

ISSUE [page-audit] [src/app/api/vn/[id]/releases/route.ts (not read)]
Severity: LOW
Page: GET /api/vn/[id]/releases
Description: Not read — may lack auth gate and fire VNDB API calls. Verify.

---

ISSUE [page-audit] [src/app/api/vn/[id]/characters/route.ts (not read)]
Severity: LOW
Page: GET /api/vn/[id]/characters
Description: Not read — may lack auth gate. Verify.

---

ISSUE [page-audit] [src/app/api/tags/route.ts (not read)]
Severity: LOW
Page: GET /api/tags
Description: Not read — likely fires VNDB API call. Verify auth gate.

---

### SUMMARY TABLE

| Severity | Count | Categories |
|---|---|---|
| HIGH | 3 | Missing `dynamic`, side-effect on render (release, vn detail), |
| MEDIUM | 18 | Missing metadata, missing pagination notices, auth gate gaps on write routes, transient-error misclassified as 404 |
| LOW | 35+ | Missing error.tsx siblings (16 pages), minor auth gate gaps on read routes, free-text param hygiene |

**Most critical fixes (in priority order):**
1. `src/app/search/page.tsx` — add `export const dynamic = 'force-dynamic'`
2. `src/app/release/[id]/page.tsx` — move `upsertReleaseResolutionCache` out of page render
3. `src/app/vn/[id]/page.tsx` — move `materializeRelease*` calls out of page render
4. `src/app/api/vndb/pull-statuses/route.ts` — add auth gate (destructive sync, unprotected)
5. `src/app/api/vn/[id]/route.ts` — add auth gate (triggers expensive VNDB calls + DB writes)
6. `src/app/api/collection/order/route.ts` — add auth gate (unprotected collection mutation)
7. `src/app/trait/[id]/page.tsx` — distinguish transient VNDB error from genuine 404
8. `src/app/activity/page.tsx` — fix shared pagination state between two independent sections
9. Add `generateMetadata` to: `/`, `/release/[id]`, `/trait/[id]`, `/brand-overlap`, `/labels`, `/steam`
10. Add `error.tsx` to every page route currently missing one (16 routes identified)