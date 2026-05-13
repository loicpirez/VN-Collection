# Feature reference

Living catalogue of every user-facing feature. Each section says **what it
does**, **where to find it**, and (where useful) the **DB shape / API
surface**.

Pair with:
- [TUTORIAL.md](TUTORIAL.md) — 5-minute walkthrough.
- [PLAN.md](PLAN.md) — implementation plan for the first feature batch.
- [CLAUDE.md](CLAUDE.md) — architecture / conventions.
- [README.md](README.md) — user-facing overview.

> Status legend: ✅ shipped · 🧪 scaffolded (works but minimal) · 🚧 planned.

> Tip: the in-app guided tour auto-opens on first visit and walks you
> through the eight most important surfaces. Re-runnable from
> `/data → Tour`.

---

## Library

### Filters & search ✅
Status chips, free-text title search, tag / language / year filters, tri-state
"more filters" (matched-VNDB, matched-EGS, fan-disc, favourite, has-notes,
NSFW, nukige…). All state lives in URL params so the back button works.

### Sort + custom drag-reorder ✅
Standard sort dropdown plus an opt-in `sort=custom` mode that unlocks
drag-to-reorder via @dnd-kit. Reset button reverts to the default sort.

### Quick-actions on cards ✅
Right-click a tile → menu with status change, favourite toggle, "open
detail page", "open producer", "filter by this producer". All actions hit
existing `PATCH /api/collection/[id]`.

### Random pick / wheel ✅
Dice button next to the bulk-download CTA. Picks uniformly from whatever
the current filters resolve to and navigates to the chosen VN.

### Saved filter combos ✅
"Pin" the current filter URL as a named preset. The preset chips appear
above the filter bar so you can jump between common views ("ja completed
≥85", "wishlist fully translated", "nukige to dump") in one click.

### Dense view toggle ✅
Compact 5-column layout sharing the same card data, switchable from the
toolbar. Useful for users with very large libraries.

### Multi-select + comparison ✅
Select mode lets the user check 2–4 entries; the "Compare" CTA opens
`/compare?ids=…` rendering them side-by-side with shared values
highlighted.

### Anniversary feed ✅
Home-page widget surfacing "this VN released N years ago today" for
entries in your collection — small enough to ignore, sticky enough to
notice when something notable lines up.

### Wishlist controls ✅
`/wishlist` mirrors your VNDB "Wishlist" label and adds:
  - **Filter** by free-text query (title / alt / developer).
  - **Sort** by added date (newest/oldest), title, rating, release date,
    or length.
  - **Group** by year, developer, language, or "already in collection
    vs. to acquire".
  - **Hover-remove** on entries already in your collection — a small
    `HeartOff` button appears on hover and deletes that entry from the
    VNDB wishlist (other labels and your vote stay intact).
  - **Multi-select** + bulk delete for sweeping the list.
  - Loading shows a skeleton card grid; the "list is empty" copy only
    appears post-resolve.

---

## Per-VN detail page

### Sources comparison (VNDB / EGS) ✅
Synopsis / cover / brand / etc. each surface a tab toggle. Per-field
"Set as default" pins the user's preferred side, otherwise auto-resolve
picks VNDB first then falls back to EGS.

### Custom synopsis ✅
Write your own description. Overrides VNDB / EGS by default with a
"Show VNDB / EGS" toggle to peek at the originals.

### Reading speed estimator ✅
"VNDB: 16h · EGS: 12h · You: ≈14h (×0.88)" line under the VNDB length.
Multiplier is the median of (personal playtime / community length) over
your completed entries, activated at 3 samples.

### Tag co-occurrence ✅
Tags from other VNs in the collection that share at least one tag with
this one. Bars sized by overlap count; hidden when the collection is too
small to produce signal.

### "Similar to this VN" page ✅
Reuses the recommendation engine seeded by a single VN's top tags.
Available via a "More like this" link in the relations area.

### Activity timeline ✅
Per-VN journal of status changes, playtime, rating, started/finished
dates and manual notes. Manual notes can be deleted; auto entries are
immutable. Schema: `vn_activity(id, vn_id, kind, payload JSON,
occurred_at)`.

### Cast (VA) ✅
Character thumbnails linked to `/character/[id]`; VA name linked to
`/staff/[id]`. Sourced from `vn_va_credit` populated at upsert time.

### Staff ✅
Production credits grouped by role (scenario, art, music, …). Each name
links to its staff page. Visiting `/staff/[id]` for the first time
auto-downloads the full VNDB credit list (every VN + character that
person worked on, cached 30 days) and surfaces the ones outside your
collection under a "More credits" section. The download streams in
behind a `<Suspense>` skeleton — locally-known credits paint instantly.

### Series auto-detect ✅
When the VN's VNDB relations include other in-collection entries, the
detail page surfaces a card proposing "Join series X" or "Create series
Y" with a name derived from the longest common prefix. The graph is
walked transitively (BFS over seq / preq / set / fan / alt / orig) so a
3+ volume chain like "Ai Kiss 1 → 2 → 3" all surfaces from any entry
point. Clicking "Join existing" or "Create new" joins every transitively-
related VN in your collection in one shot.

### Series metadata editor ✅
`/series/[id]` carries an inline editor for the series name, free-form
description, cover image, and banner image. Uploads stream through
`POST /api/series/[id]/image` (multipart, 15 MB cap) and land in
`data/storage/series/` with the relative path stored in
`series.cover_path` / `series.banner_path`. The page header renders the
banner as a hero strip plus the cover thumbnail.

### Routes ✅
Per-VN ordered list of routes (e.g. "Saber → Rin → Sakura") with completion
tracking and free-form notes.

### Per-route notes ✅
Each route entry has a sticky-note toggle that expands an inline textarea
(up to 2000 chars). Notes render below the row as italic muted text when
collapsed, and the row shows a filled accent icon when notes are present.
Completion dates are stamped automatically the first time a route is
marked complete.

### Smart status hint ✅
Non-intrusive banner: "you've logged ≥ VNDB length — mark as completed?"
when `playtime_minutes >= length_minutes` and status is `playing`.

### Banner + custom cover ✅
Upload a banner image and position its focal point with a drag pin.
Custom cover overrides both VNDB and EGS posters.

### Owned editions ✅
Track every physical / digital copy: location, edition label, box type,
condition, price paid, currency, acquired date, **purchase place**
(store name / URL / second-hand seller — full provenance), photos.

### Pomodoro timer ✅
25-minute timer with a one-click "log to playtime". Adds an activity
entry automatically. Toggles from the playtime row on the detail page.

---

## Discovery

### Recommendations from VNDB tags ✅
`/recommendations` — surfaces VNs you don't own that share tags with your
highest-rated entries. Weighted by user_rating; tag matches scored and
ranked. Toggle for including ero tags.

### Upcoming releases ✅
`/upcoming` — three tabs to choose your scope of "what's next":
  - **My collection** (default): future releases from producers already in
    your collection, grouped by month.
  - **EGS anticipated**: top-100 games on ErogameScape ranked by user
    purchase intent (`必ず購入 / 多分購入 / 様子見` counts), with cover
    images and a VNDB cross-link per row when EGS records one.
  - **All VNDB**: every upcoming release VNDB tracks in the next 12 months.

Each tab body streams in via `<Suspense>` with a skeleton placeholder so
the page header + tab strip paint immediately.

### Cross-VN quotes ✅
`/quotes` — every quote across every VN you've fetched, with character +
VN attribution and a free-text filter. Random-quote footer pulls from
this pool too.

---

## Stats & insights

### `/stats` overview ✅
Total VNs, total playtime, by-status counts, top tags, by-year histogram,
top languages / platforms / locations / editions.

### Score distribution vs VNDB ✅
Histogram of your `user_rating` overlaid on the VNDB community curve for
the same VNs.

### Best ROI ranking ✅
`user_rating / playtime_minutes` sorted descending — your highest-density
wins. Hidden until you have ≥ 5 completed entries.

### Year in review ✅
`/year` — yearly bar chart of completions, total hours, top genres, score
average. Picks the active year from a query param; defaults to the
current calendar year.

### Activity heatmap ✅
GitHub-style 12-month calendar of activity entries (any kind), colour
intensity ≡ daily count. Lives on the year-in-review page.

### Producer completion % ✅
For each developer in your collection, show "you own N/M of their
releases" via VNDB. Missing entries listed underneath with a one-click
"Add to collection" affordance.

### Genre evolution ✅
Yearly stack of your top tags by year-you-completed — visualises taste
drift over time.

### Reading goals ✅
"Finish N VNs in 2026" — set a yearly target, see a progress ring on
`/stats` with projected end date based on your speed multiplier.

---

## Data management

### `/data` page ✅
Hub for everything that touches the file-system: VNDB token, bulk asset
download status, exports, imports, backups.

### JSON / CSV / ICS export ✅
- JSON — round-trippable backup.
- CSV — one flat row per VN, arrays joined with `; `.
- ICS — RFC 5545 calendar with a VEVENT per `started_date` and
  `finished_date`.

### JSON / .db import ✅
JSON merges (existing rows updated, new rows added). A `.db` upload
fully replaces the current database. Drag-and-drop on the `/data` page
triggers the same flow.

### Duplicate detector ✅
Scans the collection for entries that share normalised title prefixes
across VNDB and EGS-only synthetic ids, surfacing potential variants to
merge or remove.

### Stale-data wizard ✅
Lists VNs whose `fetched_at` is older than the configured threshold,
plus rows with broken EGS links or missing covers. One-click bulk
refresh.

### Backup (`.db`) ✅
Raw SQLite dump for cold backup.

### Cache panel ✅
Inspect the VNDB cache by prefix; purge expired or selective entries.

---

## Settings

### `/settings` (in /data hub) ✅
Local display preferences:
- NSFW threshold (0–2 from VNDB image flagging)
- Hide images globally
- Prefer local images over remote URLs
- Default sort
- VNDB token

### Localisation ✅
FR / EN / JA. Switch via the language pill in the top nav.

---

## Integrations

### VNDB Kana API v2 ✅
Read access for VN / character / staff / producer / tag / trait / quote /
release / ulist (wishlist). Token authentication for ulist.

### VNDB list write-back ✅
Status changes locally also `PATCH /ulist/<id>` against VNDB when a
token is set. Mapping (planning/playing/completed/on_hold/dropped →
5/1/2/3/4) is documented in [`src/lib/vndb-sync.ts`](src/lib/vndb-sync.ts).
Gated behind a `vndb_writeback` toggle in Settings — when unchecked,
local changes stay local. Best-effort: a 4xx / 5xx from VNDB is logged
but never rolls back the local state.

### VNDB → local status pull ✅
The reverse direction: Settings → "Pull statuses from VNDB" iterates
every predefined label (planning/playing/completed/on_hold/dropped) on
your VNDB ulist, picks the precedence-winning local Status per VN, and
applies it via `updateCollection`. Only touches VNs already in the local
collection — no silent imports. Returns a `{scanned, updated, unchanged,
skippedNotInCollection}` summary.

### ErogameScape ✅
SQL form scraping for scores, playtime medians, brand, genre, comments.
Typed `EgsUnreachable` error (network / server / throttled / blocked)
propagates to the UI so transient outages don't wipe matched rows.

### Steam playtime sync ✅
`/steam` pulls your Steam library via the Web API. Three sections:

  1. **Suggestions** — VN ↔ Steam pairs (auto + manual) where Steam
     time > local time. Tick rows + "Apply" merges via
     `updateCollection`, logging each jump in the activity table.
  2. **Saved links** — every persisted VN ↔ Steam mapping (auto or
     manual) with a per-row "unlink" button. Auto-detected links use
     VNDB release-level extlinks (the VN-level aggregator excludes
     Steam, so we batch-query `/release` with `extlink=steam` to
     resolve them). Manual links are *sticky* — a subsequent
     auto-scan won't overwrite them.
  3. **Unmapped Steam games** — every Steam game with playtime > 0
     that isn't linked yet. Type a title to fuzzy-search your
     collection then click a VN to bind the appid. The mapping
     persists to `steam_link(vn_id, appid, steam_name, source,
     last_synced_minutes)`.

Configure in Settings: Steam Web API key + 64-bit SteamID. The
collection-title search is exposed as `GET /api/collection/find?q=`
and is reusable elsewhere if needed.

### Anime adaptations ✅
Surfaces an "Anime adaptation" chip next to the action buttons on
`/vn/[id]` when VNDB's `has_anime` filter matches. Probed lazily on
first render and cached.

---

## Quality of life

### Drag-and-drop import ✅
Drop a `.json` or `.db` file anywhere on `/data` to trigger the import.

### Keyboard shortcuts ✅
| Key | Action |
| --- | --- |
| `/` | Focus library search |
| `g h` | Go home |
| `g s` | Go to search |
| `g w` | Go to wishlist |
| `g r` | Go to recommendations |
| `?` | Open shortcut help |
| `Escape` | Close menus / dialogs |

### Grouped responsive navbar ✅
The top nav has three always-visible primary links (Library / Wishlist /
Search) plus three category dropdowns:
  - **Discover** — Upcoming, For you, Quotes
  - **Browse** — Producers, Series, Tags, Traits, Year, Labels
  - **Data & Stats** — Stats, Shelf, Steam, Data

On screens narrower than `md` the whole nav collapses into a single
hamburger sheet that lists every destination grouped by category.

### Tutorial tour ✅
First-time visitors get a guided pass over the most important surfaces
(library, search, VN detail, settings, stats). Re-runnable from
`/data → Tour`.

### Skeleton loading states ✅
Every async section renders a layout-matching skeleton while loading —
card grids show placeholder covers, row lists show shaded blocks, panels
show shimmer rectangles. Empty-state copy ("No results", "Nothing yet")
only appears after the fetch resolves with zero items, so the UI never
flashes "nothing here" when data is still in flight.

Internals: `src/components/Skeleton.tsx` exports `SkeletonBlock`,
`SkeletonCard`, `SkeletonCardGrid`, `SkeletonRows`, `SkeletonText`, and
`SkeletonTable`. Server components with slow async fetches wrap them in
`<Suspense>` (see `/upcoming` tabs and `/staff/[id]` extra credits).

### Auto-recursive download (fan-out) ✅
When a VN is added or re-fetched, the app fans out in the background to
pull the full profile for every staff member, character, and developer
it credits (cached 30 days). So `/staff/[id]` / `/character/[id]` /
`/producer/[id]` open instantly with full data instead of waiting on a
fresh VNDB roundtrip.

Toggle in Settings → "Auto-download staff / characters / developers"
(default ON). When OFF, fan-out helpers exit early and VN downloads stay
fast.

### Selective full download ✅
On `/data`, a checkbox picker lists every VN in your collection with
**Select all** / **Select none** / **Invert** + a text filter. Tick the
VNs you want full data for and click "Run (N)" to queue the fan-out
for that subset only. Bypasses the auto-fan-out toggle since the user
is explicitly opting in. Drains through the global VNDB throttle so
large selections stay rate-limit-safe.

### VNDB rate limiter + 429 countdown ✅
`lib/vndb-throttle.ts` enforces 1 req/s globally + 60 s window for soft
circuit breaking. On 429 the failing request honors `Retry-After`
(capped at 60 s) and retries up to twice. Other callers stay on the
normal 1 req/s pace unless 3+ 429s pile up in 60 s.

The right-side `DownloadStatusBar` indicator shows a live countdown
banner whenever VNDB has asked us to wait — "VNDB returned 429,
retrying in 12s" — so you can see exactly when the next attempt will
fire. Same indicator surfaces per-job progress bars and per-item
errors (no more silent failures).

---

## Reading enhancement

### Pomodoro timer ✅
Detail-page widget — 25 min by default, configurable. On stop, prompt
to add the elapsed minutes to `playtime_minutes`. Always writes an
activity entry.

### Reading queue ✅
A priority queue distinct from the "Planning" status. Re-orderable via
drag; each entry shows the predicted reading time using the speed
estimator. Reflects on the home page above the library grid.

---

## Physical collection

### Box / location tagging ✅
`physical_location` as a free-form array per VN; each tag is filterable
on the home page.

### Owned-edition inventory ✅
`owned_release` table — one row per physical copy with condition, price,
currency, photos, dumped flag.

### QR labels (print view) ✅
`/labels?ids=…` prints a sheet of QR codes that point back to the VN's
detail page. Origin is derived from the incoming request headers so
labels work whatever port / LAN IP you're browsing. Tape them to your
boxes for instant lookup.

### Shelf visualisation ✅
`/shelf` lists every owned edition grouped by its first
`physical_location` tag (rows without a tag fall into "Unsorted").
Each card shows the cover, edition label, box type, condition,
dumped flag, and `price_paid`. The header sums totals per currency
and per location.

### Insurance / value tracking ✅
Same `/shelf` page — `owned_release.price_paid` + `currency` per row,
running totals at the section heading + grand total in the page
header. JSON / CSV export of the whole collection (including these
fields) lives in `/data → Exports`.

---

## Localisation

All UI strings live in `src/lib/i18n/dictionaries.ts`. The shape is
enforced via `Widen<typeof dictionaries['fr']>` so missing keys break
the build for FR / EN / JA. Adding a locale requires every key to be
filled.

---

## Schema overview

| Table | Purpose | Key columns |
| --- | --- | --- |
| `vn` | VNDB mirror, one row per VN id | id, title, alttitle, image_*, length_*, rating, tags JSON, relations JSON, staff JSON, va JSON, fetched_at |
| `collection` | User-side state per VN | vn_id, status, user_rating, playtime_minutes, started/finished_date, notes, favorite, location, edition_*, physical_location JSON, custom_description |
| `egs_game` | ErogameScape mirror, one row per VN | vn_id, egs_id, gamename, median, average, playtime_median_minutes, source, raw_json |
| `producer` | VNDB producer mirror | id, name, original, lang, type, aliases JSON, extlinks JSON, logo_path |
| `series` / `series_vn` | User-defined groupings | series.id, series_vn.{series_id, vn_id, order_index} |
| `vn_route` | Per-VN route list | id, vn_id, name, completed, completed_date, order_index, notes |
| `vn_quote` | Cached VNDB quotes | quote_id, vn_id, quote, score, character_id |
| `vn_staff_credit` | Indexed staff role table | vn_id, sid, role, name |
| `vn_va_credit` | Indexed VA + character table | vn_id, sid, c_id, c_name, c_image_url, va_name |
| `vn_activity` | Reading-log audit trail | id, vn_id, kind, payload JSON, occurred_at |
| `owned_release` | Physical / digital inventory | id, vn_id, release_id, location, condition, price_paid, currency, photos JSON |
| `vndb_cache` | HTTP cache for VNDB + EGS responses | cache_key, body, etag, last_modified, fetched_at, expires_at |
| `app_setting` | Misc key/value store | key, value |
| `saved_filter` | Saved filter combos | id, name, params, position |
| `reading_goal` | Yearly goals | year, target |
| `reading_queue` | Priority queue separate from Planning | vn_id, position, added_at |

Migrations are idempotent via `ensureColumn` / `CREATE TABLE IF NOT
EXISTS`, with marker rows in `app_setting` for one-shot data migrations
(e.g. EGS playtime hours → minutes, EGS id colon → underscore).
