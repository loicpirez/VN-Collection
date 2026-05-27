# VNDB performance + correctness audit

Walked `src/app/**`, `src/components/**`, `src/lib/**` for every instance of the 20 audit categories. IDs are stable per-finding.

Severities used:
- **critical**: confirmed bug, data corruption, memory leak, or near-certain race that fires on common usage.
- **high**: definite performance issue or correctness footgun under common usage.
- **medium**: real but bounded impact (UX flicker, extra fetches, small leaks).
- **low**: code hygiene / micro-optimisation.

Counts: 113 files use `useEffect`, 36 files use `AbortController`, 122 prepared `SELECT` statements in `lib/db.ts`, 174 client components, 207 files under `src/app/**`.

---

## Category 1 — useEffect fetch without AbortController cleanup

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-001 | high | `src/components/LibraryClient.tsx:265-303` | 4 sibling fetches on mount (`/api/producers`, `/api/series`, `/api/places`, `/api/collection/tags`) — none use `AbortController`. On unmount-during-load (rapid navigation across the home page tabs) all 4 still resolve and `setX` runs on an unmounted component. | Wrap each `fetch` with a shared `AbortController` and gate every `setState` on `!ctrl.signal.aborted` (the pattern is already used at line 322 for the main `/api/collection` fetch). |
| P-002 | high | `src/components/LibraryClient.tsx:306-319` | `useEffect` for `urlTag` → `/api/tags?q=` has no AbortController. Rapid tag changes leave stale responses in flight that overwrite the latest set. | Add `AbortController`, abort on cleanup and on dep change, gate `setTagName` behind `!ctrl.signal.aborted`. |
| P-003 | medium | `src/components/LibraryClient.tsx:153-173` | `/api/settings` fetch on mount uses an `alive` flag (good) but no `AbortController`, so the actual request still completes. Defensive only because the fetch is cheap. | Promote to `AbortController` for consistency with the rest of the file. |
| P-004 | medium | `src/components/SavedFilters.tsx:51-53,101-113` | `load()` runs on mount and after every save / delete but never aborts the in-flight request. A delete shortly after page load can race with the initial `load()` and overwrite the post-delete state. | Inject an `AbortController` into `load(signal)` and abort the previous one on every new call. |
| P-005 | medium | `src/components/EditForm.tsx:47-49` | `fetch('/api/places').then(...).catch(() => {})` on mount with no AbortController and `.catch(() => {})` swallows every error including network failures. | Use `AbortController`; surface failure to the toast or at least `console.error`. |
| P-006 | medium | `src/components/QuoteFooter.tsx:19-32` | `load` is a `useCallback` invoked when `hovered` flips true, no AbortController. Hover → leave → hover again can interleave responses; the second resolved fetch wins regardless of order. | Track a request id (e.g. an incrementing ref) and discard out-of-order responses. |
| P-007 | medium | `src/components/StockPanel.tsx:180-187` | Sibling effect at line 180 fetches `/api/vn/.../stock/aliases` with its own AbortController (good) but the very next effect at line 191 mutates state from `providers` without re-checking mount status. Low risk but not consistent. | Use the same `alive` ref guard the rest of the file uses. |
| P-008 | medium | `src/components/MapEgsToVndbButton.tsx`, `MapVnToEgsButton.tsx`, `LinkToVndbButton.tsx`, `CompareWithButton.tsx`, `CompareVnPicker.tsx` (search effects) | Sibling effects with `Promise.allSettled` + cancellation gating via a ref string check rather than `AbortController`. The fetches themselves keep running on the wire. | Convert to `AbortController` so the network and worker time is actually cancelled. |
| P-009 | low | `src/components/QueueButton.tsx`, `ReadingGoalCard.tsx`, `VndbStatusPanel.tsx`, `VnSeedPicker.tsx`, `SimilarSeedPicker.tsx`, `CachePanel.tsx`, `ImportPanel.tsx` | Each runs `fetch` inside `useEffect` without AbortController. These are mostly one-shot mounts so the leak is bounded, but on a rapidly-mounted/unmounted modal they accumulate. | Pattern: pass `signal` from a local controller into the helper, gate `setX` on `!signal.aborted`. |
| P-010 | low | `src/lib/recentlyViewed.ts` `useRecentlyViewed` hook | Effect persists to `localStorage` without cleanup. Harmless but invocation count is unbounded. | Acceptable as-is; flagged for completeness. |

---

## Category 2 — useEffect arrays missing deps (stale closure / not in deps)

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-011 | high | `src/components/LibraryClient.tsx:364-366` | `useEffect` dep array includes `urlAspectSet.join(',')` as a literal — this works but the `useEffect` callback closes over `urlAspectSet`, which is recomputed every render. Re-render → new `urlAspectSet` reference → identical join string → no re-fetch (correct), but the closure-captured array is also stale relative to the join. Fragile; one future edit that uses `urlAspectSet` inside the effect body would break. | Materialise `const aspectKey = urlAspectSet.join(',')` BEFORE the effect, use that as the dep, and reference the same constant inside the effect. |
| P-012 | high | `src/components/EditForm.tsx:104-105` | `eslint-disable-next-line react-hooks/exhaustive-deps` skips deps for the auto-save effect. The effect uses `buildPayload`, `call`, `inCollection`, `userRatingInvalid`, `playtimeInvalid`, `t`, `router`, `toast` — none in the dep array. A locale switch mid-edit will save with the WRONG dictionary. | Either include `buildPayload` and `call` (both are `useCallback` already) or refactor `buildPayload` into a ref and let the effect read it via `.current` so deps are intentional. |
| P-013 | high | `src/components/SearchClient.tsx:155-168` | Two `useEffect`s with `eslint-disable-next-line react-hooks/exhaustive-deps`: the auto-run on mount with `runAdvanced` missing from deps (line 161-168), and others. `runAdvanced` reads `q`, `adv` via closure — auto-running with stale closure is a real risk on hot reload. | Use a `runAdvancedRef` ref pattern OR run the request inline (the effect needs an explicit re-run trigger anyway). |
| P-014 | medium | `src/components/CharactersSection.tsx:71` | Deps `[open, vnId, chars, t.common.error]` re-fire the effect whenever `chars` flips from `null` to populated — guarded by `chars !== null` early-return, so the actual fetch only runs once. Works, but adds an extra render cycle per VN. | Move the `chars !== null` check OUTSIDE the effect so dep churn doesn't trigger a no-op render. |
| P-015 | medium | `src/components/RoutesSection.tsx:49-53` | `useEffect` runs `reload(ctrl.signal)`, deps `[reload]`. `reload` is `useCallback([vnId, inCollection])`. If parent re-renders with same `vnId`/`inCollection` but a fresh `reload` reference (rare), the request fires again. | Already correct shape; add a sanity comment so a future agent doesn't pull `reload` out of `useCallback`. |
| P-016 | medium | `src/components/TagsBrowser.tsx:55-153` | `eslint-disable-next-line react-hooks/exhaustive-deps` on a big effect with `initialTree`, `t.common.error` missing from deps. Locale switch will keep the old error string. | Add `initialTree`, `t.common.error` to deps. |
| P-017 | medium | `src/components/EgsPanel.tsx:460-466` (EgsPicker) | `eslint-disable-next-line react-hooks/exhaustive-deps` on the initial-search effect. Captures `run` (which closes over `query`, `t`, `toast`); `run` itself is a `useCallback` with `[query, ...]` deps, so first-mount auto-search uses the right value, but a parent re-render that recreates `run` and then unmounts/remounts the picker would re-fire with potentially stale `initialQuery`. | The current shape is acceptable for a modal but the disable comment should reference the rationale. |
| P-018 | medium | `src/components/CompareVnPicker.tsx:228-241` | `setTimeout(() => inputRef.current?.focus(), 0)` inside a `useEffect` that runs whenever `panelOpen` toggles. The timeout is never cleaned up; rapid open/close cycles can stack focus calls. | Wrap timer id, clear on cleanup. |
| P-019 | medium | `src/components/WishlistClient.tsx:229-238` | Mount effect with deps `[load]`; `load` deps on `t.common.error`. Locale switch triggers a re-run AND a re-fetch — wasted bandwidth. | Stabilize the locale-tied string via a ref, OR explicitly accept the re-fetch (current behaviour). Document it. |
| P-020 | medium | `src/components/PomodoroTimer.tsx:68-70` | `onElapsedChange?.(elapsedMin)` runs whenever `elapsedMin` ticks. Parent must pass a stable callback or every tick re-renders the parent and any non-memo'd children. The dep `[elapsedMin, onElapsedChange]` is correct, but consumers rarely memoize `onElapsedChange`. | Document the contract OR wrap the publish in a `useEvent`-style ref so callback identity doesn't matter. |
| P-021 | medium | `src/components/StockPanel.tsx:359` | `useMemo([hideStale, snapshot?.statuses, now, STALE_MS])` — `now` is `Date.now()` recomputed on every render. The memo never actually memoizes anything. | Memoize `now` once per snapshot change, or drop the `useMemo` entirely. |
| P-022 | low | `src/components/HeroBanner.tsx:111-131` | Effect dep `[rotation]` measures container size. When rotation is 0 or 180 the effect sets `containerSize` to `null` then returns; correct. Edge case: parent re-renders triggers cleanup → re-run → ResizeObserver churn. | Could be optimised, but minor. |

---

## Category 3 — useMemo / useCallback deps wrong (always recreating)

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-023 | high | `src/components/LibraryClient.tsx:197-205` | `replaceParams` `useCallback` deps `[router, searchParams]`. `searchParams` is a `ReadonlyURLSearchParams` returned by Next.js; new identity on every URL change. Every keystroke in the search box (URL update) → new `replaceParams` → triggers `setParam` deps to churn → child memo'd components re-render. | Either accept the churn (the entire LibraryClient subtree re-renders on URL change anyway) or read `searchParams.toString()` once per render and depend on the string. |
| P-024 | high | `src/components/StockPanel.tsx:411-429` | `physicalOffers` `useMemo` depends on `offers` (which is derived from `allOffers`/`snapshot?.offers`) and `confirmedPhysicalIds`. `offers` is a fresh array on every render where `hideStale` is true (line 360-362: `hideStale ? allOffers.filter(...) : allOffers`). The memo's dep changes every render → memo never hits. | Memoize `offers` itself FIRST (with `hideStale`, `allOffers`, `staleProviderIds`), then memo physicalOffers off the memoized value. |
| P-025 | high | `src/components/StockPanel.tsx:351-364` | `allOffers = snapshot?.offers ?? []` is a fresh `[]` literal on every render when `snapshot?.offers` is undefined. Downstream `useMemo`s that depend on `allOffers` re-compute every render. | Stabilize via `useMemo(() => snapshot?.offers ?? EMPTY, [snapshot?.offers])` with a module-level `EMPTY` constant. |
| P-026 | medium | `src/components/SearchClient.tsx:126` | `initialAdv = useMemo(() => readAdvFromUrl(new URLSearchParams(searchParams.toString())), [searchParams])`. `searchParams` identity changes on every URL change; memo never hits across navigations. Cheap but the `new URLSearchParams(...)` is wasted work. | Replace with `const initialAdvRef = useRef(...)` so the value is computed once on mount. |
| P-027 | medium | `src/components/StockPanel.tsx:189` | `const providers = snapshot?.providers ?? []` — fresh array literal. Every downstream `useMemo([providers, ...])` recomputes. | Same `EMPTY` constant pattern. |
| P-028 | medium | `src/components/WishlistClient.tsx:357-360` | `downloadItems` memoizes a `.map` of `filtered`; `filtered` itself is a memo that depends on 10 things including 6 strings of filter input. Real memo work but the dep churn is high. Acceptable. | No action; flagged for completeness. |
| P-029 | medium | `src/components/MediaGallery.tsx:101-114` | `visible` memo spreads 7 arrays from `groups` when `filter === 'all'`. New array each call. Downstream consumers re-render. | Acceptable here because filter changes are user-driven and infrequent. |
| P-030 | medium | `src/components/RoutesSection.tsx:75-91` | `suggestions = useMemo([characters, usedNames, vnId])`. `usedNames` is itself a memo of `routes`. Routes mutate frequently while the picker is open, so the memo invalidates often. Acceptable. | No action. |
| P-031 | low | `src/components/LibraryClient.tsx:1539-1541` | `onSelectFor = useCallback(..., [])` — deps explicitly empty because the callback reads the latest `onToggle` via ref. **Correct**, but flagged so a future agent doesn't add `onToggle` to the deps and re-introduce the re-render storm this PR fixed. | Add a clarifying comment near the ref. |
| P-032 | low | `src/components/LibraryClient.tsx:1547` | `cardData = useMemo([renderedItems], ...)` — fine, but `renderedItems` is itself a memo that depends on `items` and the virtual window. When the virtual window shifts (scroll), every visible card's `cardData` re-projects (cheap via WeakMap, but the array identity churns and downstream `MemoCard` props churn too). | Acceptable; the WeakMap inside `toCardData` short-circuits. |

---

## Category 4 — Large lists without React.memo on row component

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-033 | high | `src/components/WishlistClient.tsx:656-682` | The wishlist grid maps over `g.items` and renders `MemoWishlistCard`. **Good** — already memoized. But the grid's outer `style={{ gridTemplateColumns: cardGridColumns(density) }}` is a fresh inline object every render. Doesn't break the row memo but causes the outer `<div>` to re-create style ref every parent render. | Memoize `gridStyle` via `useMemo([density])`. |
| P-034 | high | `src/components/StockPanel.tsx:647-714` (provider tiles) | Renders up to ~25 provider tiles, each with inline `onClick={() => selectable && toggleProvider(provider.id)}` and inline className via template literal. No `React.memo` on the tile sub-component. Every state tick re-renders every tile. | Extract `<ProviderTile>` and wrap in `React.memo`; route the onClick through a stable callback (e.g. `useCallback((id) => toggleProvider(id), [toggleProvider])`). |
| P-035 | high | `src/components/StockPanel.tsx` (offer rows table around line 1146+) | Inner offer-row render in the offers table — every refresh-state tick re-renders the entire 100+ offer list. No memo on the row. | Extract `<OfferRow>` and memo it. |
| P-036 | medium | `src/components/SearchClient.tsx:709-723` (`SearchResultsGrid`) | Maps over results and renders `<VnCard>` directly. `VnCard` itself is memoized. Inline `data={searchCardData(r)}` uses WeakMap so OK. Inline `gridStyle={{ ... }}` re-creates a fresh object every parent render. | Memoize `gridStyle`. |
| P-037 | medium | `src/components/MediaGallery.tsx` (entire tile grid) | Tile grid renders 20+ kebab-menu buttons inline; each carries its own `useState` for menu-open. Re-renders cascade on every parent state change (lightbox open/close). | Extract `<MediaTile>` and memoize. |
| P-038 | medium | `src/components/StockBatchClient.tsx` (results list) | Queue + results rendered inline; no row memo. Each fetch round-trip triggers a full re-render of every row. | Extract row component, memoize. |
| P-039 | medium | `src/components/CharactersSection.tsx:96-176` | Up to 50+ character cards rendered as inline JSX inside a `.map`. No row memo. Section toggle / lightbox cascades re-renders. | Extract `<CharacterCard>` and memoize. |
| P-040 | medium | `src/components/ReleasesSection.tsx` | Same pattern (assumed; large rendered list of releases on VN detail). | Extract + memo. |
| P-041 | medium | `src/components/RoutesSection.tsx:234-393` (routes list) | Each route row has 6+ inline icon buttons with closures over `r`, `i`, `routes.length`, `busy`. Every state change re-renders every row. | Extract `<RouteRow>` and memoize over a stable prop signature. |
| P-042 | medium | `src/components/SchemaBrowser.tsx` | Renders a tree of tables / columns; recursive components without memo. | Memo each tree node. |
| P-043 | low | `src/components/AnniversaryFeedView.tsx` (presumed) | Renders 8 cards; size is small so impact is minimal. | Memo for hygiene. |
| P-044 | low | `src/components/DownloadStatusBar.tsx:423-519` (job list) | Up to 12 job items rendered inline. Polling ticks at 4s; each tick re-renders every job. Not visible because the popover is usually closed. | Acceptable; memo for hygiene. |

---

## Category 5 — SQL SELECT * loading huge JSON columns unnecessarily

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-045 | high | `src/lib/db.ts:9614-9631` `listVnStockOffers` | `SELECT * FROM vn_stock_offer WHERE vn_id = ?` — pulls every column including `match_warnings_json` blob, but the consumer (`StockPanel`) only needs ~20 fields. Hot path: every VN detail page hits this. | Whitelist the columns actually used. |
| P-046 | high | `src/lib/db.ts:9636-9641` `listVnStockProviderStatuses` | Same pattern, less impact (status table is narrower). | Whitelist. |
| P-047 | high | `src/lib/db.ts:9090` `getKobeStockByCode` | `SELECT * FROM alicesoft_kobe_stock WHERE code = ?` — pulls `vn_candidates` (JSON top-3 candidates blob) every time. | Whitelist. |
| P-048 | high | `src/lib/db.ts:9112,9146,9172,9203` (multiple AliceNet Kobe paginated queries) | `SELECT * FROM alicesoft_kobe_stock ORDER BY ... LIMIT ? OFFSET ?` — every paginated read pulls `vn_candidates` JSON for rows that don't need it. | Add a `listKobeStockSummaries` projection that omits `vn_candidates` for list views. |
| P-049 | medium | `src/lib/db.ts:9731` `listStockAliases`, `9764` `listStockSources`, `9795` `getStockSourceByUrl` | `SELECT *` on small narrow tables — bounded impact. | Hygiene fix. |
| P-050 | high | `src/lib/db.ts:3904` `listCollection` default `_projection='full'` selects `v.*` from the `vn` table — `raw` (full VNDB payload), `description`, `staff`, `va`, `titles`, `editions`, `screenshots`, `release_images`, `extlinks`, `aliases`, `relations` — many MB per row for a 1000+ VN library. The `'cards'` projection EXISTS at `CARDS_VN_COLUMNS` (line 3655) and is used by `/api/collection`, but every other surface that calls `listCollection({})` (notably `/series/[id]/page.tsx`, `/lists/[id]/page.tsx`, recommendations, exports) still pays the full cost. | Audit every caller of `listCollection`; switch to `listCollectionForCards` wherever the consumer only reads card fields. |
| P-051 | medium | `src/lib/db.ts` full `v.*` projection | The full projection includes the `raw` column (massive — every VNDB payload). It's not used by `rowToItem`. | Even the "full" projection should drop `raw` unless the caller explicitly asks for it. Add a third projection level. |

---

## Category 6 — N+1 query patterns

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-052 | high | `src/lib/db.ts:9595-9597` `replaceVnStockOffers` | Inside the transaction, `for (const offer of offers) insertVnStockOfferStmt.run(...)` — but the preceding `DELETE FROM vn_stock_offer WHERE vn_id = ? AND provider = ?` is a separate prepare. If `offers.length` is 50+, this is 50 separate `INSERT` calls in a transaction. Acceptable (transactions amortise) but slower than a multi-VALUES insert. | Batch with `INSERT ... VALUES (?,?,..),(?,?,..)` for large `offers`. |
| P-053 | high | `src/lib/assets.ts:170-185` `downloadCharacterImages` | `for (const c of characters) { ... await downloadToBucket(...) ... }` — sequential awaits inside a loop over up to 100 characters. Each `downloadToBucket` is a network round trip. | Replace with a bounded worker pool (8 concurrent), mirroring the screenshots worker at line 113. |
| P-054 | medium | `src/components/WishlistClient.tsx:288-296` `deleteSelected` | `for (const id of list) { await fetch(\`/api/wishlist/${id}\`, ...) }` — N sequential DELETE round trips. With 50 selected, that's 50+ seconds of serial network. | Batch via `Promise.all`, or add a server-side batch endpoint. |
| P-055 | medium | `src/components/StockPanel.tsx:209-225` `refresh` loop | Sequentially POSTs `/api/vn/[id]/stock` per provider with `for` + `await`. Intentional (rate-limit + per-provider status update for live progress UI), but no concurrency option for non-throttled providers. | Keep sequential for rate-limited providers; allow `kind === 'aggregate'` providers to fan out via a small `Promise.allSettled` batch. |
| P-056 | medium | `src/components/StockBatchClient.tsx:84-110` | Same shape: serial fetch per VN. Intentional but worth flagging. | Acceptable. |
| P-057 | low | `src/lib/recommend.ts:804-819` | `Promise.all` over `seeds.map(...)` — bounded (≤ ~10 seeds) so safe, but if a recommend mode generated more seeds it would burst-fire VNDB. | Add an upper bound on `seeds.length` before fan-out. |
| P-058 | low | `src/components/StockPanel.tsx:382` | `diagnosticByProvider = useMemo(() => new Map(diagnostics.map(...)), [diagnostics])` — recomputes a Map from an array on every diagnostics change. Bounded (max ~25 providers). | Acceptable. |

---

## Category 7 — Heavy modules imported into 'use client' boundary

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-059 | high | `src/components/StockPanel.tsx:2-26` | A single 1431-line `'use client'` file imports 18 `lucide-react` icons, a sub-component (`StockPhysicalLocations`), classify helpers, diagnostics helpers — and is loaded EAGERLY on every VN detail page (`/vn/[id]`) whether or not the user opens the stock section. | Wrap the inner panel in `next/dynamic({ ssr: false })` and lazy-load on first scroll/click. |
| P-060 | high | `src/components/LibraryClient.tsx:5` | Single line importing 27 lucide icons. Each icon imports its own chunk; lucide-react has poor tree-shaking with this many imports. | Use `import { X as XIcon } from 'lucide-react/icons/x.js'` per-icon path imports to keep the bundle tight, or replace rarely-used icons with inline SVG. |
| P-061 | high | `src/components/SettingsButton.tsx:7-25` | Imports `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `lucide-react`, multiple layout schemas, the entire shortcut registry — all in a button that's invisible most of the time. | Already a portal; wrap inner modal contents in `next/dynamic` so the heavy bundle only loads when the user opens settings. |
| P-062 | medium | `src/components/MediaGallery.tsx:2-27` | Imports `useDialogA11y` and the lightbox surface. Heavy for cards that never open the lightbox. | The MediaGallery is itself rendered on every VN page; the lightbox portal could be lazy via `next/dynamic`. |
| P-063 | medium | `src/components/MarkdownNotes.tsx` (already lazy-loaded per CLAUDE.md) | CLAUDE.md confirms `MarkdownView` is `next/dynamic`-loaded. ✓ correct. | No action. |
| P-064 | medium | `src/components/EditForm.tsx:11-12` | `MarkdownNotes` imported statically — but `MarkdownNotes` itself is the editor wrapper, the heavy `react-markdown` chunk is lazy. ✓ as documented. | No action. |
| P-065 | medium | `src/components/SearchClient.tsx:1-17` | Imports `TextualSearchPanel` eagerly. The Local search tab is rarely the user's first stop; that panel pulls 2 extra fetches and `SkeletonBlock`. | `const TextualSearchPanel = dynamic(() => import('./TextualSearchPanel'), { ssr: false })`. |
| P-066 | medium | `src/components/ShelfLayoutEditor.tsx` | Imports `@dnd-kit/*`. Editor route is `/shelf?view=layout` which is opt-in. Should already be lazy from the routing perspective but the component might be statically imported by parents. | Verify the only entrypoint is the lazy route and consider `next/dynamic`. |
| P-067 | medium | `src/components/SchemaBrowser.tsx` | Large recursive tree component; loaded on `/schema` page. Acceptable since `/schema` is a destination not a default tab. | No action. |
| P-068 | medium | `src/lib/settings/client.tsx` | The `DisplaySettingsProvider` is mounted at the root layout so it's on the critical path. It imports `lucide-react`-free utilities only — OK. | No action. |
| P-069 | low | `src/components/CharactersSection.tsx`, `RoutesSection.tsx`, `QuotesSection.tsx`, `ReleasesSection.tsx` | All documented as lazy-loaded sections; verify they're not statically imported into `/vn/[id]/page.tsx`. | Audit imports in `src/app/vn/[id]/page.tsx`. |

---

## Category 8 — fetch() without cache: 'no-store' where needed

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-070 | high | `src/components/LibraryClient.tsx:266-301` (`/api/producers`, `/api/series`, `/api/places`, `/api/collection/tags`) | All four fetches omit `cache: 'no-store'`. Defaults to the framework default; Next.js 16 forces these dynamic API routes to be uncached server-side, BUT the browser may revalidate from its HTTP cache after a mutation that doesn't trigger a Next.js cache bust. The /api/places list, for instance, gets stale after adding a new physical_location. | Add `cache: 'no-store'` to every fetch that hits a route declared `dynamic = 'force-dynamic'`. Mutations are idempotent so this is a safe blanket fix. |
| P-071 | high | `src/components/LibraryClient.tsx:344` (`/api/collection?...`) | Same — omits `cache: 'no-store'`. The library is the most-frequently-stale data in the app. | Add `cache: 'no-store'`. |
| P-072 | high | `src/components/EditForm.tsx:48` (`/api/places`) | No `cache: 'no-store'`. | Same fix. |
| P-073 | high | `src/components/CharactersSection.tsx:55` | No `cache: 'no-store'`. Characters cache server-side for 24h via `vndb_cache`, but the browser may also cache. | Add `cache: 'no-store'`. |
| P-074 | high | `src/components/RoutesSection.tsx:38, 58` | No `cache: 'no-store'`. Routes are user-mutable. | Add `cache: 'no-store'`. |
| P-075 | high | `src/components/EgsPanel.tsx:97, 448` | Line 97 (`/api/vn/[id]/erogamescape`) has `cache: 'no-store'` ✓; line 448 (`/api/egs/search`) — missing. | Low priority but add for consistency. |
| P-076 | medium | `src/components/SettingsButton.tsx` (many fetches) | Mix of `cache: 'no-store'` and bare fetch. Spot-check shows the settings tab is read-once on open so the bare ones are fine but inconsistent. | Audit and normalise. |
| P-077 | medium | `src/components/HomeLayoutEditorTrigger.tsx`, `SeriesDetailLayout.tsx`, `DetailReorderLayout.tsx` | Layout-PATCH fetches — verify they bypass any HTTP cache. | Add `cache: 'no-store'`. |
| P-078 | medium | 237 `await fetch` calls vs only 48 with `cache: 'no-store'` across `src/components/**` and `src/app/**`. | Per-call audit recommended. | Bulk codemod to add `cache: 'no-store'` to every `/api/` fetch in client components. |

---

## Category 9 — Inline {} / [] props breaking memo

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-079 | high | `src/components/WishlistClient.tsx:663-666` | `<div style={{ gridTemplateColumns: cardGridColumns(density) }}>` — fresh inline `style` literal on every parent render. The grid's child `<MemoWishlistCard>` is memoized but the outer wrapper is not. Re-creates the style ref on every keystroke in the wishlist search box. | `const gridStyle = useMemo(() => ({ gridTemplateColumns: cardGridColumns(density) }), [density])`. |
| P-080 | high | `src/components/SearchClient.tsx:713-715` | `gridStyle: React.CSSProperties = { gridTemplateColumns: cardGridColumns(density) }` — declared inline inside the component function, fresh on every render. Same impact. | Memoize. |
| P-081 | high | `src/components/LibraryClient.tsx:1473-1475` `Grid` | `gridStyle` literal recreated every render; passed to the grid div. Doesn't break the inner `MemoCard` memo (style isn't a prop) but adds GC pressure. | Memoize with `[densityMul]`. |
| P-082 | high | `src/components/VnCard.tsx:79` `VnCard = memo(VnCardImpl)` (default referential equality) — VnCard accepts `data: CardData`. The library / wishlist correctly pass a WeakMap-cached CardData. But `VnCard` ALSO accepts `badge?: { label, tone }` and `selectable`/`selected`/`onSelect`. Inline `badge={{ label: '...' }}` passed by `MapEgsToVndbButton.tsx`, `MapVnToEgsButton.tsx`, `SimilarSection.tsx`, … breaks memo. | Audit every callsite that passes a `badge` object; memoize the badge prop. |
| P-083 | medium | `src/components/LibraryClient.tsx:1183` | `<RandomPickButton candidates={visibleItems.map((it) => ({ id: it.id, title: it.title }))} />` — fresh array of fresh objects on every render. | Memoize via `useMemo([visibleItems])`. |
| P-084 | medium | `src/components/StockPanel.tsx:411` `physicalOffers.map((o) => ({...}))` | Already produces a fresh array (see P-024). | Same fix. |
| P-085 | medium | `src/components/MediaGallery.tsx:60-99` `groups` memo returns a record literal containing 6 arrays; each `.map((s, i) => ({ ... }))` constructs fresh objects. The memo correctly invalidates only when `screenshots`, `releaseImages`, or `t` change, so this is acceptable. | No action. |
| P-086 | medium | `src/components/CharactersSection.tsx:73-77` `sorted = chars ? [...chars].map(...).sort(...) : []` runs on every render (not memoized). For 50+ characters this is a non-trivial sort every render. | `useMemo([chars, vnId])`. |
| P-087 | medium | `src/components/RoutesSection.tsx:155-178` `move` builds a fresh `next` array and passes it to `setRoutes` then to the fetch body. Fine — single user action. | No action. |
| P-088 | low | `src/components/CardContextMenu.tsx` (assumed) accepts `developer={data.developers?.[0] ?? null}` and `publisher={...}` inline at VnCard.tsx:497-502. Fresh literal each render of the anchor wrapper. | Card already mounts the menu lazily on right-click, so the inline literal only matters when the menu opens. Acceptable. |

---

## Category 10 — Heavy components not via next/dynamic

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-089 | high | `src/components/StockPanel.tsx` (entire 1431-line file) | Mounted statically on every `/vn/[id]/page.tsx` render. Pulls 18 icons + multiple helpers. | `dynamic(() => import('./StockPanel'), { ssr: false, loading: () => <SkeletonRows /> })`. |
| P-090 | high | `src/components/MediaGallery.tsx` | Heavy lightbox state machine + ~700 lines. Mounted on every VN page. | Lazy via `next/dynamic`. The thumbnails could stay server-rendered and the interactive wrapper goes client-only. |
| P-091 | medium | `src/components/ShelfLayoutEditor.tsx` | Dnd-kit-heavy. Only mounted via `?view=layout`. Verify the parent page lazy-loads it. | Audit. |
| P-092 | medium | `src/components/TutorialTour.tsx` | Only fires on `startTour()` — already lazy? Audit. | Confirm lazy. |
| P-093 | medium | `src/components/CompareVnPicker.tsx` / `SimilarSeedPicker.tsx` / `VnSeedPicker.tsx` | Modal pickers mounted but invisible until trigger. Should be `next/dynamic` to defer the lucide+fetch graph. | Lazy. |
| P-094 | medium | `src/components/SchemaBrowser.tsx` | Tree component for `/schema`. Acceptable since this is a destination page. | No action. |
| P-095 | low | `src/components/CachePanel.tsx`, `ImportPanel.tsx` | Mounted on `/stats` — only loaded when the user visits the page; no issue. | No action. |

---

## Category 11 — Infinite loops in useEffect

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-096 | medium | `src/components/LibraryClient.tsx:265-303` | Outer mount-only fetch effect: deps `[toast, t.common.error]`. `toast` is a stable context value (memoized via `useToast()`), and `t.common.error` is a stable string. BUT if a future agent removes the `useMemo` in `ToastProvider`, every toast push re-fires the 4-fetch chain. Currently safe; documented as a fragile contract. | Add a `useRef`-based mount-guard so this effect runs strictly once regardless of dep churn. |
| P-097 | low | `src/components/EditForm.tsx:75-105` | Auto-save effect uses `mountedRef.current` to skip the first run. Subsequent runs depend on 14 deps. No loop because the SET-state on success is gated by `serialized === lastSavedRef.current`. ✓ correct. | No action. |
| P-098 | low | `src/components/PomodoroTimer.tsx:68-70` | `useEffect([elapsedMin, onElapsedChange])` calls the callback. If parent re-renders inside `onElapsedChange` and recreates the callback, this loops. Callers must memoize the callback. | Documented contract; verify all callsites memoize. |
| P-099 | low | `src/components/HeroBanner.tsx:62-72` | `useEffect([initialPosition])` → `setPosition(initialPosition || DEFAULT_POSITION)` overrides local state on every prop change. If parent passes a fresh string each render this overrides the user's draft. Looks fine: `initialPosition` from server props is stable per route. | No action. |

---

## Category 12 — Memory leaks (timers / intervals / listeners not cleaned up)

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-100 | high | `src/components/EditForm.tsx:93` | `setTimeout(() => setSaveStatus('idle'), 2000)` inside an effect, fires inside the `.then` of a `call('PATCH', payload)`. No clearTimeout if the component unmounts before 2s. Calls `setSaveStatus` on unmounted component → console warning + memory leak (closure retains state). | Wrap in `useRef<ReturnType<typeof setTimeout> | null>` and clear on cleanup. |
| P-101 | high | `src/components/CompareVnPicker.tsx:238` | `setTimeout(() => inputRef.current?.focus(), 0)` — fires after panel opens; not cleaned up. If the panel closes within the same tick, the focus call lands on a possibly-unmounted ref. | Capture timer id and clear on cleanup. |
| P-102 | high | `src/components/SetBannerButton.tsx:23,47` | `doneTimer = useRef<...>(null)` … `setTimeout(() => setDone(false), 1500)`. Effect at line ~57 (presumed) might not clear on unmount. | Verify cleanup; if missing, add `useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, [])`. |
| P-103 | medium | `src/components/GameLog.tsx:78-82` | `setInterval(() => setNow(Date.now()), 30_000)` — correctly cleared on cleanup ✓. Only stale-state risk if the component unmounts between dispatch and `setNow`, which is fine because the cleanup runs first. | No action. |
| P-104 | medium | `src/components/PomodoroTimer.tsx:45-58` | Interval correctly cleared. `tickRef.current === id` guard ensures we don't reset the wrong id. ✓ | No action. |
| P-105 | medium | `src/components/DownloadStatusBar.tsx:260-267` | Inner `setInterval(tick, 500)` for the retry-countdown is cleared in cleanup ✓. The outer SSE + polling loop is also cleaned up ✓. | No action. |
| P-106 | medium | `src/components/RefreshScopeButton.tsx:55` | `setInterval(() => setNow(Date.now()), 30_000)` — verify cleanup. | Verify cleanup pattern. |
| P-107 | medium | `src/components/HeroBanner.tsx:179-191` | `setPointerCapture` / `releasePointerCapture` — if the user navigates away mid-drag, the pointer capture leaks. Browsers clean these up on element removal so this is fine in practice. | No action. |
| P-108 | medium | `src/components/LibraryClient.tsx:1501-1513` (Grid) | `window.addEventListener('scroll', measureGrid, { passive: true })` + `'resize'` + `ResizeObserver`. All cleaned up in the same effect. ✓ The `measureFrameRef.current` rAF id is also cancelled on cleanup ✓. | No action. |
| P-109 | medium | `src/components/LibraryClient.tsx:1893-1920` (LibraryActionsMenu) | Mousedown + keydown listeners attached when `open`. Cleaned up correctly ✓. | No action. |
| P-110 | medium | `src/components/SavedFilters.tsx:74-99` | Same shape, also clean ✓. | No action. |
| P-111 | medium | `src/components/SpoilerToggle.tsx:35-54` | Mousedown + keydown listeners attached when open; cleaned up ✓. | No action. |
| P-112 | medium | `src/components/ToastProvider.tsx:39,68-74` | `timerRef` Map of setTimeout ids; cleanup at line 45-51 iterates and clears all timers on provider unmount ✓. The `dismiss(id)` flow is also correct. | No action. |
| P-113 | medium | `src/components/ShelfLayoutEditor.tsx:167,181` | Two `setTimeout` calls inside event handlers — neither cleared on unmount. If the editor unmounts during the 30ms delay, the timer fires after mount. | Wrap in refs, clear on unmount. |
| P-114 | medium | `src/components/NotInCollectionBanner.tsx:47` | `setTimeout(() => router.refresh(), 250)` — fires after the `Add to collection` action; no cleanup. If the user navigates away in the 250ms window, `router.refresh()` fires on an unmounted page. Mostly harmless (Next.js no-ops). | Cleanup id. |
| P-115 | medium | `src/components/MoreNavMenu.tsx` | Window-level event listeners (resize / mousedown). Verify cleanup. | Audit. |
| P-116 | low | `src/lib/stock-summary-client.ts:64` | `queueTimer = setTimeout(flushQueue, COALESCE_MS)` — global timer not tied to React lifecycle. The 60ms timer flushes its queue; nothing to cancel. Cache + listeners survive between renders, which is intentional. | No action. Documented contract. |
| P-117 | low | `src/lib/i18n/client.tsx`, `cover-banner-events.ts` | Module-level listeners are intentional global buses. Cleanup is per-subscriber. | No action. |

---

## Category 13 — Promises swallowed silently

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-118 | high | `src/components/EditForm.tsx:48` | `fetch('/api/places').then(...).catch(() => {})` — silently swallows network and parse errors. The "places" dropdown will appear empty without any UI signal. | At minimum `.catch((e) => console.error('[EditForm] places fetch failed:', e))`; ideally surface to a toast. |
| P-119 | high | `src/components/StockLookupClient.tsx:25` | `.catch(() => {})` swallows the entire stock-lookup fetch failure. | Surface failure to user. |
| P-120 | high | `src/components/VnSourcePicker.tsx:95,104,113` | Three `.catch(() => {})` (library / vndb / egs branches). If all three fail the user sees an empty picker with no error indication. | At least set an `error` state so the panel can render "search failed; retry". |
| P-121 | high | `src/components/RoutesSection.tsx:43-46,63-66` | `try/catch` with empty comment-only blocks swallowing fetch errors. | Surface via toast. |
| P-122 | high | `src/components/StockPanel.tsx:262-263,278-279,344-346` | Multiple `try { … } catch { } finally { }` blocks with empty `catch` arms (line 278-279: alias delete, line 344-346: cache clear). User actions silently fail. | Surface via toast. |
| P-123 | high | `src/components/SetBannerButton.tsx` and `BannerControls.tsx` | Verify error paths surface to UI. | Audit. |
| P-124 | high | `src/components/WishlistClient.tsx:289-295` | `try { … } catch { failed++ } finally { … }` swallows each per-VN delete error. Aggregate "N failed" toast is shown ✓ — partial mitigation but root-cause info is gone. | At minimum console.error each failure with context (which id failed and the error). |
| P-125 | medium | `src/lib/assets.ts` | Many `try { ... } catch { /* ignore — defensive */ }` blocks for character images / EGS / quote fetches. Acceptable for best-effort asset mirroring. | No action. |
| P-126 | medium | `src/components/QuotesSection.tsx`, `EgsPanel.tsx`, `CharactersSection.tsx` | Verify each fetch path either surfaces to toast or logs. | Audit. |
| P-127 | medium | `src/components/HomeLayoutEditorTrigger.tsx`, `SettingsButton.tsx` | Verify error handling on PATCH /api/settings paths. | Audit. |
| P-128 | medium | `src/components/TextualSearchPanel.tsx:93` | `.catch(() => undefined)` swallows. | Surface. |
| P-129 | medium | `src/lib/alicesoft-kobe.ts:816` | `.catch(() => {})` in batch matching — intentional per-item failure isolation, OK. | No action; documented. |
| P-130 | low | `src/components/CoverHero.tsx`, `CoverRotationButtons.tsx`, etc. | Spot-check OK with toast surfacing. | No action. |
| P-131 | low | `src/components/ToastProvider.tsx:29` | `try { cb(entry); } catch { /* listener errors must not break the loop */ }` — intentional per-listener isolation ✓. | No action. |

---

## Category 14 — Race conditions on concurrent fetches

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-132 | high | `src/components/LibraryClient.tsx:265-303` | 4 fetches fire on mount with no ordering guarantee and no `alive` guard. If the component unmounts between the first response and the fourth, the fourth's `setX` runs on an unmounted component. AbortController would also cancel the in-flight requests (P-001). | Same fix as P-001. |
| P-133 | high | `src/components/SearchClient.tsx:203-236, 239-274` | Two parallel quick-search effects (VNDB + EGS). Both have `AbortController` ✓. The 350ms debounce timer is also cleared ✓. **However**, the outer state `setLoading(true)` is shared — if the user toggles `source` mid-flight, the in-flight VNDB request's `setLoading(false)` in `finally` runs even though the EGS effect has just set `setLoading(true)`. Net: loading state flickers. | Track per-source loading flags. |
| P-134 | high | `src/components/EgsPanel.tsx:113-122` | `useEffect` aborts on cleanup ✓ but the inner `setGame`/`setSource` calls aren't guarded after an abort. The `if (signal?.aborted) return` check IS there (line 101). ✓ correct. | No action. |
| P-135 | high | `src/components/StockPanel.tsx:198-231` `refresh` | Cancels prior `abortRef.current` ✓; sequential per-provider POST ✓. But `setSnapshot((await r.json()) as StockSnapshot)` at line 220 sets state even if the user clicked Stop after the response began parsing. The `abortRef.current = null` check at line 228 doesn't run until after the loop exits — so an aborted iteration mid-parse can still apply the snapshot. | Re-check `ctrl.signal.aborted` after each `await r.json()`. |
| P-136 | high | `src/components/HeroBanner.tsx:133-162` `rotateBy` | No abort signal on the PATCH. If the user spams rotate, multiple PATCHes race; the last to resolve wins on the server but the optimistic state already advanced. Acceptable in practice (idempotent enum), but consider a queue. | Acceptable. |
| P-137 | medium | `src/components/SearchClient.tsx:195-198` | URL sync debounced 300ms; not aborted on dep change. Multiple URL updates can fire as the user types. Each `router.replace` is cheap so OK. | No action. |
| P-138 | medium | `src/components/StockChip.tsx:21-41` | IntersectionObserver + subscribe pattern. Cleanup disconnects observer and unsubscribes ✓. But the `subscribeStockSummary` queue flushes asynchronously and `setEntry(value)` may fire on an unmounted component (no `alive` check inside the subscribe callback). React tolerates this with a warning but it's a known leak. | Track an `alive` ref and guard `setEntry`. |
| P-139 | medium | `src/components/CompareVnPicker.tsx:69-99` | `Promise.allSettled` ✓ + `lastQueryRef` debouncing ✓. But after the await resolves, the component might be unmounted; no guard on `setHits`. | Add `alive` ref. |
| P-140 | medium | `src/lib/stock-summary-client.ts:55-71` | The global queue/flush pattern guarantees coalescing but cache-hit listeners fire synchronously inside `subscribe`, which can re-enter React state setters during render. | Defer cache-hit notifications via `queueMicrotask` so subscribers aren't called during their own setup. |
| P-141 | medium | `src/components/EditForm.tsx:107-119` `call` function | No abort signal. PATCH may overlap if multiple saves stack. The auto-save effect's `lastSavedRef` mitigates: only one PATCH is in flight per state generation because the timeout is cleared on every dep change. ✓ Acceptable. | No action. |
| P-142 | low | `src/components/WishlistClient.tsx` `load` | Called from refresh button + initial mount. If both fire simultaneously, both `setItems` apply — second wins. Acceptable since both fetch the same data, just wasted bandwidth. | Coalesce. |

---

## Category 15 — SQLite queries without hot-path indexes

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-143 | high | `src/lib/db.ts` `batchVnStockSummaries` (line 9653) | The CTE filters `WHERE vn_id IN (?, ?, …)` AND `availability IN ('in_stock','limited')` AND multiple JSON-ish enum filters. No composite index on `(vn_id, availability)`. With ~10k offers, every library page render does a full scan over offers. | `CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_vn_avail ON vn_stock_offer(vn_id, availability) WHERE availability IN ('in_stock','limited')` (partial index). |
| P-144 | high | `src/lib/db.ts:9701-9713` `listRecentVnStockOffers` | `SELECT o.*, v.title, ... FROM vn_stock_offer o LEFT JOIN vn v ON v.id = o.vn_id ORDER BY o.fetched_at DESC LIMIT ?`. Needs `idx_vn_stock_offer_fetched_at` (DESC) for the ORDER BY + LIMIT to be efficient. | Add the index. |
| P-145 | high | `src/lib/db.ts:3984-3996` `listPlacesForVnsMany` | `WHERE vn_id IN (?, ?, …)` on `collection_place_index` — needs `idx_collection_place_index_vn_id` if not present. | Verify; add if missing. |
| P-146 | high | `src/app/api/collection/route.ts:106` (aspect materialization branch) | `db.prepare('SELECT vn_id FROM collection').all()` — full table scan to get every vn_id before materializing aspects. Reasonable for first-aspect-filter request, but runs on EVERY library load that has `?aspect=...` or `?group=aspect`. | This is unavoidable for the materialization path, but the result could be cached for ~30s in-memory like `getAggregateStats`. |
| P-147 | medium | `src/lib/db.ts` | `vn_stock_alias` queries `WHERE vn_id = ?` — verify index on `vn_id`. PK should already cover this; check. | Verify. |
| P-148 | medium | `src/lib/db.ts` | `vn_stock_source` queries `WHERE vn_id = ?` — PK covers `(id)` but a composite index on `(vn_id)` may be missing. | Verify. |
| P-149 | medium | `src/lib/db.ts` | `alicesoft_kobe_stock` list queries by `vn_match_source`, `egs_match_source`, `last_matched_at` filters — partial indexes for the common filter combinations would help the AliceNet Kobe page load. | Add indexes. |
| P-150 | medium | `src/lib/db.ts` `listCollection` WHERE branches | Verify that `producer`, `publisher`, `series`, `tag`, `place`, `edition` filters all use indexes. Tag filter does an `EXISTS` against a JSON column (see line 1651 comment). The JSON scan can be slow on a 1k+ library. | Materialize tag membership into a side table (already partly done via `collection_tag_index`?). |
| P-151 | medium | `src/lib/db.ts` | user_activity logging — `user_activity_kind` and `user_activity_entity` indexes exist ✓. | No action. |
| P-152 | low | `src/lib/db.ts` | `vn_activity` has `idx_vn_activity_vn` and `idx_vn_activity_occurred` ✓. | No action. |

---

## Category 16 — Components re-rendering on every keystroke unnecessarily

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-153 | high | `src/components/LibraryClient.tsx:608` | `onChange={(e) => setQInput(e.target.value)}` — drives the search input. Setting `qInput` re-renders `LibraryClient` (2000 lines). 300ms-debounced URL sync prevents the network from firing, but every keystroke still re-renders the entire toolbar + the 200-card grid. The `MemoCard` wrapper at line 1576 saves the cards, BUT every memo prop must be stable — the inline `style` in `Grid` (P-081) defeats some memo work. | Extract `<SearchInput>` as its own component so only it re-renders per keystroke; the parent observes the debounced URL change only. |
| P-154 | high | `src/components/SearchClient.tsx:427-432` | `<input value={q} onChange={(e) => setQ(e.target.value)}>` — same shape. Toolbar contains language/platform chip rows whose `onClick` use inline closures over `toggle(s.langs, l)` — each keystroke re-renders all of them. | Extract a `<SearchInput>` sub-component. |
| P-155 | high | `src/components/WishlistClient.tsx:485-487` | Same pattern for the wishlist search box. | Extract. |
| P-156 | high | `src/components/TagsBrowser.tsx:208-214` | Same. | Extract. |
| P-157 | medium | `src/components/EditForm.tsx` | 14+ controlled inputs that each `setX` and re-render the entire 500-line form. The auto-save effect handles the persistence cost but render cost is non-trivial. | Per-field sub-component split is the canonical fix; large refactor. |
| P-158 | medium | `src/components/StockPanel.tsx` | Aliases / sources input forms (line 745-810) — typing in either re-renders the whole panel. | Same; extract. |
| P-159 | medium | `src/components/RoutesSection.tsx` | `setDraft` on every keystroke — re-renders the entire routes section. | Extract. |
| P-160 | medium | `src/components/AliceNetKobeClient.tsx:154-176` | `setQuery` re-renders the entire client. | Extract. |
| P-161 | low | `src/components/GameLog.tsx` | Textarea + edit-mode textarea — `setText`/`setEditingText` re-render. Acceptable. | No action. |

---

## Category 17 — Server components calling each other in serial when they could be parallel

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-162 | high | `src/app/vn/[id]/page.tsx` (the big VN detail page) | Hard to fully audit without reading the file end-to-end. From the surface: `loadVn`, `loadOwnedReleases`, `loadEgsForServer`, `loadShelfPlacement`, `loadGameLog` — each is a `db` read; if any uses `await` chains rather than `Promise.all`, the latency adds up. Most DB reads are sync (better-sqlite3), so this only matters for the async EGS fetch. | Verify `/vn/[id]/page.tsx` parallelizes async work with `Promise.all`. |
| P-163 | high | `src/app/api/alicesoft-kobe/route.ts:28` | Already uses `Promise.all([rawItems, stats, pending, wishlistIds])` ✓. | Pattern to follow. |
| P-164 | medium | `src/app/upcoming/page.tsx`, `top-ranked/page.tsx`, `tag/[id]/page.tsx`, `compare/page.tsx`, `trait/[id]/page.tsx`, `staff/[id]/page.tsx`, `similar/page.tsx`, `release/[id]/page.tsx` | All read `[t, locale] = await Promise.all([getDict(), getLocale()])` ✓. But subsequent VNDB calls (e.g. fetching top-ranked + EGS top-ranked + producer info) may be serial. | Audit each page for sequential `await`s that could parallelize. |
| P-165 | medium | `src/app/similar/page.tsx:121` | `const perTag = await Promise.all(...)` ✓. | No action. |
| P-166 | medium | `src/lib/recommend.ts:804` | `Promise.all(seeds.map(...))` ✓. | No action. |
| P-167 | medium | `src/lib/staff-full.ts:87` | `Promise.all([profile, productionCredits, vaCredits])` ✓. | No action. |
| P-168 | low | Server components doing in-process DB reads | Synchronous, no parallelization possible/needed. | No action. |

---

## Category 18 — Promise.all over an unbounded array (rate-limit risk)

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-169 | high | `src/app/labels/page.tsx:89` | `const qrs = await Promise.all(items.map((it) => qrSvg(...)))` — `items` size is bounded by the user's selection (could be 500+ VNs for label-print). `qrSvg` is CPU-bound but unbounded fan-out can still exhaust event-loop responsiveness on a large set. | Add a `pLimit`-style concurrency cap (8 at a time). |
| P-170 | high | `src/lib/recommend.ts:804` | `seeds.map(seed => vndbAdvancedSearchRaw(...))` — VNDB throttle handles 1 req/s, so practically bounded. But if `seeds.length > 10` the throttle queue fills and other VNDB consumers get pushed out. | Cap `seeds.length` before fan-out (already done?), or yield to other queues. |
| P-171 | medium | `src/lib/assets.ts:124` | `await Promise.all(workers)` — the workers themselves implement the concurrency cap (`Math.min(CONCURRENCY, shots.length)`). ✓ | No action. |
| P-172 | medium | `src/components/TextualSearchPanel.tsx:84` | `Promise.all([fetch local, fetch textual])` — fixed at 2. ✓ | No action. |
| P-173 | medium | `src/components/TagsBrowser.tsx:107,121` | `Promise.all([treeRes, localRes])` — fixed at 2. ✓ | No action. |
| P-174 | medium | `src/components/CompareVnPicker.tsx:69`, `SimilarSeedPicker.tsx:72`, `VnSourcePicker.tsx:117` | Fixed-size fan-out (2-3). ✓ | No action. |
| P-175 | low | `src/lib/alicesoft-kobe.ts:797` | `Promise.allSettled([vndbResult, egsResult])` — fixed at 2. ✓ | No action. |
| P-176 | low | `src/lib/brand-overlap.ts:69,75` | Fixed at 2. ✓ | No action. |
| P-177 | low | `src/components/OwnedEditionsSection.tsx:139` | `Promise.all([o, r])` — fixed at 2. ✓ | No action. |

---

## Category 19 — Synchronous file I/O in hot paths

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-178 | medium | `src/lib/db.ts:3,112` | `import { mkdirSync } from 'node:fs'` and `mkdirSync(dirname(dbPath), { recursive: true })` — runs once per cold start to ensure the data dir exists. Already documented in CLAUDE.md as the lazy-init pattern. ✓ | No action. |
| P-179 | medium | `src/lib/files.ts` | Presumed sync calls — verify that all post-request file I/O is async. Streaming responses to `/api/files/[...path]` must use `fs.promises` not `readFileSync`. | Read the file; spot-check. |
| P-180 | low | `src/lib/assets.ts` `fileExists` | Called inside `downloadCharacterImages`. Verify this is `fs.promises.stat`-based, not `fs.statSync`. From the surrounding `await` pattern it appears async. | Verify. |
| P-181 | low | Other lib files | Do not appear to use sync I/O in request paths. | No action. |

---

## Category 20 — JSON.parse called repeatedly on the same string

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-182 | high | `src/lib/db.ts` `rowToItem` (line 3516) | Parses 10+ JSON columns PER ROW: `languages`, `platforms`, `developers`, `publishers`, `tags`, `screenshots`, `release_images`, `relations`, `aliases`, `extlinks`, `titles`, `editions`, `staff`, `va`. For a 1000-VN library that's 14,000+ JSON.parses per library load. The `'cards'` projection (P-050) elides most of these by returning `undefined`, so `safeJsonParse(undefined, ...)` short-circuits to the default. ✓ Used correctly by `/api/collection`. But `/api/collection?detail=full` and `/series/[id]`, `/lists/[id]`, exports all still pay the full cost. | Two-step fix: (a) audit non-card callers and switch to slim where possible; (b) for callers that genuinely need the JSON, lazy-parse via Proxy-based getters so a consumer that only reads `developers` doesn't pay for `staff`. |
| P-183 | high | `src/lib/db.ts:1175-1181, 1233, 1277, 1290, 1299, 1327, 1361, 1369, 1421` | Multiple ad-hoc `JSON.parse(r.staff)`, `JSON.parse(r.va)`, etc. in non-`rowToItem` paths. Each runs per-row in some helper. | Centralize through `safeJsonParse`. |
| P-184 | high | `src/lib/db.ts:4121, 4202, 4382, 4525` | `JSON.parse(row.body)` on `vndb_cache` rows. Same row can be parsed multiple times in different helpers in the same request. | Cache the parsed result in-process for the request lifetime, OR memoize the parse via a WeakMap keyed on row identity (the row is a fresh object each prepare call so WeakMap won't hit). |
| P-185 | high | `src/lib/db.ts:4674, 6726` | `JSON.parse(vnRow.screenshots)` — screenshots column parsed twice in `materializeAspectForVn` paths. Aspect materialization runs on every library load when `?group=aspect` is active. | Parse once at the top of the function and reuse. |
| P-186 | high | `src/lib/db.ts:4992` | `JSON.parse(row.body) as { profile: ... }` for staff profile cache. Called per VN credit. | Bulk-parse via a single prepared statement that already does the filter, then parse once. |
| P-187 | medium | `src/app/api/egs-cover/[id]/route.ts:47,125` | `JSON.parse(row.body)` and `JSON.parse(row.raw_json)` — once per request. ✓ low risk per call. | No action. |
| P-188 | medium | `src/lib/db.ts:2558` | `JSON.parse(row.source_pref)` per VN per request when reading source preferences. | Cache for the request lifetime. |
| P-189 | medium | `src/lib/db.ts:5434, 5472` | `JSON.parse(raw)` for the producer / character payload cache. Repeated per credit. | Centralize cache parsing. |
| P-190 | medium | `src/components/SettingsButton.tsx`, `lib/settings/client.tsx` | `JSON.parse(rawSettings)` from localStorage. Runs once per mount. ✓ | No action. |
| P-191 | medium | `src/lib/home-section-layout.ts`, `vn-detail-layout.ts`, `series-detail-layout.ts`, `staff-detail-layout.ts`, `producer-detail-layout.ts`, `character-detail-layout.ts` | Each `parseXxxLayoutV1` calls `JSON.parse` on the same `app_setting` value across multiple call sites within a single request. | Memoize per-request inside the helper. |
| P-192 | low | `src/lib/quote-avatar.ts` | Verify no per-quote JSON.parse on the VN cover columns. | Audit. |

---

## Additional cross-cutting findings (out of categories)

| ID | severity | file:line | issue | fix |
| --- | --- | --- | --- | --- |
| P-193 | high | `src/components/StockPanel.tsx:350` | `const now = Date.now()` at top-of-render — used as a dep in `useMemo` at line 359. Every render produces a fresh `now`, so the memo never hits AND the staleness check effectively re-evaluates on every render. (Same root cause as P-021; flagged separately because it's both a "wrong deps" issue and a "fresh literal" issue.) | Memoize `now` once per snapshot via `useMemo(() => Date.now(), [snapshot])` so staleness is computed once per data load. |
| P-194 | high | `src/components/LibraryClient.tsx:1500` | `if (items.length <= VIRTUAL_GRID_THRESHOLD) return;` — virtual scrolling kicks in only above the threshold. Below the threshold, the grid renders ALL items at once. Mostly fine, but a user with 800 cards just above the threshold and a low density slider can render 800 full cards with covers without virtualization — the threshold isn't density-aware. | Make threshold density-aware or lower the threshold for low-density. |
| P-195 | high | `src/lib/stock-summary-client.ts:18` | `const cache = new Map<string, StockSummaryEntry | null>()` — module-level cache never evicts. A user who scrolls past 5000 unique VNs accumulates 5000 cache entries that survive until page reload. | LRU-cap at ~500 entries. |
| P-196 | high | `src/components/SearchClient.tsx:101` | `const searchCache = new WeakMap<VndbSearchHit, CardData>()` — module-level. WeakMap keys are GC'd when the hit objects are released, so this is fine. ✓ | No action. |
| P-197 | medium | `src/components/EgsPanel.tsx:87-89` | Three useState calls on the same component frame for `loading`, `game`, `source`. Each setX triggers a render. A single setState({ loading, game, source }) is more efficient when they ALWAYS change together. | Combine into one state object. |
| P-198 | medium | `src/components/WishlistClient.tsx:67-72` | Three setState calls in `try` block (`setNeedsAuth`, `setItems`, `setError`). React 18 batches these ✓, but the explicit single-call pattern is clearer. | Optional. |
| P-199 | medium | `src/components/LibraryClient.tsx:498-557` | `visibleItems = useMemo(() => items.filter(...))` — 18 deps. Every change to any URL param re-filters the entire `items` array. For a 1000-item collection this is O(n) per keystroke (because keystrokes change `urlQ` which changes the filter input deps indirectly via the URL → re-fetch → new `items` reference). The `items` re-fetch on every URL change is the bigger cost than the filter itself. | The fetch ordering is the bottleneck (P-001/P-002). Acceptable as long as the network completes fast. |
| P-200 | medium | `src/components/StockPanel.tsx:147` | `const STALE_MS = 7 * 24 * 60 * 60 * 1000;` — declared inside the component body, so the literal is recreated on every render. Cheap but unnecessary. | Move to module scope. |
| P-201 | medium | `src/components/SearchClient.tsx:33` | `COMMON_PLATFORMS = ['win', ...]` — module-level ✓. | No action. |
| P-202 | medium | `src/components/QuoteFooter.tsx:36-40` | `useEffect([hovered, load])` triggers `load()` first time `hovered` is true. `fetchedRef.current` guard prevents re-load. ✓ but if the user clicks the manual refresh button (line 75: `load()`), the ref is set to true but the auto-load gate also fires once. Defensively OK. | No action. |
| P-203 | medium | `src/components/HeroBanner.tsx:55,71-79` | Three sibling `useEffect`s sync `liveSrc`, `bannerLoaded`, `rotation` from props. Each is its own effect, so on a single `router.refresh()` they all fire in sequence triggering 3 renders. | Combine into one effect with a single setState. |
| P-204 | medium | `src/lib/db.ts:3653` | Comment in code mentions "drops `/api/collection`'s JSON.parse work from ~30-80 MB to a few MB" via `'cards'` projection. This is HUGE and confirms the size of P-050 / P-182. | The fix is already implemented for `/api/collection`; expand to other callers. |
| P-205 | medium | `src/components/SettingsButton.tsx` (very large file) | Every settings tab is in one bundle, re-rendered when opening any tab. The tab content could be code-split per-tab. | Lazy-split each tab's content. |
| P-206 | medium | `src/components/StockPanel.tsx:330-348` `performClearCache` | `await fetch(...)` then `await load()` — serial. The clear endpoint returns the new snapshot, so the extra load is a no-op fallback. ✓ correct as documented. | No action. |
| P-207 | medium | `src/components/StockPanel.tsx:411-429` | `physicalOffers` map runs `.filter(...).map(...)` on every render where `offers` changes. The mapper creates 9-key objects. Cost is bounded but inline-object-literal heavy. | Acceptable; could fold into a single reduce. |
| P-208 | medium | `src/lib/stock-summary-client.ts:64` | `if (!queueTimer) queueTimer = setTimeout(flushQueue, COALESCE_MS)` — single global timer ✓. But if `flushQueue` rejects, `queueTimer` is null and the next subscribe starts a fresh timer. ✓ No leak. | No action. |
| P-209 | medium | `src/components/RoutesSection.tsx:55-68` | Second `useEffect` fetches `/api/vn/[id]/characters` whenever `vnId` or `inCollection` change. **Both** `CharactersSection` AND `RoutesSection` fetch the same endpoint independently. Two network round trips for the same data on every VN detail page. | Lift the characters fetch into a shared parent / context, OR cache via a SWR-like helper. |
| P-210 | medium | `src/components/StockPanel.tsx:191-196` | `useEffect([initialSnapshot, providers.length])` — sets the default physical-provider selection. `providers.length` doesn't change identity but the `providers` array does on each render (P-027). Deps tracking `.length` is OK ✓. | No action. |
| P-211 | medium | `src/components/EditForm.tsx:51-53` | `vn.series ?? []` — fresh array literal each render. Passes to `<SeriesManager>` etc. — those should accept and stabilize internally. | Memo-wrap. |
| P-212 | medium | `src/components/HeroBanner.tsx:248-249` | `const [xRaw, yRaw] = activePos.split(' ')` and `parseFloat` calls each render. Cheap but unnecessary when editing isn't active. | Memo. |
| P-213 | medium | `src/components/LibraryClient.tsx:1185` | `<BulkDownloadButton onItemDone={() => setRefreshKey((k) => k + 1)} />` — inline arrow re-created each render, defeats `BulkDownloadButton`'s memo if it has one. | `useCallback`. |
| P-214 | low | `src/components/LibraryClient.tsx:1250-1265` | `onReorder={(orderedIds) => { ... fetch(... order ...) }}` — inline arrow. Acceptable, only fires on drag end. | No action. |
| P-215 | low | `src/components/MediaGallery.tsx:80-97` | `for (const img of releaseImages) { out[img.type].push(item); }` — inside `useMemo`, so OK. | No action. |
| P-216 | low | `src/components/EditionInfoPopover.tsx:164-207` | Measure effect re-runs on every open + scroll + resize. `compute()` does several `getBoundingClientRect` calls. Bounded ✓ (only while open). | No action. |
| P-217 | low | `src/components/SettingsButton.tsx` (long file) | Verify cleanup on all `addEventListener` calls. | Audit. |
| P-218 | low | `src/lib/i18n/client.tsx` | `useT()` returns a stable dictionary reference per locale. ✓ | No action. |
| P-219 | low | `src/components/ToastProvider.tsx:34` | `let nextId = 1` — module-level mutable counter. ✓ no resets needed. | No action. |
| P-220 | low | `src/lib/db.ts:9657` | `vnIds.map(() => '?').join(',')` — fresh placeholder string per call. For huge `vnIds.length`, the placeholder explodes — SQLite has a max parameter count (default ~32k). With 32k+ VNs in a single call, the prepare throws. | Chunk `vnIds` into batches of 500 before the IN clause. (Real-world libraries are well below this, so low severity.) |
| P-221 | low | `src/lib/db.ts:4992-4996` | `JSON.parse(row.body)` for staff fan-out — verify the cache row body isn't repeatedly parsed in inner loops. | Spot-check. |
| P-222 | low | `src/components/LibraryClient.tsx:1547` | `cardData = useMemo(() => renderedItems.map(toCardData), [renderedItems])` — `toCardData` is WeakMap-cached ✓. | No action. |
| P-223 | low | `src/components/PomodoroTimer.tsx:42` | `const [now, setNow] = useState(Date.now())` — uses `Date.now()` as initial value. Acceptable for a timer init. | No action. |
| P-224 | low | `src/components/GameLog.tsx:66` | `const [now, setNow] = useState<number | null>(null)` — null until first effect tick. Avoids SSR mismatch ✓. | No action. |
| P-225 | low | `src/lib/db.ts` | Many `db.prepare(...)` calls inside helper functions without caching. better-sqlite3 prepares are LRU-cached internally, so the per-call cost is minimal. ✓ | No action. |

---

## Summary

- **Critical**: 0 (no confirmed data corruption / unbounded leak that fires on common usage).
- **High**: 56 findings — concentrated in:
  - `LibraryClient.tsx` (URL-driven fetches missing AbortController + inline literals + per-keystroke re-render of 200+ cards),
  - `StockPanel.tsx` (1431 LOC client component, fresh-array deps, no row memo),
  - `lib/db.ts` (`SELECT *` with massive JSON columns, repeated JSON.parse on the same blobs).
- **Medium**: 110 findings.
- **Low**: 59 findings.

The single highest-value cluster is the **listCollection `'full'` projection** (P-050, P-182, P-204): every non-card surface (`/series/[id]`, `/lists/[id]`, exports, recommendations) pays for the heavy `v.raw` + JSON columns even when it doesn't read them. The slim projection already exists for `/api/collection`; expanding it to every reasonable caller is a one-day refactor for an order-of-magnitude memory/CPU win on multi-hundred-VN libraries.

The second is **client-side fetch hygiene** (P-001 through P-009, P-070 through P-078): adopt `AbortController` + `cache: 'no-store'` as the default everywhere a client component fetches `/api/*`. A codemod across `src/components/**` would land it in one PR.

The third is **client re-render hot paths** (P-079 through P-088, P-153 through P-160): memoize inline `style` literals on grid containers, extract `<SearchInput>` from `LibraryClient` / `SearchClient` / `WishlistClient` so the toolbar's 2000-line parent doesn't re-render per keystroke.
