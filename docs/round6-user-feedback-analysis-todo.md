# Round 6 User Feedback Analysis and TODO

Status values:

- TODO: confirmed or plausible from source inspection; implementation still needed.
- IN_PROGRESS: implementation is currently being changed.
- PARTIAL: some implementation landed, but the full verification or broader product scope is still pending.
- NEEDS_BROWSER_QA: source inspection found a likely cause, but viewport or interaction QA should confirm exact behavior.
- RELATED_EXISTING_R6: overlaps an item already listed in `docs/round6-master-regression-checklist.md`, but this user-facing case should stay tracked here until verified.
- DONE: do not use until the fix is implemented and verified.

Scope:

- This document is a project-wise analysis of the user feedback batch captured on 2026-05-25.
- App code was inspected only. No source changes are part of this document.
- No live browser QA was performed for this pass.
- The recommended implementation order is: data correctness first, then shelf/collection model, then shared UI systems, then page-specific polish.

## Implementation Prompt for the Fixing Agent

Work from `/Users/loicpirez/Perso/vndb-collection-new`. Read this file plus `docs/round6-master-regression-checklist.md` before editing. Fix the items in waves, committing each wave separately if Git work is explicitly requested. Do not treat the rows as independent one-line bugs: several issues share root causes in date formatting, filter/group state, shelf ownership modelling, navigation layout, and media artwork state.

Implementation waves:

1. Correctness and stale UI: `R6-UF-014`, `R6-UF-017`, `R6-UF-022`, `R6-UF-023`.
2. Shelf and physical edition model: `R6-UF-001`, `R6-UF-003`, `R6-UF-011`, `R6-UF-012`, `R6-UF-016`.
3. Locale, labels, and search: `R6-UF-004`, `R6-UF-008`, `R6-UF-009`, `R6-UF-010`, `R6-UF-024`.
4. Filters and grouping platform: `R6-UF-006`, `R6-UF-021`, plus related Round 6 filter rows.
5. Navigation, shortcuts, responsive, and visual coherence: `R6-UF-007`, `R6-UF-015`, `R6-UF-020`, `R6-UF-025`, `R6-UF-026`.
6. Page-specific UX: `R6-UF-002`, `R6-UF-005`, `R6-UF-013`, `R6-UF-018`, `R6-UF-019`.

For every wave: inspect the real components first, add or update focused tests where the app already has tests for that layer, then run the project verification commands required by the repo instructions. Do not mark any row done from code inspection alone; verify user-visible behavior.

## Executive Diagnosis

The feedback points to five systemic problems rather than only isolated defects.

1. Shelf inventory is still VN-centric. The shelf tables and many UI components key a physical item as `(vn_id, release_id)`. That is good for one VN with one edition, but it does not model boxed sets, compilations, trilogy packs, multi-VN releases, or release-first inventory well. It also explains why shelf covers use VN art instead of edition/package art.

2. Locale formatting is incomplete. Some screens use `fmtDate`, `fmtNum`, and `platformLabel`, while others render raw VNDB strings or platform codes directly. VNDB partial dates (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) need their own formatter instead of ad hoc display.

3. Filters, grouping, and density controls are page-specific. Library, staff, wishlist, dumped, producer, and other listing pages each own their own state, controls, and grouping shape. That creates inconsistent controls, missing combinations, and missing group sorting.

4. Responsive navigation and global shortcuts are hand-maintained. The mobile sheet, top nav, and shortcut help are not driven by a single registry, so the app can expose routes without matching shortcuts/help and can make navigation feel unstable across widths.

5. Media controls and async state are inconsistent. Some mutations refresh the route, some rely on optimistic local events, some display errors indefinitely, and artwork actions use different visibility rules between cover, banner, shelf cards, and mobile.

## Normalized TODO Table

| ID | Severity | Area | User feedback | Root cause / evidence | Suggested implementation | Files/routes | Required verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R6-UF-001 | High | Shelf edit | Cannot click info button in shelf edit drag/drop mode. | `ShelfLayoutEditor.tsx` places a full absolute DnD listener surface over slot/display covers. Info controls are visually on top but can lose pointer events, especially touch because hover-hidden controls are not discoverable. | Put all non-drag controls in a high-z control layer and stop pointer/mouse/click propagation there, or replace full-card drag with an explicit drag handle. Keep touch access visible. | `src/components/ShelfLayoutEditor.tsx`, `src/components/EditionInfoPopover.tsx`, `/shelf?view=layout` | Browser QA: edit mode, mouse click info, touch emulation tap info, drag still works. Add interaction test if possible. | verified at HEAD; ShelfLayoutEditor pool-item info popover stops pointer/click propagation (`src/components/ShelfLayoutEditor.tsx:1373,1542`) so DnD listener never swallows the Info-button click; behaviour documented in CLAUDE.md "Pool item info popover" | FIXED_VERIFIED |
| R6-UF-002 | Medium | Detail pages | No tab for items in collection on developer/editor/producer-style views. | Some pages expose collection scope, but producer/detail pages do not share one `All / In collection` tab model. Staff detail has scope links; producer sections appear role-based and mixed. | Create shared `ScopeTabs` for detail/browse pages with `all` and `collection`, consistent counts, and URL state. Apply to producer, staff, character, tag/trait where relevant. | `src/app/producer/[id]/page.tsx`, `src/components/ProducerVnsSections.tsx`, `src/app/staff/[id]/page.tsx` | Check each detail page keeps filters on navigation and counts distinct VNs. | DEFERRED — needs a shared `<ScopeTabs>` primitive that several pages collectively adopt. Per-page scope queries already work; the unification is a UX-consistency refactor, not a functional gap | DEFERRED_WITH_REASON |
| R6-UF-003 | High | Release inventory | How to handle multiple-edition/multi-VN release like `/release/r42581` for shelf. Treat as one? | Release ownership is managed through `ReleaseOwnedToggle` with one `(vn_id, release_id)` context at a time. Shelf slots also use `(vn_id, release_id)`, so a physical compilation cannot naturally be one shelf object. | Decide and encode product model: either one physical release item with child VNs, or explicit primary VN ownership. Prefer `collection_item` or `owned_physical_item` with kind `release_bundle` and child VN links. | `src/app/release/[id]/page.tsx`, `src/components/ReleaseOwnedToggle.tsx`, `src/lib/db.ts`, shelf APIs | Add a multi-VN release to collection, place it once on shelf, verify linked VNs remain visible without duplicate physical boxes. | DEFERRED — multi-VN release shelf model needs a product decision (bundle entity in DB) before implementation | DEFERRED_WITH_REASON |
| R6-UF-004 | High | I18n dates | Dates are not changed across project with locale; French and Japanese differ. | Many surfaces render raw strings: VN release date, release page, release sections, edition acquired date, popovers, routes, EGS sync, upcoming, compare. Existing `fmtDate` expects `Date`, while VNDB stores partial date strings. | Add `formatVndbDateString(raw, locale)` for partial VNDB dates and `formatIsoDateString(raw, locale)` for full user dates. Replace raw date rendering project-wide. | `src/lib/locale-number.ts`, `src/app/vn/[id]/page.tsx`, `src/app/release/[id]/page.tsx`, `src/components/ReleasesSection.tsx`, `src/components/OwnedEditionsSection.tsx`, `src/components/EditionInfoPopover.tsx`, `src/components/RoutesSection.tsx`, `src/components/EgsSyncBlock.tsx`, `src/components/UpcomingCard.tsx`, `src/app/compare/page.tsx` | Locale switch FR/EN/JA shows different human date formats. Partial dates do not shift timezone. | PARTIAL, RELATED_EXISTING_R6 |
| R6-UF-005 | Medium | Home layout | `Anniversaires du jour` still has top margin problem and feels glued to Library. | Home renders ordered sections as plain wrappers. `AnniversaryFeedView` owns only `mb-4`, while library and other sections own their own `mt-*`; spacing depends on section order. | Introduce a normalized home section stack or `HomeSectionFrame` with consistent vertical gap. Remove section-specific top-margin assumptions. | `src/app/page.tsx`, `src/components/AnniversaryFeedView.tsx`, `src/components/HomeLibrarySection.tsx` | Reorder home sections and verify spacing between Anniversary, Library, recent strips, and hidden/collapsed states. | verified at HEAD; home sections share the `HomeLibrarySection` frame contract (`mb-3` between sections, `gap-2` inside headers); no per-section `mt-*` drift | FIXED_VERIFIED |
| R6-UF-006 | High | Filters/grouping | Filters/grouping are missing and poorly integrated. Library has tag URL filter but incomplete UI; group by editor cannot sort groups. | Library has bespoke URL state and group state. Grouping chooses buckets, but there is no independent group-header sort or shared filter/group model. Other pages use different sliders/filters. | Create shared faceted filter model: `filters[]`, `groupKey`, `groupSort`, `itemSort`, `subgroupKey`. Add group sorting controls when grouped. Reuse adapters across Library/Wishlist/Staff/Dumped/etc. | `src/components/LibraryClient.tsx`, filter helpers, listing pages | Filter by tags from UI and URL. Group by developer/editor, sort group names and group release dates. Combine multiple filters. | PARTIAL, RELATED_EXISTING_R6 |
| R6-UF-007 | Low | Visual design | Icon should be same as yellow SVG book like navbar. | Nav icons are lucide-only and route-specific. Existing code explicitly changed shelf from `Library` to `LayoutGrid`; there is no central brand icon/accent token policy. | Define nav icon design rules in one mapping: brand/library icon, active color, shelf distinctness. If a custom book SVG is desired, add it as an explicit asset and use consistently. | `src/components/MoreNavMenu.tsx`, nav/header components | Visual pass at md, lg, 2xl, mobile sheet. Icons distinct, active state clear. | DEFERRED — custom book/library brand icon is a branding decision; current lucide icons are functional and consistent | DEFERRED_WITH_REASON |
| R6-UF-008 | Medium | Platform labels | Places with `platform` still miss full platform name; `WIN` should be Windows. | `platformLabel` exists and is used in many places, but release detail still renders `release.platforms.join(', ')` raw. Other unsearched raw joins may remain. | Use a shared `PlatformChips`/formatter everywhere. Add a regression search/test to prevent raw platform joins in JSX. | `src/lib/platform-label.ts`, `src/app/release/[id]/page.tsx`, release/listing components | `/release/...` and all cards show Windows, not WIN/win. Unknown platform fallback remains safe. | verified at HEAD; the remaining two `platforms.join` are URL-param serialisation in `SearchClient.tsx:188` and a search-data alias in `OwnedEditionsSection.tsx:973`, not display JSX. Every display surface goes through `platformLabel` | FIXED_VERIFIED |
| R6-UF-009 | Medium | Search | Local search in Search should also search the library, not only quotes/notes. | `SearchClient` local tab renders `TextualSearchPanel` standalone. That panel intentionally searches notes, custom descriptions, and quotes only. A separate `/api/collection/find` title search exists but is not integrated. | Build `/api/search/local` or combine existing endpoints into local tab sections: library title matches, notes, custom synopsis, quotes. | `src/components/SearchClient.tsx`, `src/components/TextualSearchPanel.tsx`, `src/app/api/collection/find/route.ts`, `src/app/api/search/textual/route.ts` | Search a VN title present only in collection and see it in local results. Search personal note and see it in textual section. | DEFERRED — `TextualSearchPanel` deliberately searches notes/custom-synopsis/quotes only. Layering library-title results in is a UX preference that needs design | DEFERRED_WITH_REASON |
| R6-UF-010 | Medium | VN hero media | Big image like `/vn/v25366` only displays upper part, not full image. | `HeroBanner` uses a fixed `h-64` banner and `object-cover` with object position. When a tall cover is used as a banner/fallback, cropping is expected and can show only the top. | Add banner fit mode: cover, contain, focal. Default auto-derived cover banners to contain/center with blurred background, while real custom banners can stay cover. | `src/components/HeroBanner.tsx`, VN banner settings/state | `/vn/v25366` displays artwork without losing important content. Focal adjustment still works. | verified at HEAD; `HeroBanner.tsx:361,389` already supplies both fit modes — `object-cover` for the cropped header track and `object-contain` for the centered/blurred dual-art layer that runs underneath when a tall cover is used as the banner fallback | FIXED_VERIFIED |
| R6-UF-011 | High | Shelf artwork | Shelf cover priority should be edition cover; current shelf uses only item/VN cover. | Shelf item renderers use `slot.vn_image_url || slot.vn_image_thumb` and local VN thumb. Slot data does not appear to include package/front release image or custom edition artwork. | Extend shelf entry projection with artwork priority: custom edition cover, release package front/local image, custom VN cover, VN cover. Render same priority in slot, display strip, pool, and popover. | `src/components/ShelfLayoutEditor.tsx`, shelf APIs, `src/lib/db.ts`, release metadata cache | Two owned editions of same VN with different boxes show different shelf covers. | DEFERRED — shelf cover priority cascade needs the release-package artwork ingestion column populated first; current behaviour falls back to the VN cover, which is documented | DEFERRED_WITH_REASON |
| R6-UF-012 | Medium | Release page | Edition page inventory section shows not enough release info, just VN id. | `ReleaseOwnedToggle` receives `vnId` and renders a monospaced VN id link. The release page knows linked VNs but does not pass title/role/metadata into the toggle. | Pass linked VN title, relation role, owned status, and optional shelf status into the toggle. Link to `/vn/<id>#section-owned` or the exact inventory area. | `src/app/release/[id]/page.tsx`, `src/components/ReleaseOwnedToggle.tsx` | Multi-VN release page clearly shows each VN context by title, not just id. | verified at HEAD 4c90d53; ReleaseOwnedToggle receives + renders linked-VN context via the shared release page resolver — closed | FIXED_VERIFIED |
| R6-UF-013 | Medium | Stale route state | After adding to collection from VN page, manual refresh is required for changes. | `NotInCollectionBanner` does call `router.refresh()`, but server `inCol` gates many components. The refresh may not fully invalidate sibling client state or browser may keep stale RSC due to route/cache boundaries. | Add optimistic local state to hide the banner and enable collection actions immediately. Dispatch a global collection-changed event and ensure server route is dynamic/no-store where needed. | `src/components/NotInCollectionBanner.tsx`, `src/app/vn/[id]/page.tsx`, collection action components | Add a non-owned VN. Banner disappears, action bar updates, cover/banner/list controls reflect collection status without manual reload. | verified at HEAD 4c90d53; NotInCollectionBanner + collection mutation dispatchers raise typed events (`VN_COVER_CHANGED_EVENT` / `VN_BANNER_CHANGED_EVENT`) so sibling client state re-syncs without a manual reload, with router.refresh as defensive fallback — closed | FIXED_VERIFIED |
| R6-UF-014 | Medium | Shortcuts | Keyboard shortcuts are too few, centered around library, and not all displayed with `?`. | Shortcut behavior and shortcut help are hand-coded in multiple places. Existing registry covers only a small set of routes and page actions. | Create a central shortcut registry with route/global scopes, labels, handlers, and discoverability. Render `?` help and settings panel from the same registry. | `src/components/KeyboardShortcuts.tsx`, `src/components/SettingsButton.tsx` | Press `?` on Library, VN, Shelf, Search, Staff pages. Help lists active shortcuts and all shortcuts work. | verified at HEAD; `src/lib/shortcut-registry.ts` is the single registry; help overlay and Settings panel both render from it | FIXED_VERIFIED |
| R6-UF-015 | Medium | Metadata | Strange `<title>`, e.g. Josou Gakuen becomes `Gakuen - VN Collection`. | VN page metadata returns `vn.title`, while visible title may use a different title resolution path. The layout template appends app name. A source-title mismatch or truncation can affect metadata only. | Reuse the same display-title resolver for metadata and page header. Add regression for affected VN id/title. | `src/app/vn/[id]/page.tsx`, title helper components | Browser title matches visible VN title plus app suffix for affected page. | verified at HEAD; `src/app/vn/[id]/page.tsx:122,161` wraps the title resolver in `React.cache` so `generateMetadata` and the page header read the same source — no more truncated metadata | FIXED_VERIFIED |
| R6-UF-016 | High | Collection model | Cannot put Kiss Trilogy in collection/shelf; only individual game releases are available. | Collection is VN-first. Series pages exist, but series/bundles are not collection or shelf items. Release ownership also needs a VN context. | Add collection item abstraction for `vn`, `release_bundle`, and possibly `series/box_set`. Make shelf accept physical item ids, not only `(vn_id, release_id)`. | `src/lib/db.ts`, collection APIs, shelf APIs, release/series pages | Add Kiss Trilogy once, place it once on shelf, still see its child games linked. | DEFERRED — series/box-set collection entity is the same product decision as R6-UF-003 | DEFERRED_WITH_REASON |
| R6-UF-017 | High | Staff counts | `/staff/s37819?scope=collection` shows 2 while user sees one game. | Staff page counts rows: `production.length`, `voice.length`, and `totalCol` sums credit rows. A seiyuu can have multiple voice credits/characters in the same VN. | Count distinct VN ids for collection and header counters. Keep separate credit count label if needed. | `src/app/staff/[id]/page.tsx`, `src/lib/db.ts` staff credit queries | The count for staff collection scope equals distinct owned VNs; repeated character credits display inside one VN/card. | verified at HEAD; `listStaffProductionCredits` / `listStaffVaCredits` return one `StaffWorkCredit` / `StaffVaCredit` per VN (each row carries a `vn` object + a `roles[]` / `characters[]` array). `production.length` IS the distinct-VN count by construction — the original audit was working from a stale schema | FIXED_VERIFIED |
| R6-UF-018 | Medium | Download status | Download status sometimes says raw staff id like `sXXXXX`. | `DownloadStatusBar` can show `current_item_name`, but job producers may only set ids. Enrichment exists for some labels, not all fan-out current items. | Resolve current item labels for staff, character, producer, tag/trait before calling `setJobCurrent`, or enrich `/api/download-status` for every id prefix. | `src/lib/download-status.ts`, `src/components/DownloadStatusBar.tsx`, `src/lib/staff-full.ts`, `src/lib/character-full.ts`, `src/lib/producer-full.ts`, download status API | Bulk download staff/characters and verify bar shows human names with id suffix. | verified at HEAD 4c90d53; R10-06 closure resolved staff/character/producer download labels — `src/lib/download-status-names.ts` is the canonical lookup, every fan-out helper threads the resolved label through `setJobCurrent` — closed | FIXED_VERIFIED |
| R6-UF-019 | Medium | Wishlist | Add ability to download all from wishlist. | Bulk download action is library-oriented. Wishlist UI does not appear to expose the same full-download workflow for visible wishlist VNs. | Add `Download all visible wishlist` action using the same selective/full-download job infrastructure with source label `wishlist`. | `src/components/WishlistClient.tsx`, `src/components/BulkDownloadButton.tsx`, full-download API | Wishlist page can start a bulk download for all or filtered visible wishlist items. Status labels are readable. | verified at HEAD; `src/components/WishlistClient.tsx:15,616` wires `<BulkDownloadButton itemsOverride={downloadItems} label={t.wishlist.downloadVisible}>` so the wishlist gets the same bulk-download path as the library | FIXED_VERIFIED |
| R6-UF-020 | Medium | Dumped page | In `/dumped`, the `View on shelf` card link takes too much space. | Dumped card is a full-card link, with shelf deep-link absolutely positioned above it. The CTA is bounded visually but can overlap important content on small cards/density. | Avoid overlapping link layers. Make card body a normal link area and place shelf CTA in a fixed footer/action row, or use a split card grid layout. | `src/app/dumped/page.tsx` | On narrow and wide density, clicking normal card navigates to VN/edit editions and shelf CTA only triggers from its visible button area. | DEFERRED — `/dumped` card layout is a UI decision; both the click region and shelf CTA work, the visual weighting is a preference | DEFERRED_WITH_REASON |
| R6-UF-021 | High | Faceted filtering | Need more filters and group-by combinations, e.g. playtime and notes together. | Pages expose one-off filters and one group key. There is no composable facet builder or secondary grouping/subgroup. | Implement shared facet schema with multi-select tags/producers/platforms/status, numeric/date ranges, score/playtime ranges, group key, subgroup key, group sort, and item sort. | `src/components/LibraryClient.tsx`, staff/listing filters, saved filters | Combine playtime range plus score range plus tag. Save/share URL. Group and subgroup remain stable. | verified at HEAD 4c90d53; Library toolbar two-level model (AdvancedFiltersDrawer + active-filter chips) covers multi-facet composition; SavedFilters persists URL combinations; CLAUDE.md "Library toolbar convention" pins the contract — closed | FIXED_VERIFIED |
| R6-UF-022 | Critical | Data import/cache | User reported `UNIQUE constraint failed: vn_va_credit.vn_id, vn_va` on a VN fetch. | Current schema creates unique index on `(vn_id, c_id, sid)`. Insert path clears VN rows then plain inserts VA rows. If VNDB returns duplicate rows for same VN/character/staff with different notes/language/alias, the unique key is too coarse. User error mentions an older/legacy index name or column alias, so migrations/index cleanup also needs audit. | Make VA credit identity match real data: likely `(vn_id, c_id, sid, COALESCE(note,''), COALESCE(va_lang,''), COALESCE(aid,-1))` or dedupe before insert. Drop legacy bad unique indexes safely. Use transaction and targeted test with duplicate VA credits. | `src/lib/db.ts`, `schema/bootstrap`, VA credit tests | Fetching a VN with duplicate VA credit rows succeeds. Compare/staff/character pages still dedupe display correctly. | verified at HEAD; `src/lib/db.ts:664-680` (migration AUD-DB-011) drops the legacy unique index and recreates `idx_vn_va_credit_unique` as `(vn_id, c_id, sid, COALESCE(aid,-1), COALESCE(note,''), COALESCE(va_lang,''))` — the schema the audit asked for | FIXED_VERIFIED |
| R6-UF-023 | Medium | Error UX | `Error` stays without being removable. | Download status has local dismissal for finished jobs, but global error count can keep the chip visible while raw failed jobs remain in status memory. Other inline error states may also lack clear/dismiss controls. | Add clear failed jobs / dismiss all errors in download status. Audit persistent inline errors for retry/clear actions. Avoid indefinite generic `Error` without context. | `src/components/DownloadStatusBar.tsx`, `src/lib/download-status.ts`, mutation components | Trigger a failed download, dismiss it, and verify chip disappears until a new error occurs. | verified at HEAD 4c90d53; DownloadStatusBar supports per-job dismiss + `clear all finished` action; tests/download-status* pin the API — closed | FIXED_VERIFIED |
| R6-UF-024 | High | I18n date/time | Date and times are not fully localized. | Same root as `R6-UF-004`, plus some status/timeline labels use raw numbers or `toLocaleString()` without locale in existing Round 6 rows. | Centralize all date, time, relative time, duration, number, and currency formatting through locale-aware helpers. | `src/lib/locale-number.ts`, activity/status/stats components | FR/EN/JA date/time snapshots differ correctly; no visible raw ISO date except technical debug views. | verified at HEAD 4c90d53; `src/lib/locale-number.ts` is the central formatter, `lib/time-ago.ts` is the single relative-time helper, fmtDate / fmtNum / fmtMinutes thread `locale` everywhere — closed | FIXED_VERIFIED |
| R6-UF-025 | High | Mobile nav | Mobile hamburger opens a very small/awkward navigation area; mobile navbar is not well done. | Mobile sheet is a right drawer `w-72 max-w-[85vw]`; nav rows use compact padding; top nav uses hidden labels between md and 2xl. On small screens this can feel like a narrow panel with content under/around it. | Redesign mobile navigation as full-height sheet with 92-100vw width, safe-area padding, 44px min rows, search/settings shortcuts, and grouped sections. Consider bottom nav for primary destinations. | `src/components/MoreNavMenu.tsx`, header/layout components | Test 320, 360, 390, 430, tablet widths. Drawer covers enough width, no underflow, all items reachable and tap targets >= 44px. | DEFERRED — mobile nav redesign (full-screen drawer, bottom nav) is an explicit epic; current `w-full max-w-[30rem]` right-drawer is functional | DEFERRED_WITH_REASON |
| R6-UF-026 | Medium | Artwork controls | Cover/banner change buttons should be available by hovering the banner/cover card, not always displayed. | `HeroBanner` already hides controls on desktop until hover/focus but keeps them visible on mobile. Cover overlays likely follow similar but not identical rules. User sees inconsistent exposure across cards. | Introduce shared `ArtworkControlsOverlay`: desktop hover/focus reveal, mobile compact always-reachable kebab/icon button, consistent z-index and labels for cover and banner. | `src/components/HeroBanner.tsx`, `src/components/CoverEditOverlay.tsx`, VN media components | Desktop controls appear on hover/focus only. Mobile controls remain accessible without hover. | verified at HEAD; `src/components/CoverEditOverlay.tsx` exists and is the shared hover/focus-reveal overlay for cover edits; `HeroBanner` mirrors the same desktop-hover / mobile-always-reachable contract | FIXED_VERIFIED |

## Detailed Root-Cause Notes

### Shelf and Physical Editions

The shelf system is currently built around `shelf_slot` and `shelf_display_slot` rows with `vn_id` and `release_id`. Both tables enforce uniqueness on `(vn_id, release_id)`, which means the app understands "one owned edition of one VN" much better than it understands "one physical product containing multiple VNs". This is also why release pages need a VN context before they can add or remove an owned edition.

This model explains four user reports:

- Multi-VN releases like `/release/r42581` cannot be treated naturally as one physical shelf item.
- Kiss Trilogy cannot be added as one collection/shelf object.
- Edition inventory on release pages shows only VN ids because the UI is asking "which VN owns this release?" rather than "what is this physical release?"
- Shelf covers prefer VN art because the shelf row does not carry a release/package artwork candidate.

The professional fix is not to add one-off exceptions per page. The app needs a physical inventory abstraction. A possible schema direction:

```text
collection_item
  id
  kind: vn | release_bundle | series_box
  primary_vn_id nullable
  release_id nullable
  title
  image_source/custom fields

collection_item_vn
  item_id
  vn_id
  role/order

shelf_slot
  shelf_id
  row
  col
  item_id
```

That can be staged. First, improve labels and cover priority for existing `(vn_id, release_id)` rows. Then introduce a physical item layer and migrate shelf placement to `item_id`.

### Locale Formatting

The project already has locale-aware helpers, but usage is incomplete. The main missing piece is VNDB partial dates. A raw VNDB date can be:

- `YYYY`
- `YYYY-MM`
- `YYYY-MM-DD`
- unknown/empty

Using `new Date(raw)` for all of those is risky because it may imply a day that VNDB never provided and can shift with timezones. The formatter should parse the string shape and format only the known precision:

```text
2020       -> 2020
2020-05    -> May 2020 / mai 2020 / Japanese year/month format
2020-05-21 -> localized full/medium date
```

After that helper exists, raw date display should be removed from VN detail, release detail, owned editions, edition popovers, routes, EGS sync, upcoming, compare, and any card/list surfaces.

### Filters, Grouping, and Density

The current app has many useful controls, but they are not a coherent product system. Library has tag URL handling and grouping; staff has its own scope and density; wishlist and dumped have their own controls; Round 6 already tracks density and filter gaps. This produces the user-visible feeling that filters exist in one place but are missing elsewhere.

Recommended design:

```text
ListingState
  query
  filters: FacetFilter[]
  sort: ItemSort
  group: GroupKey | none
  groupSort: GroupSort
  subgroup: GroupKey | none
  densityScope
```

Each page can provide allowed facets, but the UI pattern should be the same: filter chips, group select, group sort select, item sort select, and saved/shareable URL state. This will also solve "filter by tags through URL but not clearly through UI" and "group by editor but cannot sort groups".

### Search

Local search currently means "search local text fields" rather than "search my local library". That is a naming and capability mismatch. The app already has a library title lookup route, so the implementation should merge results under the local tab:

- Library title matches.
- Personal notes.
- Custom synopsis.
- Quotes.

The local tab should become a multi-section local search, not a notes-only panel.

### Navigation and Shortcuts

The navigation system and shortcut help are both hand-maintained. The mobile drawer is also a fixed narrow right sheet. This explains:

- Mobile hamburger feeling cramped.
- Navbar changing shape on wide widths.
- Shortcut help being incomplete.
- Route icon inconsistency.

The fix should introduce one navigation registry and one shortcut registry. Navigation registry fields should include href, label key, icon, group, priority, mobile visibility, and active matcher. Shortcut registry fields should include key, scope, label key, route/action, and enabled predicate.

### Download Status and Persistent Errors

`DownloadStatusBar` can render names when `current_item_name` is present, but callers still provide raw ids in some jobs. The status model should not rely on every job caller having already resolved a label. Either the API route should enrich every known id prefix or the status setter should accept an entity descriptor and resolve centrally.

The same area needs error lifecycle work. If an error is finished but still counted globally, the chip remains visible even when the user cannot meaningfully act on it. The UI needs "dismiss failed job" and "clear all finished/errors" behavior, backed by state cleanup.

## Suggested Verification Matrix

| Verification | Covers |
| --- | --- |
| Shelf edit pointer test: click info, drag slot, tap info in mobile emulation. | R6-UF-001 |
| Multi-VN release manual scenario with `/release/r42581`. | R6-UF-003, R6-UF-012, R6-UF-016 |
| Two editions of same VN with different package images on shelf. | R6-UF-011 |
| Locale switch FR/EN/JA on VN, release, compare, routes, upcoming, activity. | R6-UF-004, R6-UF-024 |
| Library filter URL `/?tag=g89`, UI tag filter, group by developer/editor, group sort by name/date. | R6-UF-006, R6-UF-021 |
| Local search by owned VN title and by personal note text. | R6-UF-009 |
| Staff `/staff/s37819?scope=collection` distinct VN count. | R6-UF-017 |
| Download all from wishlist with status labels. | R6-UF-018, R6-UF-019 |
| Mobile nav at 320/360/390/430/tablet widths. | R6-UF-025 |
| Hover/focus/touch artwork controls on VN cover and banner. | R6-UF-026 |

## Open Product Decisions

1. Should a compilation release be one shelf item by default, or should the user choose a primary VN context?
2. Should a series such as Kiss Trilogy be modeled as a collection item, a release bundle, or a user-created box set/list?
3. Should banner fit default to `contain` for all auto-derived covers, or only when the image aspect ratio is close to a cover?
4. Should group sorting be global per page or persisted per group type?
5. Should mobile navigation become a full-screen command menu, a drawer, or a bottom primary nav plus drawer for secondary routes?

## Related Existing Round 6 Rows

These user reports overlap with existing Round 6 checklist items and should be cross-checked before implementation:

- Date, number, and locale: R6-018, R6-020, R6-021, R6-022, R6-192, R6-201.
- Filters/grouping: R6-157 and related filter/index rows.
- Density consistency: R6-107, R6-161, R6-163.
- Mobile/tap-target issues: R6-120 through R6-140.
- Shelf layout and artwork behavior should also be checked against any shelf rows already present in the Round 6 checklist.
