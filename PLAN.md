# Implementation plan — history & active backlog

This file captures the planned-and-shipped batches of features. The
running catalogue of what exists today lives in **FEATURES.md**;
architecture / conventions in **CLAUDE.md**; user-facing tour in
**TUTORIAL.md**. Read those first if you're new — this doc is mostly
for traceability.

The plan is intentionally executable: every section names the files
that change, the DB shape, the API surface and the rough size estimate.
Each feature ships as its own commit so a regression can be reverted
in isolation.

---

## Batch A — initial feature dump (2026-05-12) — shipped ✅

1. Random pick / wheel (`RandomPickButton`).
2. Tag co-occurrence graph (`TagCoOccurrence` + `getCoOccurringTags`).
3. Reading speed estimator (`ReadingSpeedBadge`).
4. Voice-actor heatmap (`VaTimeline`).
5. Quick-actions on cards (`CardContextMenu`).
6. Export ICS / CSV / JSON (three `/api/export/*` routes).
7. Reading log / activity timeline (`vn_activity` + `ActivityTimeline`).
8. Recommendations from VNDB tags (`/recommendations`).
9. Calendar of upcoming releases (`/upcoming`).
10. Series auto-detect (`SeriesAutoSuggest`).
11. Comparison view + similar suggestions (`/compare`).

Rollout order followed the dependency chain — independent / low-risk
items first (1-3), reading log before recommendations (introduces a
new table that needs a clean "Download all" run after migration),
comparison view last (depends on the recommendations helper).

---

## Batch B — UX polish + reliability pass (2026-05-14) — shipped ✅

### B.1 Cover quality & lazy-load reliability

| | |
| --- | --- |
| **`image_url` over `image_thumb`** | Every poster render now prefers the full-res `image_url`. Thumbnails were dulling Relations, Library, Series, Staff, ReadingQueue. |
| **`SafeImage` IntersectionObserver** | Native `loading="lazy"` was failing on grid layouts. Rewrote to use `IntersectionObserver` with `rootMargin: 500px`, plus a state reset when the underlying URL changes (recycled cards in virtualised lists no longer inherit a stale "errored" flag). |
| **Upcoming local cover fallback** | When VNDB returns `vns[].image=null` for an upcoming release, the page looks the VN up in the local DB and overlays its `image_url/image_thumb/local_image`. Anticipated and collection items always render a poster now. |

### B.2 EGS cover resolver rewrite

| | |
| --- | --- |
| **Tiered chain** | banner_url → linked VNDB cover (via `egs_game.vn_id`) → probed EGS image.php → first shop URL. Anticipated entries now get the high-quality VNDB cover when EGS has mapped them. |
| **Neg-cache TTL** | 24h → 1h. Freshly-published banners surface within an hour. |
| **Single GET probe** | Dropped the HEAD+GET race; one GET with `Range: bytes=0-0` and a 3.5s timeout. |
| **Refresh-busts-cache** | `POST /api/refresh/global` now `DELETE`s every `egs:cover-resolved:%` row so users can force a re-resolve. |

### B.3 Data freshness chip + per-page Refresh

- New `RefreshPageButton` renders a tiered "Data Xh ago" chip alongside
  the existing Refresh button on every browse / discovery page.
- Server-side `getCacheFreshness(patterns: string[])` helper returns
  `MAX(fetched_at)` for any cache rows matching the supplied LIKE
  patterns.
- Tiered relative-time util `src/lib/time-ago.ts` — minute → hour → day
  → week → month → year. Used by `RefreshPageButton`, `GameLog`, and any
  future surface that needs relative time.
- i18n: new `timeAgo.*` group across FR / EN / JA.

### B.4 Game log

- New table `vn_game_log(id, vn_id, note, logged_at, session_minutes,
  created_at, updated_at)`.
- New component `GameLog` with day-grouped entries, ⌘/Ctrl+Enter
  submit, character counter, hover-revealed Edit/Delete.
- New `SessionPanel` wraps `PomodoroTimer` + `GameLog` and lifts the
  timer's elapsed-minute count so the log can offer to stamp notes
  with the running session length.
- Routes: `GET/POST/PATCH/DELETE /api/collection/[id]/game-log`.
- i18n: new `gameLog.*` group across FR / EN / JA.

### B.5 Misc UX

- `QuoteFooter` shrunk to 20px tall; DSB raised from `bottom-0` to
  `bottom-5` so the two stop overlapping.
- `CachePanel` on `/stats` collapsed by default — uncollapses on click.
- `RelationsSection` cards now use full-res `image_url`.

---

## Batch C — universal lists, favorites, cover picker, content controls (2026-05-14) — shipped ✅

### C.1 Universal Lists

- New tables: `user_list`, `user_list_vn`.
  - `user_list_vn.vn_id` has **no FK** to `vn(id)` so anticipated /
    wishlist entries can be tracked.
- DB helpers: `listUserLists`, `getUserList`, `createUserList`,
  `updateUserList`, `deleteUserList`, `listUserListItems`,
  `listListsForVn`, `listAllListMemberships`, `addVnToList`,
  `removeVnFromList`, `reorderListItems`.
- API routes:
  - `GET / POST /api/lists`
  - `GET / PATCH / DELETE /api/lists/[id]`
  - `POST / DELETE /api/lists/[id]/items`
  - `GET /api/vn/[id]/lists`
- UI components:
  - `/lists` page (`CreateListForm`, `ListCardActions`).
  - `/lists/[id]` detail page (`ListMetaEditor`, `ListAddVnForm`,
    `ListRemoveVn`, VnCard grid with stubs for unknown VNs).
  - `ListsPickerButton` overlay on every `VnCard` + inline pill on
    detail pages.
  - `VnListMemberships` chips under the VN title.
- Nav: top-level "Lists" entry between Wishlist and Search.
- i18n: new `lists.*` group across FR / EN / JA.

### C.2 Favorite hover toggle

- New `FavoriteToggleButton` — overlay heart at top-left of every
  `VnCard`, inline pill in the VN detail action bar.
- Always tappable on mobile / tablet (no `hidden sm:inline` traps).
- Auto-adds a search hit to collection (`status='planning'`) before
  flipping favorite if the VN isn't tracked yet.
- Optimistic update with rollback on error.

### C.3 Cover source picker

- New `CoverSourcePicker` modal triggered from the VN detail action
  bar.
- Three tabs: VNDB (revert), EGS (use `/api/egs-cover/<id>`), Custom
  (file / URL / pick from in-VN gallery).
- Current pick is ring-highlighted; initial tab is inferred from
  `currentCustomCover`.

### C.4 Content controls hub (closed-eye icon)

- Expanded `SpoilerToggle` — was just the spoiler level dropdown,
  now a full popover with spoiler / hide images / blur R18 / hide
  sexual / NSFW threshold slider / show sexual traits + "All
  settings…" jump.
- `SettingsButton` listens for `vn:open-settings` `CustomEvent` so
  the eye popover can open the canonical settings modal.
- Eye icon switches `Eye` ↔ `EyeOff` based on whether any non-default
  safety gate is active.
- i18n: new `contentControls.*` group across FR / EN / JA.

### C.5 List membership chips on VN detail

- New `VnListMemberships` — server-rendered strip of chips under the
  VN title, one per list this VN belongs to, with one-click remove.

---

## Batch D — playtime + cover/banner upload + refresh fixes (2026-05-14) — shipped ✅

### D.1 Four-way playtime model

- Three independent sources (`vn.length_minutes`, `egs_game.playtime_median_minutes`,
  `collection.playtime_minutes`) plus a fourth virtual **All** column
  that averages every populated source.
- New sort keys end-to-end (`ListOptions['sort']`, `sortMap` SQL,
  `VALID_SORTS` in `/api/collection` + `/api/settings`, `SortKey`
  unions in `LibraryClient` + `SettingsButton`, `library.sort.*`
  i18n in FR/EN/JA): `playtime`, `length_minutes`, `egs_playtime`,
  `combined_playtime`.
- New `PlaytimeCompare` component on `/vn/[id]` (four columns) writes
  `source_pref.playtime` (was dead code).
- `VnCard` renders the **All** value as the primary playtime chip with
  the per-source breakdown beneath + a tooltip listing every source.

### D.2 EGS cover resolver — server-side proxy

- `/api/egs-cover/[id]` no longer 302-redirects cross-origin. It
  fetches upstream bytes server-side and streams them back with a
  clean `Content-Type` and 24 h public cache header.
- Same-origin `/api/files/<path>` targets still 302 — no need to
  proxy what the user can reach directly.
- Anticipated cards on `/upcoming?tab=anticipated` now use a batched
  `fetchVnCovers(ids)` to pull VNDB covers directly when a row is
  mapped to a VNDB id; only unmapped EGS rows fall through to the
  resolver.

### D.3 Cover & banner pickers reachable, defaults to Custom

- `CoverEditOverlay` always-tappable pill on the cover image itself
  (top-right corner, hover-revealed on desktop, always tap on touch).
  Dispatches `vn:open-cover-picker` which the existing
  `CoverSourcePicker` listens for. Single modal, multiple triggers.
- `CoverSourcePicker` + `BannerSourcePicker` default to the **Custom**
  tab so the file-upload affordance is on screen immediately. Tab
  order: Custom → VNDB → EGS (cover), Custom → Default (banner).
- Tab labels renamed across FR/EN/JA — "Cover source" → **"Change
  cover"** etc. so the upload entry-point is named what users look for.

### D.4 Whole-card drag in custom-order mode

- Removed the GripVertical handle. The whole card is now the drag
  surface, dnd-kit PointerSensor's 6 px activation lets clicks pass
  through to the underlying `<Link>` + the heart / lists overlays.
- Wrapper carries `block w-full min-w-0` so the post-drop card stays
  bound to its grid column.
- New `dense` prop on `SortableGrid` so the comfortable/dense toggle
  works in `sort=custom` mode.

### D.5 Refresh button actually refreshes

- `/api/refresh/global` now **busts the relevant cache rows first**
  then re-fetches. Without the bust step the helpers were reading
  through the still-fresh cache and `fetched_at` never moved — the
  button felt like a no-op.
- Bust list: `egs:cover-resolved:%`, `anticipated:%`, `% /stats|%`,
  `% /schema|%`, `% /authinfo|%`, `% /release|%`, `% /release:%`,
  `% /producer|%`, `% /producer:%`, `% /tag|%`, `% /trait|%`.
- Re-fetch list adds `searchTags('', { results: 60 })` and
  `searchTraits('', { results: 60 })` so the chip on `/tags` and
  `/traits` reads "just now" after a refresh.
- Freshness chip pulled from `/stats`, `/data`, `/producers` —
  those pages are local-only SQL, the chip there only ever lied.
- `RefreshPageButton` SSR render: `now` defaults to `lastUpdatedAt`
  so first paint reads "just now" instead of a raw timestamp.
  Client useEffect re-syncs to `Date.now()` + tick every 30 s.
- `getCacheFreshness` LIKE patterns fixed across all callers — keys
  are stored `{METHOD} {path}|{METHOD}|{hash}`, not `/path|`. Old
  patterns never matched, so the chip always said "Never" even when
  the cache was perfectly populated.

### D.6 Other UX

- `/api/download-status` polling: 1.5 s / 10 s → 4 s / 60 s, paused
  on `document.visibilityState === 'hidden'`, resumes on focus.
  Stops flooding the server log during long bulk runs.
- GameLog placeholder: removed the Fate spoiler ("Saber dies in
  chapter 4") across FR/EN/JA.
- Tour: new **Lists** step + refreshed `vnpage` body to mention
  PlaytimeCompare, cover/banner pickers, lists picker, game log.

---

## Batch E — publishers, View on EGS, producer fallback, anticipated skeleton (2026-05-14) — shipped ✅

### E.1 Publishers as a first-class field

- New `vn.publishers` JSON column (`ensureColumn`).
- `setVnPublishers(vnId, publishers[])` helper in `lib/db.ts`.
- `fetchAndDownloadReleaseImages()` in `lib/assets.ts` now also walks
  every release's `producers[]` where `publisher: true`, dedupes by
  id, and writes the result via `setVnPublishers`. So both the
  individual add (`POST /api/collection/[id]`) and the bulk refresh
  (`POST /api/collection/[id]/assets?refresh=true`) populate
  publishers — no separate fetch.
- `ListOptions` gains `publisher?: string`; `listCollection` SQL
  matches against `v.publishers` independently of the existing
  developer filter. Both filters are exposed as `?producer=` and
  `?publisher=` on `/api/collection`.
- `/vn/[id]` renders a "Publishers" chip row right under the
  developer compare; each chip is a link to `/producer/[id]`.
- `CollectionItem.publishers` + `VnRow.publishers` types updated.

### E.2 View on EGS button

- The action bar on `/vn/[id]` now renders both "View on VNDB" and
  "View on EGS" side by side whenever the VN has both ids. Previously
  it was an either/or block — EGS-only synthetic entries showed EGS,
  everything else showed VNDB. New shape:
    - Non-`egs_` VN → always shows VNDB.
    - Any VN with an EGS row → also shows EGS.
- i18n: `detail.viewOnEgs` already existed; no new key needed.

### E.3 Graceful producer page + generic not-found

- `/producer/[id]` no longer calls `notFound()` when the VNDB fetch
  fails AND the local producer cache is empty. Falls back to the
  name credited on any in-collection VN (developer OR publisher
  side), and lists the VNs from the user's collection. Only 404s
  when there's literally no local trace.
- The global `not-found.tsx` template was hardcoded to "VN not
  found" (`t.detail.notFoundTitle`) but is used by every notFound()
  across the app — producer, staff, character, series, list. It now
  reads `t.common.pageNotFound` ("Page not found") + a generic body
  hint. FR/EN/JA keys added.

### E.4 Anticipated skeleton matches the 2-col layout

- `UpcomingTabSkeleton` for `tab === 'anticipated'` was a generic
  card grid. Replaced with a 2-per-row skeleton that mirrors the
  real card shape (h-48 w-32 poster on the left, info column on
  the right with bold title, ratings line, three big intent badges,
  external-link row). The page no longer reshapes when the data
  resolves.

---

## Batch F — Producer / Developer / Publisher end-to-end (2026-05-15) — shipped ✅

VNDB models three things — the producer entity, the developer role,
the publisher role — and previously the UI conflated them. This
batch threads the distinction through every surface.

### F.1 `/producer/[id]` shows BOTH roles

- New `src/lib/producer-associations.ts`: `fetchProducerAssociations(p)`
  paginates `POST /vn` with `developer = p` (3 pages) for developer
  credits AND `POST /release` with `producer = p` (5 pages) walking
  `producers[].publisher = true` for publisher credits. The two
  arrays are deduped so a VN credited as developer drops out of
  the publisher list.
- New `src/app/api/producer/[id]/refresh/route.ts`: busts the
  `POST /vn:producer|%` + `POST /release:producer|%` cache rows
  then re-fetches.
- New `<ProducerVnsSections>` server component renders two
  distinct cards — "As developer" and "As publisher" — each with
  owned/total counts, covers, and inline "+" buttons for the
  missing VNs.
- New `<ProducerRefreshButton>` client component (toasts the
  live dev/pub/owned counts and `router.refresh()`es).
- Old `ProducerCompletion` (dev-only) and `VnGrid` (local-only) are
  deleted — they were the source of the "only shows 1 VN" bug on
  publisher-only producers.

### F.2 `/producers` two-tab ranking

- New `listPublisherStats()` in `lib/db.ts`, symmetric to
  `listProducerStats()`, indexed on `vn.publishers`. A publisher-only
  studio (Mangagamer, JAST, NekoNyan…) appears only under the
  Publishers tab.
- `/producers` page rebuilt as two-tab UI (URL `?role=publisher` to
  switch). Each tab shows count, average user rating, average VNDB
  rating, role-specific empty state.

### F.3 Stats page producer breakdown

- New `<ProducerRankCards>` section on `/stats`: two side-by-side
  horizontal bar charts — "Top developers" and "Top publishers" —
  top 10 each, bars link to the corresponding `/producer/[id]`.
- i18n keys `charts.topDevelopers` / `charts.topPublishers` (FR/EN/JA).

### F.4 Card-level publisher chip + context menu

- `CardData` gains a `publishers?` field; `VnCard` renders a second
  chip (`Package` icon) listing publishers that are NOT also
  credited as developer (self-publishing studios stay in the
  developer chip only, no doubles).
- `CardContextMenu` accepts a `publisher` prop and renders "Open
  publisher" / "Filter by this publisher" rows alongside the
  developer ones. Each row is conditional on the role being known.
- Every card feeder threads `it.publishers` through: `SortableGrid`,
  `LibraryClient`, `RelationsSection`, `WishlistClient` (typed
  optional since `/ulist` doesn't expose publishers), `series/[id]`,
  `lists/[id]` (raw SQL gains `v.publishers` + parser reuse).

### F.5 Library filter / sort / group on publisher

- `?publisher=p123` filter input added next to the developer
  dropdown — both visible at all times, never collapsed.
- `sort=publisher` orders by `json_extract(v.publishers, '$[0].name')`.
- `group=publisher` axis added (one row per publisher, multi-VN
  collapses into the publisher's bucket).
- i18n: `library.filterByDeveloper` / `library.filterByPublisher`,
  `library.sort.producer` / `library.sort.publisher`,
  `library.groupDeveloper` / `library.groupPublisher`,
  `quickActions.openDeveloper` / `openPublisher` /
  `filterSameDeveloper` / `filterSamePublisher`. The existing
  `filterSameProducer` / `groupProducer` keys are aliased to the
  developer side (FR/EN/JA).

### F.6 `/api/producers` returns both arrays

- `GET /api/producers` now returns `{ producers, publishers }` —
  one round-trip drives both filter dropdowns.

---

## Batch G — seiyuu thumbs, shelf tabs, EGS parity, dumped page (2026-05-15) — shipped ✅

### G.1 Seiyuu page character thumbnails

- `listStaffVaCredits()` now `LEFT JOIN`s `character_image` so each
  voiced character carries `local_image`.
- `/staff/[id]` Voice section renders each VN as a full `VnCard` with
  the character thumbs inline beneath. Synthetic `egs:*` cards
  suppress the VNDB external link button.
- One-click jump from a character thumb to `/character/[id]`.

### G.2 Shelf — per-release vs per-VN tabs

- `/shelf?view=release|item` toggle. Per-item is the original card-
  per-edition view. Per-VN collapses multiple editions of the same
  VN into a single card with edition count + distinct locations +
  per-currency totals.
- Currency rendering switched to `Intl.NumberFormat(locale, {style:
  'currency', currency})` so JPY → ¥, EUR → €, USD → $.
- Multi-tag physical locations render the secondary tags as a
  smaller second line (e.g. *Living room · Shelf B · Floor 2 · Row 3*).

### G.3 Synthetic releases for EGS-only / no-release VNs

- New release id shape `synthetic:<vnId>` accepted by
  `/api/collection/[id]/owned-releases` via `validateReleaseId` —
  either a real `r\d+` or the literal `synthetic:<vnId>` for the
  current VN. Rejects everything else.
- `OwnedEditionsSection` shows a "Main edition" synthetic tile in
  the adder when `releases.length === 0`.
- Shelf detects `release_id.startsWith('synthetic:')` and renders
  plain text instead of a broken `/release/[id]` link. Synthetic
  rows still carry an "EGS" chip when the VN is EGS-only.

### G.4 Multi-source EGS cover picker

- New endpoint `GET /api/egs-cover/[id]/candidates` enumerates every
  known source — banner_url, linked VNDB cover, `image.php`,
  Suruga-ya, DMM, DLsite, Gyutto — **without probing** (keeps the
  response fast and stateless).
- `CoverSourcePicker` EGS tab now embeds `<EgsCandidateGrid>` —
  side-by-side tiles, each one a one-click "pin as `custom_cover`"
  via `POST /api/collection/[id]/cover {source:'url', value:<absolute>}`.
- "Use EGS auto" button preserves the original priority-fallback
  resolver behavior for users who want it.
- SSRF allowlist updated: `www.suruga-ya.jp` added (was `.com`,
  mismatched the shop URLs the candidates endpoint actually generates).

### G.5 `/dumped` management page

- `listDumpStatus()` + `getDumpSummary()` aggregation helpers in
  `lib/db.ts`. Returns per-VN dumped/total edition counts +
  global completion %.
- `/dumped` renders a stats grid (total editions, dumped editions,
  fully-dumped VNs, completion %) with a top progress bar and a card
  per VN with its dumped ratio + mini progress bar. Fully-dumped
  VNs flagged with a green border + checkmark.

### G.6 `/egs` page parallel to `/steam`

- New page at `src/app/egs/page.tsx` mirroring `/steam`. Lists every
  EGS-linked VN in the collection with EGS median, EGS playtime,
  resolution source (`auto` / `manual` / `search`), plus the
  `EgsSyncBlock` for bulk pull.
- Wired into `MoreNavMenu` Insights group alongside `/steam`.
- Wired into the `/data` page EGS section with an "Open EGS" CTA.

### G.7 Data page — emojis → lucide icons + Selective full download surface

- All section headers on `/data` use lucide icons (`QrCode`,
  `Gamepad2`, `BookMarked`, `HardDriveDownload`, `Sparkles`).
- Selective full download remains on `/data` under its own
  section with a `Download` icon — earlier hidden visually
  because it lacked a header icon.

### G.8 Drag-and-drop shelf layout

- New tables `shelf_unit(id, name, cols, rows, …)` +
  `shelf_slot(shelf_id, row, col, vn_id, release_id, placed_at)`
  with UNIQUE on `(vn_id, release_id)` (one slot per edition) and
  PK on `(shelf_id, row, col)` (one edition per slot).
- DB helpers: `listShelves`, `getShelf`, `createShelf`,
  `renameShelf`, `resizeShelf` (returns evicted set when shrinking),
  `deleteShelf`, `reorderShelves`, `listShelfSlots`,
  `listUnplacedOwnedReleases`, `placeShelfItem` (handles swap
  semantics atomically), `removeShelfPlacement`,
  `getShelfPlacementForEdition`.
- API: `GET /api/shelves[?pool=1]`, `POST /api/shelves`,
  `PATCH /api/shelves` (reorder), `GET /api/shelves/[id]`,
  `PATCH /api/shelves/[id]` (rename / resize),
  `DELETE /api/shelves/[id]`, `POST /api/shelves/[id]/slots`
  (place / swap), `DELETE /api/shelves/[id]/slots` (unplace).
- Third tab on `/shelf?view=layout` renders the new
  `<ShelfLayoutEditor>` (client component). DnD via @dnd-kit:
  Pointer (6 px), Touch (150 ms long-press), Keyboard sensors.
  Optimistic state with rollback on error.
- Tour step `shelfLayout` added; nav entry stays under `/shelf`
  (the layout is a sub-view, not a separate route).

---

## Future / backlog

Items that have been sketched but not started:

- **Recursive list operations** — "Remove every VN tagged X from this
  list", "Add every VN by producer Y", scriptable via the existing
  `/api/lists/[id]/items` POST with arrays.
- **List import / export** — JSON serialise + dedupe by slug on import.
- **Shared list URLs** — token-protected read-only views for
  recommending a list to a friend.
- **List drag-reorder UI** — the `reorderListItems` helper exists,
  the UI doesn't. dnd-kit, same pattern as the custom-sort library.
- **Lists in `/compare`** — pick a list to compare every member side
  by side.
- **Calendar dot on Game log day groups** — heatmap-style summary on
  `/year`.
- **Mobile FAB for favorite / list** — fixed-position floating action
  button when scrolled below the action bar on detail pages.

---

## Cross-cutting concerns

### URL state vs React state

Per `CLAUDE.md` "filters / sort / new state lives in the URL, not in
`useState`": comparison selection, recommendations seed, calendar month
filter — all live in URL params so the back button works. Lists are
URL-addressable too (`/lists/<id>`).

### i18n

Every feature adds keys in FR / EN / JA. Run `tsc --noEmit` after each
so the strict-shape check on `Widen<typeof dictionaries['fr']>` catches
missed locales.

### Tests

Same convention as today — `npm run build` + `bash scripts/smoke.sh`
are the gates. Smoke covers every page + the critical API endpoints.

### Performance

Most reads are SQLite queries on already-indexed columns. The two
queries that could get slow:

- **Tag co-occurrence**: O(N × tagsPerVn²) over the collection.
  Acceptable for collections ≤ a few thousand; if it ever becomes a
  bottleneck we add an inverted index `vn_tag(vn_id, tag_id)`
  mirroring the existing JSON column.
- **VA heatmap**: already indexed via `vn_va_credit(sid)`.
- **List membership lookup on cards**: `listAllListMemberships()`
  returns a `Map<vn_id, UserList[]>` in one query; passing the count
  down to `VnCard.listCount` keeps card rendering O(1) per row.

### Rollout order

Each step is independently mergeable. After every step, run
`npm run build` + `bash scripts/smoke.sh` and click through the changed
surface.
