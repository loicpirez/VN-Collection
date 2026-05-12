# Implementation plan — feature batch 2026-05-12

This document captures the scope, design and rollout plan for the next twelve
features. It is paired with the existing **CLAUDE.md** (architecture / conventions)
and **README.md** (user-facing overview). Read both before touching the code.

The plan is intentionally executable: every section names the files that
change, the DB shape, the API surface and the rough size estimate. Each
feature ships as its own commit so a regression can be reverted in isolation.

---

## 0. Urgent fixes (landed first)

| | |
| --- | --- |
| **Banner position edit** | The position editor was gated on `customBanner` only. Now also enabled for the auto-derived blurred cover. |
| **Custom cover when no cover** | The full `CoverUploader` card lived only at the bottom of the page; users with no cover at all didn't know it existed. Added an inline `variant="inline"` rendered over the empty cover slot. |

---

## 1. Random pick / wheel

**Goal**: "what should I play next" — one click pulls a random VN from the
filtered set. Respects all current filters (status, language, length cap, NSFW
threshold).

**Scope**:
- New button in `LibraryClient` toolbar, next to `Réordonner`.
- Reuses the already-applied filter URL params — we just need a deterministic
  random shuffle. Implemented client-side (`Math.random()` over the loaded
  array) so no extra round-trip.
- Lands the user on `/vn/[id]` with a transient toast: "Picked at random".

**Files**:
- `src/components/RandomPickButton.tsx` (new)
- `src/components/LibraryClient.tsx` (insert button)
- i18n: `library.randomPick.*`

**Size**: tiny. ~80 LOC.

---

## 2. Tag co-occurrence graph

**Goal**: given a VN, "tags that frequently co-occur with this VN's tags
across your collection" — surfaces your real taste clusters.

**Scope**:
- Pure read query against the existing `tags` JSON column on `vn`.
- New helper `getCoOccurringTags(vnId, limit)` in `db.ts`:
  - Read the VN's top-N tags.
  - For each tag, count how many other VNs in the collection have it.
  - Return a sorted list of co-occurring tags with overlap counts.
- New section on `/vn/[id]` and a chart-style list — bars proportional to count.

**Files**:
- `src/lib/db.ts`: helper.
- `src/components/TagCoOccurrence.tsx` (new).
- `src/app/vn/[id]/page.tsx`: render section.
- i18n: `tags.cooccurrence.*`

**Size**: small. ~150 LOC.

---

## 3. Reading speed estimator

**Goal**: "you typically read X% faster/slower than the VNDB average". When
the user finishes a VN with a recorded `playtime_minutes`, derive a personal
speed multiplier and use it to predict reading time on every other VN.

**Sources**:
- VNDB `length_minutes` (community average).
- EGS `playtime_median_minutes` (Japanese audience).
- User's `playtime_minutes` on `completed` entries.

**Scope**:
- New helper `getReadingSpeedProfile()` in `db.ts`:
  - Iterates all `status='completed'` rows with both `playtime_minutes > 0`
    and a non-null `length_minutes`.
  - Computes the median ratio `playtime / length` (median resists outliers).
  - Also returns the count of samples + comparison vs EGS.
- Component `ReadingSpeedBadge` shown on VN detail next to the existing
  "Length" row: "VNDB: 16h · EGS: 12h · You: ~14h (×0.88)".
- Standalone section on `/stats` summarising the profile across the full
  library.

**Files**:
- `src/lib/reading-speed.ts` (new helper, kept out of `db.ts` to avoid bloat).
- `src/components/ReadingSpeedBadge.tsx` (new).
- `src/app/vn/[id]/page.tsx`: render badge.
- `src/app/stats/page.tsx`: add a card.
- i18n: `readingSpeed.*`

**Size**: small. ~200 LOC.

---

## 4. Voice actor heatmap

**Goal**: On `/staff/[id]` for a VA, render a year-by-year heatmap of how
many characters they voiced and which VNs are in your collection.

**Scope**:
- The credits already live in `vn_va_credit`. We add a query helper
  `getVaTimeline(sid)` that returns
  `[ { year: 2014, total: 6, inCollection: 2 }, ... ]` derived from
  `vn.released`.
- Component `VaTimeline` rendered above the existing voice-credits list.
- Each cell links to `/?seiyuu=sid&year=YYYY` (filter passes through library).

**Files**:
- `src/lib/db.ts`: helper.
- `src/components/VaTimeline.tsx` (new).
- `src/app/staff/[id]/page.tsx`: render.
- i18n: `staff.timeline.*`

**Size**: small. ~120 LOC.

---

## 5. Quick-actions on cards

**Goal**: right-click (or long-press) a tile in the library → contextual menu
with the most common actions: change status, mark favourite, jump to producer,
add to series.

**Scope**:
- New `CardContextMenu` component using the native `<dialog>` element for
  keyboard / focus handling.
- Hook into the existing card click handler in `LibraryClient` — left-click
  navigates as before, right-click opens the menu.
- Actions reuse existing API routes (`PATCH /api/collection/[id]`).

**Files**:
- `src/components/CardContextMenu.tsx` (new).
- `src/components/LibraryClient.tsx`: wire up.
- i18n: `quickActions.*`

**Size**: medium. ~250 LOC.

---

## 6. Export ICS / CSV / JSON

**Goal**: shareable / portable snapshots. JSON already exists (the existing
backup endpoint). Adding CSV (one row per VN, flat columns) and ICS
(calendar entries for `started_date` / `finished_date`).

**Scope**:
- New routes:
  - `GET /api/export/csv` → `text/csv` attachment.
  - `GET /api/export/ics` → `text/calendar` attachment.
  - `GET /api/export/json` → already covered by `/api/backup`, alias for symmetry.
- UI: new "Export" card on `/data` page.

**Files**:
- `src/app/api/export/csv/route.ts` (new).
- `src/app/api/export/ics/route.ts` (new).
- `src/app/data/page.tsx`: add buttons.
- i18n: `export.*`

**Size**: small. ~250 LOC.

---

## 7. Reading log / activity timeline

**Goal**: per-VN journal of when status changed, when notes were added, when
the user logged playtime. Builds an audit trail of "what did I do with this
VN" — useful for re-reads, splits across sessions.

**Scope**:
- New table `vn_activity`:
  ```sql
  CREATE TABLE vn_activity (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    vn_id     TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
    kind      TEXT NOT NULL,   -- 'status' | 'playtime' | 'note' | 'rating' | 'manual'
    payload   TEXT,            -- JSON: { from, to, delta, text, ... }
    occurred_at INTEGER NOT NULL
  );
  CREATE INDEX idx_vn_activity_vn ON vn_activity(vn_id);
  ```
- Hook into `updateCollection`: when status / playtime / rating / notes
  changes, write an activity row in the same transaction.
- New section `ActivityTimeline` on `/vn/[id]` after Routes.
- Optional manual entry: free-form text + date.

**Files**:
- `src/lib/db.ts`: schema + `logActivity` helper, wire into `updateCollection`.
- `src/components/ActivityTimeline.tsx` (new).
- `src/app/api/collection/[id]/activity/route.ts` (new — POST for manual entries).
- `src/app/vn/[id]/page.tsx`: render section.
- i18n: `activity.*`

**Size**: medium. ~400 LOC.

---

## 8. Recommendations from VNDB tags

**Goal**: "you rated A, B, C high → here are VNs you don't own that share
tags with them". Uses VNDB's `/vn` search filtered by tags.

**Scope**:
- New `recommend()` helper that:
  1. Reads the user's top-10 highest-rated VNs.
  2. Extracts their top-3 tags each (deduped).
  3. Queries `POST /vn` with `["and", ["tag","=","gXX"], ["id","!=","..."]]`
     for those tags + `votecount > 50` minimum.
  4. Ranks by tag-overlap score with the user's tag preferences.
  5. Filters out anything already in collection or wishlist.
- New page `/recommendations`.

**Files**:
- `src/lib/recommend.ts` (new).
- `src/app/recommendations/page.tsx` (new).
- `src/app/api/recommendations/route.ts` (new).
- Library nav: new entry.
- i18n: `recommend.*`

**Size**: medium. ~350 LOC.

---

## 9. Calendar of releases

**Goal**: track upcoming releases of producers in your collection. Surfaces
sequels / new entries from devs you've already invested in.

**Scope**:
- New helper `fetchUpcomingReleases()`:
  - Gathers the producer ids from your collection's developers.
  - Queries `POST /release` with
    `["and", ["released",">=","today"], ["producer","=",[...ids]]]`
    and `["and", ["released",">=","today"], ["vn","=",["developer",...]]]`.
- New page `/upcoming` rendering a month-grouped list.

**Files**:
- `src/lib/upcoming.ts` (new).
- `src/app/upcoming/page.tsx` (new).
- `src/app/api/upcoming/route.ts` (new).
- Library nav: new entry.
- i18n: `upcoming.*`

**Size**: medium. ~300 LOC.

---

## 10. Series auto-detect

**Goal**: when a VN is added, suggest series membership based on VNDB
relations (`seq`, `preq`, `set`, `alt`) — the user just confirms.

**Scope**:
- After upsert, walk `vn.relations`; for each related VN already in the
  collection, check whether either VN belongs to a series.
- If yes → propose adding the new VN to that series.
- If no → propose creating a new series named after the shared root.
- Surfaced as a toast with a "Add to series X?" CTA on the VN detail page
  when freshly added.

**Files**:
- `src/lib/series-detect.ts` (new).
- `src/components/SeriesAutoSuggest.tsx` (new).
- `src/app/vn/[id]/page.tsx`: render suggestion.
- i18n: `series.autoSuggest.*`

**Size**: medium. ~300 LOC.

---

## 11. Comparison view + similar suggestions

**Goal**: select 2–4 VNs from the library, see them side-by-side (scores,
length, languages, tags overlap, shared staff). Each comparison also shows
the top-5 "similar to all of these" recommendations.

**Scope**:
- Library card adds a "Compare" toggle (multi-select). Up to 4 selected.
- New page `/compare?ids=v1,v2,v3` rendering a 4-column comparison.
- Tag-overlap score reuses the `recommend.ts` helper from feature 8.

**Files**:
- `src/components/CompareToggle.tsx` (new).
- `src/components/LibraryClient.tsx`: selection state.
- `src/app/compare/page.tsx` (new).
- i18n: `compare.page.*`

**Size**: large. ~500 LOC.

---

## Cross-cutting concerns

### URL state vs React state

Per `CLAUDE.md` "filters / sort / new state lives in the URL, not in
`useState`": comparison selection, recommendations seed, calendar month
filter — all live in URL params so the back button works.

### i18n

Every feature adds keys in FR / EN / JA. Run `tsc --noEmit` after each so the
strict-shape check on `Widen<typeof dictionaries['fr']>` catches missed
locales.

### Tests

Same convention as today — `npm run build` is the gate. Manual smoke scripts
in `/tmp/` per feature.

### Performance

Most reads are SQLite queries on already-indexed columns. The two queries
that could get slow:

- **Tag co-occurrence**: O(N × tagsPerVn²) over the collection. Acceptable
  for collections ≤ a few thousand; if it ever becomes a bottleneck we add
  an inverted index `vn_tag(vn_id, tag_id)` mirroring the existing JSON
  column.
- **VA heatmap**: already indexed via `vn_va_credit(sid)`.

### Rollout order

1. ✅ Urgent fixes (banner, cover).
2. Random pick → Tag co-occurrence → Reading speed (independent, low risk).
3. VA heatmap → Quick-actions → Exports (building on existing data).
4. Reading log (introduces a new table — must be tested with a full
   "Download all" run after migration).
5. Recommendations → Calendar → Series auto-detect (all rely on the VNDB API,
   share the same caching pattern).
6. Comparison view (depends on recommendations helper).

Each step is independently mergeable. After every step, run `npm run build`
+ start the dev server and click through the changed surface.
