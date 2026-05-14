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
