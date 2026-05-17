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
> through every major surface (15 steps: library, search, lists,
> recommend, upcoming, quotes, year, stats, shelf, shelf layout,
> steam, EGS, dumped, data, VN detail). The tour body copy mentions
> the scoped density slider, VNDB tags grouped view, cover/banner
> rotation, recommendation modes, and the SpoilerReveal hover toggle
> so the operator hits the recent surfaces without leaving the tour.
> Re-runnable from `/data → Tour`.

---

## Library

### Filters & search ✅
Status chips, free-text title search, tag / language / year filters, tri-state
"more filters" (matched-VNDB, matched-EGS, fan-disc, favourite, has-notes,
NSFW, nukige…). All state lives in URL params so the back button works.

The library accepts the following URL params (all optional, all
shareable): `status`, `q`, `producer` (developer side), `publisher`,
`series`, `tag`, `place` (free-text physical location tag),
`edition` (one of `EDITION_TYPES`), `yearMin` / `yearMax`,
`aspect` (CSV; supports multi-select), `dumped` (`1` / `0`),
`sort`, `order`, `group`. New filters land on the existing
`<FilterChip>` row so the active state stays visible and one click
removes it.

### Metadata everywhere is clickable ✅
Every metadata token rendered on a detail page is a discovery
entry point — clicking a language code, platform code, developer
chip, publisher chip, physical-location pin, or status slice
navigates to the appropriate filtered view. Affected surfaces:

- VN detail page: languages → `/search?langs=<code>`;
  platforms → `/search?platforms=<code>` (chips, no longer a
  comma-joined string).
- Releases section per row: languages + platforms become chip
  rows; developer / publisher names become `<Link>`s to
  `/producer/<id>`.
- Owned editions: each `physical_location` chip routes to
  `/?place=<value>`.
- Stats donut: each status slice routes to `/?status=<status>`.
- Stats "By edition": each row routes to `/?edition=<type>`
  (driven by the new `?edition=` library filter).
- /similar cards: each matched seed tag is its own `<Link>` to
  `/tag/<id>` so the reader can inspect local and VNDB-wide context for
  that tag.
- VN detail "Sorti" line is a `<Link>` to the library pre-filtered
  by that release year (`?yearMin=<y>&yearMax=<y>`).
- VN detail aspect chip pairs the existing scroll-to-override
  anchor with a secondary `<Link>` to `/?aspect=<key>` so the
  reader can pivot to every VN at that ratio without scrolling.
- VN detail dumped chip links to `/?dumped=1` whenever the
  collection-level dumped flag is set.

### Sort + custom drag-reorder ✅
Standard sort dropdown plus an opt-in `sort=custom` mode that unlocks
drag-to-reorder via @dnd-kit. Reset button reverts to the default sort.
Whole-card drag surface (no separate handle) — clicks pass through
to the underlying `<Link>` and the heart / lists overlays because the
PointerSensor has a 6 px activation distance. Honors the comfortable /
dense toggle in custom-order mode as well.

### Four-way playtime model ✅
Three real playtime sources — VNDB community length, EGS user-review
median, and the user's own recorded time — used to render as three
disconnected inline labels with no source-priority story. Now there
are four sort keys + one card display:

- `playtime`          — user's own recorded time, no fallback.
- `length_minutes`    — VNDB length only.
- `egs_playtime`      — EGS median only.
- `combined_playtime` — average of every populated source. The SQL
  divides by `populated_count` so a single-source value ranks at its
  own magnitude rather than getting watered down by missing data.
  Example: VNDB 95 + EGS 90 + Mine 93 → (95+90+93)/3 = 92.67.

On `/vn/[id]` a `PlaytimeCompare` component shows all four columns
with "Use" buttons that write `source_pref.playtime` (was dead code).
Every `VnCard` shows the **All** combined value as the primary
playtime chip with the per-source breakdown beneath and a tooltip
listing each source.

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
Compact density-responsive layout sharing the same card data, switchable from the
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

### Universal Lists ✅
Free-form user-curated groupings independent of status / series / tags.
A VN can be in any number of lists. Schema:

```sql
user_list(id, name, slug UNIQUE, description, color, icon,
          pinned BOOL, created_at, updated_at)
user_list_vn(list_id FK, vn_id, order_index, added_at, note,
             PRIMARY KEY(list_id, vn_id))
```

`user_list_vn.vn_id` deliberately has **no FK** to `vn(id)` so
anticipated / wishlist entries that aren't yet in the `vn` table can
still be tracked.

Routes: `GET /api/lists`, `POST /api/lists`, `GET/PATCH/DELETE
/api/lists/[id]`, `POST/DELETE /api/lists/[id]/items`,
`GET /api/vn/[id]/lists`.

UI:
  - `/lists` overview — grid of cards with color, name, description,
    VN count. Hover any card for the ⋮ menu (Pin / Rename / Delete).
    Create form at the top with name + description + 8-preset color
    picker.
  - `/lists/[id]` detail — header with metadata editor (rename, recolor,
    delete), add-VN form (`v123` / `egs_456`), and a VnCard grid for
    every member with hover X to remove from the list.
  - `ListsPickerButton` on every `VnCard` — lazy popover with search,
    every existing list as a checkbox, inline "create new list" input,
    live count chip when the VN belongs to ≥ 1 list. Optimistic toggles.
  - `VnListMemberships` chips under the VN detail title — one per list
    membership, colored by the list, click to open the list, X to remove.

### Favorite hover toggle ✅
`FavoriteToggleButton` renders as an overlay heart on every `VnCard`
(top-left) and as an inline pill in the VN detail action bar. The
overlay is **always tappable** (no `hidden sm:inline` traps — mobile
and tablet are first-class). Filled red when favorited, hover-revealed
outline otherwise. Auto-adds a search hit to the collection (status =
planning) before flipping the favorite if the VN isn't already tracked.
Optimistic update with rollback on error.

### Cover source picker ✅
`CoverSourcePicker` is a modal triggered from the VN detail action bar
that lets the user pick the cover from three categorical sources:
  1. **VNDB** — `DELETE /api/collection/[id]/cover` (revert to default).
  2. **EGS** — multi-source picker (see below).
  3. **Custom** — file upload (multipart), URL input, *or* pick from
     a thumbnail grid of every screenshot + per-release artwork
     attached to this VN (each tile is a one-click "set as cover").

The current pick is ring-highlighted so it's obvious which image is
live. Initial tab is inferred from `currentCustomCover` (EGS URL →
EGS tab, anything else → Custom tab, null → VNDB tab).

#### Multi-source EGS cover picker ✅
The EGS tab no longer locks you into the resolver's priority chain.
It calls `GET /api/egs-cover/<id>/candidates` and renders **every**
known source side-by-side as clickable tiles:
- **EGS banner** — curated `gamelist.banner_url`.
- **VNDB** — the upstream VNDB poster when EGS knows the linked
  `vndb_id` for this game.
- **EGS image.php** — EGS's own image redirector.
- **Suruga-ya / DMM / DLsite / Gyutto** — shop variants whenever the
  EGS row carries that store id.

The candidates route does **no probing** (HEAD requests would
quadruple latency); the UI lazy-loads each tile and the `<img onError>`
hook surfaces 404s. Clicking a tile calls
`POST /api/collection/[id]/cover {source:'url', value:<absolute>}` so
the chosen source is pinned as `custom_cover` and survives refresh /
global cache busts. A separate **"Use EGS auto"** button restores the
priority-fallback default if the user wants the resolver's pick.

---

## Per-VN detail page

### Customizable VN section layout ✅
The immutable identity area (title, cover/banner, synopsis, core
metadata/media/actions) stays fixed. Everything below it is managed by
`VnDetailLayout` + `lib/vn-detail-layout.ts`:
- drag-and-drop reorder via dnd-kit
- hide/show optional sections
- collapse/expand and "collapsed by default"
- persisted as `vn_detail_section_layout_v1`
- resettable from the VN page and Settings → VN page

Registered sections include notes, routes, activity, relations, VNDB
status, EGS, characters, cast, staff, tag overlap, similar VNs, My
editions, releases, quotes, and cover/banner/edit tools.

### Producer / Developer / Publisher — three concepts, end-to-end ✅
VNDB models three distinct things and we keep them distinct everywhere:
- **Producer** — the *entity*: a company / individual / amateur group
  (`POST /producer`, ids like `p123`, type `co` / `in` / `ng`).
- **Developer** — a *role*: a producer credited as the studio that
  made the VN. Exposed twice on VNDB: directly on `POST /vn` via
  `developers[]`, and on `POST /release` via `producers[].developer = true`.
- **Publisher** — a *role*: a producer credited as the entity that
  publishes / localizes a release. **Only** exposed on `POST /release`
  via `producers[].publisher = true` (there is no `publishers[]` on
  `POST /vn`).

The same producer entity can hold the developer role for VN A, the
publisher role for VN B, and both for VN C. We never collapse the
two roles into one bucket.

**Storage:**
- `vn.developers` JSON — read straight from `POST /vn { developers }`.
- `vn.publishers` JSON — computed by walking every release's
  `producers[]` (`publisher = true`) and deduping by producer id.
  VNDB only exposes the role at the release level, so the release-
  mirror pipeline (`ensureLocalImagesForVn` →
  `fetchAndDownloadReleaseImages`) populates them on every add /
  refresh / bulk path.
- `producer` table — local mirror of `POST /producer` (name, type,
  aliases, logo, extlinks). Shared by both roles.

**Filtering & sorting (`listCollection`):**
- `?producer=p123` matches `vn.developers[].id = p123` (developer side).
- `?publisher=p123` matches `vn.publishers[].id = p123` (publisher side).
- The two filters are **separate** — a producer credited under both
  roles is reachable per side without collisions.
- `sort=producer` orders by first developer name; `sort=publisher`
  orders by first publisher name. Both group axes available
  (`group=producer` and `group=publisher`).

**UI surfaces:**
- VN cards render two chips: a developer chip (`Building2` icon)
  and, when the publisher is *distinct* from any developer, a
  publisher chip (`Package` icon). Self-publishing studios collapse
  into the developer chip only.
- Right-click on a card → "Open developer", "Filter by this
  developer", "Open publisher", "Filter by this publisher" (the
  publisher rows only render when a distinct publisher is known).
- `/vn/[id]` renders Developers and Publishers as two separate
  compare rows, each chip linking to `/producer/[id]`.
- `/producer/[id]` paginates `POST /vn` (developer credits) AND
  `POST /release` (publisher credits) and renders **two sections**
  — "As developer" and "As publisher" — with owned / missing
  markers and inline "+" buttons.
- `/producers` ranking has two tabs (`?role=dev` default, `?role=publisher`),
  backed by `listProducerStats` (dev) and `listPublisherStats` (pub).
  Publisher-only studios (Studio X, Studio Y, Studio Z…) only appear
  under the Publishers tab.
- `/stats` shows two ranked bar charts side by side: Top developers
  and Top publishers.

### Sources comparison (VNDB / EGS) ✅
Synopsis / cover / brand / etc. each surface a tab toggle. Per-field
"Set as default" pins the user's preferred side, otherwise auto-resolve
picks VNDB first then falls back to EGS.

### View on VNDB + View on EGS ✅
The action bar on `/vn/[id]` carries a "View on VNDB" external link
and, when the VN has an EGS row linked, **also** a "View on EGS"
link — both visible simultaneously so the user can jump to either
upstream page in one click. EGS-only synthetic entries only show
the EGS button (no VNDB id to link to).

### Graceful producer page ✅
`/producer/[id]` no longer hard-404s when the VNDB fetch fails AND
nothing is cached locally. Falls back to deriving a name from any
in-collection VN that credits the producer (developer or publisher),
so the page still shows the user's owned VNs and the producer chip
they navigated from. The global not-found template is now wording-
generic ("Page not found"), no longer "VN not found", because it
fires for every notFound() across the app.

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

The **Voice (seiyuu) section** on `/staff/[id]` renders each VN as a
full **VnCard** (poster, title, owned-chip if in collection, external
links to VNDB and EGS) — same component the library and producer
pages use — with the **character thumbnails** the seiyuu voiced
inline underneath each card. Thumbs come from
`character_image.local_path` joined into `listStaffVaCredits`. Tap a
character thumb to jump to `/character/[id]`. Synthetic `egs_*` VN
cards suppress the VNDB external-link button (no `v` id to link).

### Brand overlap ✅
`/brand-overlap?a=p1&b=p2` answers "which staff / VA worked at both
of these studios?". Two `<select>` pickers pull from `/api/producers`;
the resolver narrows candidate sids via the `staff_credit_index`
derived table (avoiding a full scan of every cached `staff_full:*`
body), then sorts crossover rows by `aCredits.length +
bCredits.length` descending. Roles render via the shared
`roleLabel` helper so every locale gets translated role names.

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
Per-VN ordered list of routes (e.g. "Heroine A → Heroine B → True route")
with completion tracking and free-form notes.

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

Now publishes its live elapsed-minute count via the `SessionPanel`
wrapper so siblings (the Game log) can stamp notes with the running
session length.

### Game log ✅
Free-form timestamped journal per VN, distinct from the activity log
(which records state changes). Schema:

```sql
vn_game_log(id, vn_id FK, note TEXT, logged_at INTEGER,
            session_minutes INTEGER NULL, created_at, updated_at)
```

UI lives next to the Pomodoro (inside `SessionPanel`). Composer with
⌘/Ctrl + Enter to submit, live character counter (8000 max), optional
"attach Xm of active session" chip when the timer is running. Entries
are grouped by day with localized headers, sorted newest-first, with
hover-revealed Edit / Delete and a session-minute chip when stamped.

Routes: `GET/POST/PATCH/DELETE /api/collection/[id]/game-log`.

---

## Discovery

### Recommendations from VNDB tags ✅
`/recommendations` — surfaces VNs you don't own that share tags with your
highest-rated entries. Weighted by user_rating; tag matches scored and
ranked. Toggle for including ero tags.

**Five modes** (URL `?mode=…`, default `because-you-liked`):

  - `because-you-liked` — weighted scoring across every tag drawn
    from the operator's highly-rated VNs.
  - `tag-based` — pure tag-overlap. Rating drops out of the
    score so a tag the operator merely has many entries for can
    still drive the picks.
  - `hidden-gems` — same scoring as `because-you-liked`, then
    drops entries with high VNDB community ratings so the
    "underseen" picks rise to the top.
  - `highly-rated` — only keeps rows with `rating >= 80` and
    enough votes to clear the Bayesian noise floor.
  - `similar-to-vn` — seeded by a single VN id (passed via
    `?vn=v123`). Pulls top tags from that VN and feeds them to
    the rest of the recommend pipeline. Powers the
    `/similar?vn=…` companion page too.

Every result card carries **owned** / **wishlist** indicator
chips when the underlying row matches the operator's local
collection or VNDB wishlist label. The indicators surface from
`recommendVns()` directly so a recommendation that's already
covered is obvious at a glance.

Manual seed override: a `<TagPicker>` chip strip on
`/recommendations` lets the operator pin a custom seed-tag list
(`?tags=g123,g456`). Auto-derivation still kicks in when no tags
are pinned. The `?mode=similar-to-vn` flow has a parallel
`<VnSeedPicker>` for choosing the seed VN.

Tests: `tests/recommend-modes.test.ts`,
`tests/recommend-owned-badge.test.ts`.

### Upcoming releases ✅
`/upcoming` — three tabs to choose your scope of "what's next":
  - **The collection** (default): future releases from producers already in
    the local library, grouped by month. When VNDB returns `vns[].image=null`,
    the page overlays the local DB cover (image_url/image_thumb/local_image)
    so collection items always render a poster even for unreleased entries.
  - **EGS anticipated**: top-100 games on ErogameScape ranked by user
    purchase intent (`必ず購入 / 多分購入 / 様子見` counts) with a VNDB
    cross-link per row when EGS records one. Cards lay out 2-per-row
    with big 128×192 covers (152×224 on sm+) so the cover is actually
    visible. For rows carrying a `vndb_id` the cover is fetched
    directly from VNDB via one batched call (`fetchVnCovers(ids)`);
    everything else falls through `/api/egs-cover/[id]` (see "EGS
    cover resolver" below). Big rank chip on each card (h-8 w-8),
    bold intent counters with muted labels.
  - **All VNDB**: every upcoming release VNDB tracks in the next 12 months.

Each tab body streams in via `<Suspense>` with a skeleton placeholder so
the page header + tab strip paint immediately.

### EGS cover resolver ✅
`GET /api/egs-cover/[id]` — tiered resolution chain (first hit wins):
  1. `gamelist.banner_url` (curated EGS banner, trusted — no probe).
  2. **Linked VNDB cover** via `egs_game.vn_id` → `vn.image_url` (or
     local mirror at `/api/files/<local_image>`). Best quality + most
     reliable for anticipated entries.
  3. **Probed** `egs:image.php?game=<id>` — single GET with Range
     header, 3.5 s timeout.
  4. First available shop URL — Suruga-ya / DMM / DLsite / Gyutto.

**Server-side proxy, not 302 redirect.** For any off-origin target the
route fetches the upstream bytes and streams them back with a clean
`Content-Type` + a `Cache-Control: public, max-age=86400, swr=604800`
header. Same-origin `/api/files/<path>` targets still 302-redirect
(no extra bandwidth). Proxying sidesteps the referer / mixed-content /
Cloudflare bot-mitigation failures that were silently breaking the
browser fetch when the route 302'd cross-origin.

Hits cache for 7 days. Misses cache for 1 hour (down from 24 h) so
freshly-published banners surface inside the hour. The global
`POST /api/refresh/global` busts every `egs:cover-resolved:*` row so
users can force re-resolution.

### Anticipated covers via VNDB direct ✅
`/upcoming?tab=anticipated` server-component calls
`fetchVnCovers(ids)` once after `fetchEgsAnticipated`, batching every
anticipated row's `vndb_id` into a single VNDB POST. The card then
renders the high-quality VNDB poster URL inline (with the correct
`sexual` flag for NSFW gating) instead of bouncing through the EGS
resolver. EGS-only rows (no `vndb_id`) fall back to `/api/egs-cover/`.

### Top-ranked rankings ✅
`/top-ranked` — two tabs, **VNDB top** and **EGS top**, with a
per-tab freshness chip (the EGS chip never lies "just now"
because only VNDB refreshed). Pagination is URL-driven via
`?page=<n>` and the vote threshold is URL-driven via `?min=<n>`,
snapping to a preset (50 / 100 / 250 / 500 / 1000). Each preset
caches independently, so a power user toggling thresholds pays
the round-trip once per threshold. The EGS tab applies Bayesian
shrinkage (`(count × median + C × prior) / (count + C)` with
prior = 70 / strength = 30) on top of the threshold, so a
brand-new title with one perfect score doesn't shoot to #1.

### /similar matched-tags ✅
On `/similar?vn=v123`, each result card now lists the seed tags
that surfaced it as individual `<Link>` chips routing to `/tag/<id>`.
The reader can pivot from a matched tag to its local collection tab or
VNDB-wide tab without going back to /similar.

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

### Content controls hub ✅ (closed-eye icon)
The eye icon in the navbar opens a compact popover that exposes every
"what shows on screen" preference in one place:
- **Spoiler level** (0 / 1 / 2 — matches VNDB's site preference,
  filters tags / traits / character meta across the app)
- **Hide all images** globally
- **Blur R18** imagery
- **Hide sexual images** as a hard filter
- **NSFW threshold** slider (0–2, 0.1 steps)
- **Show sexual traits** on character pages
- "All settings…" button dispatches a `vn:open-settings` `CustomEvent`
  that `SettingsButton` listens for to open the canonical modal

The eye icon switches between `Eye` (any non-default gate active) and
`EyeOff` (everything locked down) so the user can read their current
posture at a glance. State is mirrored to localStorage + cookie by
`DisplaySettingsProvider`.

### Full settings modal ✅ (gear icon)
`SettingsButton` opens a modal portal (escapes the header stacking
context) with tabbed groups: Display, Content / Spoilers, Library
defaults, Home layout, VN page layout, Data / accounts, Integrations,
and Downloads / automation. It mirrors every content-controls toggle,
plus:
- **VNDB token** (paste from <https://vndb.org/u/tokens>) + writeback
  + status pull + fan-out toggle + backup URL
- **Steam** Web API key + 64-bit SteamID
- **Random quote source** — all VNDB or only from your collection
- **Default sort / order / group** for the library
- **Home layout** restore panel for hidden home strips
- **VN page layout** restore / collapsed-by-default panel
- **Original title first** (swap headline ↔ subtitle)
- **Prefer local images** (read from `/api/files/` instead of remote
  CDNs when a mirror exists)

### Per-page Refresh button + freshness chip ✅
`RefreshPageButton` renders on the pages whose render genuinely
depends on a remote cache: **`/upcoming`** and **`/top-ranked`**.
(`/tags` and `/traits` are local-only and don't use the chip.)
The button:
- Reads `lastUpdatedAt` server-side via `getCacheFreshness(patterns)`
  — `SELECT MAX(fetched_at) FROM vndb_cache WHERE cache_key LIKE …`.
  Patterns anchor on the actual key format `{METHOD} {path}|{METHOD}|{hash}`
  (e.g. `'% /tag|%'`, `'tag_full:%'`, `'anticipated:%'`).
- Renders a tiered relative-time chip ("Data Xh ago") via the shared
  `timeAgo()` util. `now` defaults to `lastUpdatedAt` on the server so
  the SSR first paint reads "just now" instead of a raw timestamp;
  the client useEffect re-syncs to `Date.now()` and ticks every 30 s.
- Turns the chip red when stale (never downloaded or > 7 d).
- Hidden when `lastUpdatedAt` is `undefined` (the prop is omitted).
  Pages with purely-local SQL (`/stats`, `/data`, `/producers`) don't
  carry the chip — a freshness reading there would be meaningless.
- Clicking Refresh calls `POST /api/refresh/global`, which **busts the
  relevant cache rows first** (`egs:cover-resolved:%`, `anticipated:%`,
  `% /stats|%`, `% /schema|%`, `% /authinfo|%`, `% /release|%`,
  `% /release:%`, `% /producer|%`, `% /producer:%`, `% /tag|%`,
  `% /trait|%`) then re-fetches each (EGS anticipated top 100, VNDB
  stats / schema / authinfo, upcoming collection + global, default
  tag/trait searches). Without the bust step the helpers would just
  read the still-fresh cache and `fetched_at` wouldn't move forward —
  which is why the button felt like a no-op before. Each task is a
  tracked job in the download status bar.

### Time-ago util ✅
`src/lib/time-ago.ts` — single source of truth for "X ago" formatting.
Tiers: minute (< 1 h) → hour (< 24 h) → day (< 7 d) → week (< 30 d) →
month (< 365 d) → year. Used by `RefreshPageButton`, `GameLog`, and
anywhere else relative time is needed. i18n keys in the `timeAgo.*`
group across all three locales.

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

### EGS as first-class peer of Steam ✅
ErogameScape is wired with the same UX patterns as Steam:

| Surface | Steam | EGS |
| --- | --- | --- |
| Dedicated landing page | `/steam` | `/egs` |
| Sync block | inline on `/steam` + `/data` | inline on `/egs` + `/data` |
| Nav entry | Data & Stats group | Data & Stats group (`nav.egs`) |
| Synthetic VN ids | n/a — Steam links to existing `v\d+` | `egs_<id>` — coexists everywhere |
| Sort key | `steam_playtime` | `egs_playtime` |
| Field-source toggle | n/a | per-field (description, cover, brand) |

`/egs` lists every EGS-linked VN in your collection with its EGS
median, EGS playtime, source provenance (`auto` / `manual` / `search`),
and a chevron-out link to the upstream EGS page. Includes the
`EgsSyncBlock` (bulk-pull user reviews + playtime medians) and the
same "Open EGS" CTA from `/data` for parity with the Steam settings
block.

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
The top nav has four always-visible primary links (Library / Wishlist /
Lists / Search) plus three category dropdowns:
  - **Discover** — Upcoming, For you, Quotes
  - **Browse** — Producers, Series, Tags, Traits, Characters, Staff, Year, Labels
  - **Data & Stats** — Stats, Shelf, Steam, EGS, Schema, Data

The right edge carries the closed-eye content-controls hub, the
language switcher and the settings gear — all three remain visible
at every screen width. On screens narrower than `md` the rest of the
nav collapses into a single hamburger sheet that lists every
destination grouped by category.

### Tutorial tour ✅
First-time visitors get a 15-step guided pass over the major surfaces:
library, search, lists, recommendations, upcoming, quotes, year,
stats, shelf, shelf layout, steam, EGS, dumped, data hub, and the VN
detail page. Re-runnable from `/data → Tour`.

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

### Viewport-aware lazy image loading ✅
`SafeImage` drives loading via `IntersectionObserver` (`rootMargin: 500px
0px`) instead of relying on native `loading="lazy"`. Native lazy-load
breaks subtly on grids inside overflow-scroll containers, transformed
parents, and SSR / hydration mismatches — symptom: images stay blank
while the user scrolls past. The observer-based approach starts the
network fetch when the element comes within 500 px of the viewport and
resets its state when the `src` changes, so recycled cards in
virtualised lists don't inherit a stale "errored" flag from the
previous VN.

Props: `priority?: boolean` skips the observer entirely for above-the-
fold imagery (VN detail hero, lightbox).

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

Three view modes via `?view=release|item|layout`:
- **Per-item** (default) — every owned edition is its own card.
  Useful for "which copy is in box vs. shelf" workflows. Multi-tag
  physical locations render the secondary tags as a smaller line so
  *Living room · Shelf B · Floor 2 · Row 3* is visible at a glance.
- **Per-VN** — collapses multiple editions of the same VN into a
  single card with the edition count, the *set* of distinct
  locations, and per-currency totals summed across editions. Money
  is rendered with `Intl.NumberFormat` so JPY → ¥, EUR → €, USD → $.
- **Layout** — drag-and-drop 2-D grid editor (see below).

### Drag-and-drop shelf layout ✅
`/shelf?view=layout` opens a fully interactive 2-D shelf simulator
backed by `<ShelfLayoutEditor>` (client) +
`/api/shelves` / `/api/shelves/[id]` /
`/api/shelves/[id]/slots` / `/api/shelves/[id]/displays`
(server). Models a real piece of furniture: a *shelf unit* is a
named (cols × rows) grid, and each owned edition occupies at most
one slot, either in a regular grid cell or in a face-out display row.
Tables:

```sql
shelf_unit(id, name, cols, rows, order_index, created_at, updated_at)
shelf_slot(shelf_id FK, row, col, vn_id, release_id, placed_at,
           PRIMARY KEY(shelf_id, row, col),
           UNIQUE(vn_id, release_id))  -- one slot per edition
shelf_display_slot(shelf_id FK, after_row, position, vn_id, release_id,
           PRIMARY KEY(shelf_id, after_row, position),
           UNIQUE(vn_id, release_id))  -- face-out display rows
```

UI sections:
- **Shelf tabs** — one chip per shelf with `placed / capacity` count.
  Active tab is highlighted. "New shelf" chip opens a name input.
- **Toolbar** — resize buttons (− / + on Cols and on Rows, clamped
  to 1–200), Rename (styled prompt), Delete (confirm dialog),
  fullscreen, and Front display visibility.
- **Grid** — `(cols × rows)` droppable cells, each rendered as an
  aspect-2/3 tile. Occupied cells show the cover, box-type chip,
  dumped chip, and a hover-revealed VN-title link to `/vn/[id]`.
  Empty cells show a faint "row · col" coordinate label.
- **Front display rows** — optional face-out strips between normal
  rows (plus top/bottom) for two-cover showcase / riser displays.
  Moving an edition into a display row removes its regular-cell
  placement and vice versa.
- **Unplaced pool** — owned editions not yet placed, rendered as a
  responsive grid of draggable thumbnails.

DnD model:
- Pool tile → empty cell : place
- Pool tile → occupied   : occupant evicted back to pool
- Slot tile → empty cell : move (same or different shelf)
- Slot tile → occupied   : atomic **swap** (no eviction)
- Slot tile → pool       : remove placement
- Any tile → front display : place face-out, evicting any display
  occupant back to the pool
- Front display tile → grid / pool : move or unplace

Every action is optimistic — the UI patches state immediately,
the request runs in the background, and any error rolls the patch
back with a toast. Sensors registered: `PointerSensor` (6 px
activation, so the link tap-through still works), `TouchSensor`
(150 ms long-press), `KeyboardSensor` (Space + arrows).

Resizing surfaces an "N editions evicted" warning if the new
bounds are smaller than the current placements; evicted editions
land back in the Unplaced pool, never silently lost.

Fullscreen mode uses the same editor state/API but increases tile
size and places the whole layout in a full-viewport overlay.

### Aspect ratio / resolution tracking ✅
VNDB release `resolution` is normalized into
`release_resolution_cache` with buckets `4:3`, `16:9`, `16:10`,
`21:9`, `other`, and `unknown`. The cache row now also stores the
release's VN id (filled lazily as the user visits `/vn/[id]` or
`/release/[id]`) so the library aspect filter can match VNs even
without an owned edition for the release.

Aspect resolution priority (highest first):
1. **VN-level manual override** — `vn_aspect_override` row set
   through `<AspectOverrideControl>` on the VN page or
   `PATCH /api/vn/[id]/aspect`. Highest priority; the user can pin
   any bucket regardless of what VNDB or screenshots suggest.
2. **Per-owned-edition override** —
   `owned_release_aspect_override`, set from the My editions
   editor when a single edition has a different physical aspect.
3. **Cached release resolution** — `release_resolution_cache`,
   either via `owned_release` join (the user owns it) or via the
   new `vn_id` column (the release was browsed).
4. **VN screenshots fallback** — `deriveVnAspectKey(vnId)` reads
   `vn.screenshots[*].dims`, tallies the buckets, and picks the
   most common one. Lets aspect filtering work for VNs whose
   VNDB releases have no `resolution` field but whose screenshots
   are sized.
5. Falls back to `unknown`.

Library URL state supports `?aspect=16:9` and `group=aspect`; the
filter EXISTS query covers all four signal sources. The VN page
exposes the manual override via the `aspect-override` section in
the VN-detail layout (reorderable like every other below-the-card
section).

Multi-shelf navigation ("Pokémon box" pattern): each shelf can
independently have its own (cols × rows) size, and the user can
page between them with the **`←` / `→` arrow keys** or the
chevron buttons either side of the tab strip. The active tab
shows `i / N` so it's clear how many shelves there are and where
you are in the list. Per-axis dim range: `1 ≤ x ≤ 200`. Tests
in `tests/shelf-layout.test.ts` cover place / swap / resize /
unplace semantics including the FK cascade.

### Manual EGS ↔ VNDB mapping ✅
Two override tables let the user pin a mapping that survives
cache invalidation and auto-rematch:

- **`vn_egs_link`** (VN → EGS): the user pins
  `(vn_id → egs_id)` from `/vn/v\d+` via `<EgsPanel>`. A pinned
  `NULL` records "this VN has no EGS counterpart" so the auto
  resolver stops trying. Highest priority in
  `resolveEgsForVn()`; survives cache refresh.
- **`egs_vn_link`** (EGS → VNDB): symmetric pin from the EGS-side
  feeds. Overlaid on top of every read of
  `fetchEgsAnticipated()` / `fetchEgsTopRanked()` (incl. cache
  hits) so the chosen mapping is visible immediately.

UI invocations on every "missing relation" surface:
- `/upcoming?tab=anticipated` rows missing `vndb_id` →
  `<MapEgsToVndbButton variant="compact">`
- `/top-ranked?tab=egs` rows missing `vndb_id` → same component
- `/egs` "Not yet linked" section (new, paginated 50 + "+N more"
  hint) → `<MapVnToEgsButton variant="compact">`
- `/vn/v\d+` EgsPanel manual picker → already wired; now writes
  the override layer so reset is sticky
- `/vn/egs_NNN` still uses `<LinkToVndbButton>` to migrate the
  whole synthetic row to a real `v\d+` id (heavyweight, distinct
  flow — see `migrateVnId()` in `lib/db.ts`)

Reset semantics: `DELETE /api/vn/[id]/erogamescape?mode=…` and
`DELETE /api/egs/[id]/vndb` clear the override. `mode=auto`
drops the cached row only; `mode=manual-none` pins the negative;
`mode=clear-manual` removes the override entirely so the auto
resolver gets a fresh shot.

13 cases in `tests/egs-manual-mapping.test.ts` cover round-trip,
upsert-on-conflict, validation, bulk overlay, and the no-override
no-op path.

### Card density slider — scoped per page ✅
Density is **per-scope**. Each listing surface (`library`,
`wishlist`, `recommendations`, `topRanked`, `upcoming`,
`dumped`, `similar`, `egs`, `producerWorks`, `staffWorks`, …)
has its own slider that writes to `density.<scope>` inside
`useDisplaySettings()`. Resolve order:

  1. URL override (`?density=N`, snapped to the clamp range).
  2. Persisted per-scope value (`density[scope]`).
  3. Legacy global fallback (`cardDensityPx`).

The legacy `cardDensityPx` is **kept** for back-compat: a
freshly-loaded settings payload with a stored `cardDensityPx`
but no `density.library` entry promotes the legacy value into
`density.library` on first read so existing sessions don't
visually jump when the new scoped model lands. Every other
scope falls back to the legacy global until its own slider is
touched.

Resolved value flows into a CSS custom property
`--card-density-px` set on the surface root. The clamp range is
`[120, 480]` so the operator can genuinely get ~2 cards per row
at the high end without forcing a horizontal scroll on mobile.

Settings → Display tab surfaces **two** sections:
  - **Default density** — the legacy global slider that seeds
    every page without its own override.
  - **Per-page overrides** — one row per scope with a Reset
    button. A bulk "Reset all per-page" button clears every
    override at once; "Reset everything" also drops the global
    back to the default.

Implementation: `src/lib/settings/client.tsx` exports
`DENSITY_SCOPES`, `resolveCardDensity()`, `hasScopeOverride()`,
and `clearAllScopeDensities()`. `<CardDensitySlider scope="…">`
is the canonical UI surface and is mounted on every grid page
header. Tests in `tests/density-scopes.test.ts` and
`tests/density-cross-scope-isolation.test.ts` pin the resolve
order, migration semantics, and the bulk-reset behaviour.

The Library on `/` keeps its dedicated dense toggle in addition
to the density slider — the toggle controls `gap` + `padding`
(comfortable vs dense), distinct from the column-count slider.

### Home page layout: drag-reorder + library section ✅
`home_section_layout_v1` (versioned JSON config) tracks both
per-section visibility/collapse state AND the render order:

```
{
  sections: {
    'recently-viewed':   { visible: true, collapsed: false },
    'reading-queue':     { visible: true, collapsed: false },
    anniversary:         { visible: true, collapsed: false },
    'library-controls':  { visible: true, collapsed: false },
    'library-grid':      { visible: true, collapsed: false }
  },
  order: ['recently-viewed', 'reading-queue', 'anniversary',
          'library-controls', 'library-grid']
}
```

- `<HomeLayoutEditorTrigger />` renders a button at the top of
  `/`. Click opens a dialog with dnd-kit (Pointer + Keyboard
  sensors) for reordering and per-row eye toggles for
  visibility. Each change PATCHes the API in real time and
  fires `vn:home-layout-changed` so live strips re-sync.
- `<HomeLibrarySection />` wraps `<LibraryClient />` in the
  same hide / collapse / reorder shell as the other home
  strips. The Library is split across two slots —
  `library-controls` (search / filters / sort toolbar) and
  `library-grid` (the cover wall). Either or both can be hidden
  / collapsed / reordered like every other section, so the
  operator can keep the toolbar visible above a hidden grid
  for fast in-page navigation, or vice versa.
- The validator accepts both the new shape AND the legacy v0
  flat shape for backward compatibility — older payloads
  upgrade transparently. Unknown ids are dropped from `order`,
  missing ids appended to the tail.
- Reset (in Settings → Home tab OR in the home-page editor
  dialog) sends `PATCH /api/settings { home_section_layout_v1:
  null }` to drop the override and fall back to defaults.

10 cases in `tests/home-section-layout.test.ts` cover default
fallback, v0/v1 shape detection, append-missing, drop-unknown,
dedupe, typo-safe visibility, malformed JSON, round-trip, plus
the `library-controls` / `library-grid` split.

### Custom tag picker for /recommendations and /similar ✅
Both pages now expose a shared `<TagPicker>` so the user can
pin a seed-tag list explicitly. Auto-derivation still kicks in
when no tags are pinned.

- `<TagPicker>`: chip strip with remove (X) buttons + an
  autocomplete input that hits `/api/tags?q=` (cached +
  throttled VNDB search). Optional `category` prop scopes the
  autocomplete to `cont` / `ero` / `tech`.
- `<SeedTagControls>`: client wrapper that mirrors the picked
  list into a URL search param (default `tags=g123,g456`) via
  `router.replace(no-scroll)`. The page reads the param
  server-side and passes `customTagIds` to `recommendVns()` /
  similar lookup.
- Both pages flip between auto-derivation hint and "custom
  pinned" hint so the user always knows which mode is active.
- Sibling URL params (`ero=1`, `vn=v123`) are preserved across
  picker writes via the `preserveParams` option.

### Synthetic releases for EGS-only VNs ✅
VNs missing from VNDB's release index (`v.*` rows with no rows in
`POST /release`, plus every `egs_*` synthetic VN) can still be
shelved through a `synthetic:<vnId>` release id. The inventory
adder shows a "Main edition" tile when no real releases exist; the
API route `/api/collection/[id]/owned-releases` accepts the
synthetic id alongside the regular `r\d+` shape. The shelf renders
a "EGS" / "Main edition" chip in place of the broken
`/release/[id]` link — every other owned-release field (location,
condition, price, dumped flag) works the same.

### Dump tracking — `/dumped` ✅
Dedicated management page that surfaces dump-completion progress
across the whole collection. Top stats grid:

| Stat | Source |
| --- | --- |
| Total editions | `SUM(total_editions)` across all VNs |
| Dumped editions | `SUM(dumped_editions)` (`owned_release.is_dumped = 1`) |
| Fully dumped VNs | rows where `dumped_editions = total_editions > 0` |
| Completion % | `SUM(dumped) / SUM(total) * 100` |

Below the stats, one card per VN with the dumped-editions ratio,
a mini progress bar, and a "fully done" badge when the count
matches. Companion to `/producers?tab=completion` — answers
"how complete is my archive?" the same way completion %
answers "how thoroughly have I read this developer?".
Helpers: `listDumpStatus()` / `getDumpSummary()` in `lib/db.ts`.

### Insurance / value tracking ✅
Same `/shelf` page — `owned_release.price_paid` + `currency` per row,
running totals at the section heading + grand total in the page
header. JSON / CSV export of the whole collection (including these
fields) lives in `/data → Exports`.

---

## VNDB-wide search

### Characters `/characters` ✅
Free-text + `c123`-id search across every VNDB character profile.
Renders 60-result cards with cover, original name, top aliases.
Explicit imagery hidden behind a per-page opt-in checkbox.

### Staff `/staff` ✅
Same idea for staff profiles. `ismain=1` filter on by default;
toggling "Include aliases" surfaces pen-name and stage-name
entries. Each result links to `/staff/[id]` which auto-fetches
the full credit graph on first visit.

### Schema browser `/schema` ✅
Renders the VNDB `/schema` endpoint as a filterable, collapsible
JSON tree, a separate local SQLite table/column section, and a
separate mirrored EGS cache-data section. Lookup any code you see in
the API (language tags, platform codes, devstatus, extlink ids).
Search highlights matches and auto-expands the path to them.

---

## Realtime + writes

### Live status feed via SSE ✅
The download status bar subscribes to
`GET /api/download-status/stream` — a Server-Sent Events feed
driven by a pub/sub bus inside `lib/download-status.ts`. Every
job lifecycle event (start / tick / error / finish) and throttle
state change emits within milliseconds; the bar never polls
unless the EventSource connection fails (in which case it falls
back to the original `/api/download-status` interval poll).
Visibility-change reconnects on tab focus so a backgrounded tab
gets a fresh snapshot immediately when the user returns.

### VNDB ulist writeback ✅
`PATCH /api/vn/[id]/vndb-status` accepts the full ulist surface:
`labels_set`, `labels_unset`, `vote` (10–100), `started`,
`finished`, `notes`. Surfaced in the UI via the
`<UlistDetailsEditor>` collapsed details panel on `/vn/[id]`.
Vote is stored as 10–100 integer on VNDB but rendered / edited
in the UI as 1.0–10.0 with one decimal for human readability.

---

## Recently shipped — round-3 increments

The items below are the most recently landed surfaces; they post-
date the batch A–N history in `PLAN.md`. Each one has a focused
test file pinning its behaviour (see `docs/test-matrix.md`).

### VNDB tags grouped view ✅
`<VnTagsGroupedView>` on `/vn/[id]` collapses the flat tag chip
strip into a categorised accordion. Categories come from the
VNDB `g.cat` enum (`cont` / `ero` / `tech`), each with its own
header, summary count, and per-group "Spoil me" override that
flips the scoped spoiler level for that section without
touching the global setting. Scored tags surface their numeric
weight inline; spoiler-mode tags are wrapped in
`<SpoilerReveal level={tag.spoiler}>` so the global content
controls still apply.

### Cover / banner rotation ✅
Per-VN `cover_rotation` and `banner_rotation` columns (0 / 90 /
180 / 270, normalised via `normalizeRotation()`). Rotate-left /
rotate-right buttons sit on `HeroBanner` and `CoverHero` in the
same hover-revealed action group as the focal-point adjust
button; a "reset rotation" affordance appears when the value
drifts from 0. `<SafeImage rotation={…}>` applies a scaled
`transform: rotate(<deg>)` measured by a ResizeObserver so 90 /
270 rotations fill the box without overflow. PATCH endpoints
extend the existing `/api/collection/[id]/cover` and `/banner`
routes with a `{ rotation }` body. i18n keys live under
`coverActions.{rotate, rotateLeft, rotateRight, resetRotation,
rotationLabel}`. Tests: `tests/cover-rotation.test.ts`,
`tests/cover-rotation-ui.test.ts`, `tests/safe-image-rotation.
test.ts`.

### Cover / banner mutation events ✅
`src/lib/cover-banner-events.ts` exports the typed
`VN_COVER_CHANGED_EVENT` / `VN_BANNER_CHANGED_EVENT` constants
plus `dispatchCoverChanged()` / `dispatchBannerChanged()`
helpers. Every cover / banner producer (MediaGallery kebab,
CoverSourcePicker, BannerSourcePicker, rotation buttons) does:
optimistic update → server PATCH → on success dispatch the
typed event so siblings repaint → `router.refresh()` as a
defensive SSR fallback → revert + toast on error. Consumers
listen with a vn-id scoped guard. Tests:
`tests/cover-banner-events.test.ts`.

### Non-library VN data refresh ✅
`/vn/[id]` can refresh VNDB / EGS metadata for a VN that is NOT
in the local collection. Previously the refresh CTA was gated
on `inCollection`; now it surfaces for every `v\d+` id, with
the refresh writing to the cache layer only (no `collection`
row created). EGS-only synthetic `egs_*` rows are still
gracefully excluded since they have no VNDB-side data to pull.
Test: `tests/vn-detail-collection-gating.test.ts`.

### Cover / banner rotation playback ✅
See "Cover / banner rotation" above.

### SpoilerReveal component ✅
`<SpoilerReveal level={0|1|2} perSectionOverride?>` is the
single shared gate for every node that may carry spoilers (tag
chips, character traits, BBCode `[spoiler]…[/spoiler]`, VNDB
metadata with a `spoiler` field). Truth table in
`src/lib/spoiler-reveal.ts`:

  1. Hidden when `nodeLevel > globalSpoilerLevel`.
  2. Pointer hover / keyboard focus → transient reveal.
  3. Touch / pen tap → toggles persistent reveal (mouse clicks
     pass through so the hover UX is preserved).
  4. Enter / Space on focus → keyboard parity with the tap
     toggle.
  5. `perSectionOverride` raises (never lowers) the effective
     level; `?spoil=1|2` deep links share the same lever.

The synopsis renderer `<VndbMarkup>` wraps `[spoiler]` blocks
through this component so rules apply identically across
server- and client-rendered surfaces. i18n keys under
`spoiler.{hidden, reveal, hideHint, revealHint, spoilMe,
hideAll, showMinor, showAll, ariaHidden, ariaShown}`. Tests:
`tests/spoiler-reveal.test.ts`,
`tests/spoiler-global-default.test.ts`,
`tests/character-spoiler-render.test.ts`.

### Series detail layout customisation ✅
`/series/[id]` mirrors the VN-detail layout pattern. Sections
are `hero` / `works` / `metadata` / `related` / `stats`, each
wrapped in a drag-reorderable / hideable / collapsible slot.
Persisted as `series_detail_section_layout_v1`. Parser tolerates
the legacy v0 flat shape, drops unknown ids, appends missing
defaults, dedupes the order array. `PATCH /api/settings` MERGES
partial patches so the per-section menu and drag-reorder never
clobber each other. CustomEvent: `SERIES_DETAIL_LAYOUT_EVENT`.
Test: `tests/series-detail-layout.test.ts`.

### Shelf read-only display knobs ✅
`<ShelfReadOnlyControls>` exposes a discreet slider trigger that
opens a popover with four controls — cell size (60–280 px),
cover scale (0.5–1.5), gap (0–24 px), fit mode (contain /
cover). Values apply via the CSS variables `--shelf-cell-px`,
`--shelf-cover-scale`, `--shelf-gap-px` on a `.shelf-view-root`
wrapper so cells reactively resize without a re-render.
Persistence is via `PATCH /api/settings` with key
`shelf_view_prefs_v1`; the validator clamps every numeric to
its documented range so a malicious PATCH can't store
`cellSizePx: 99999`. The placement data (`shelf_slot` /
`shelf_display_slot`) is NEVER touched — these knobs are pure
display preferences. Test: `tests/shelf-view-prefs.test.ts`.

### Schema browser local + EGS sections ✅
`/schema` renders the VNDB schema tree, local SQLite tables/columns
(`<SchemaLocalSection>` + `lib/schema-local.ts`), and a dedicated
mirrored EGS data section (`<SchemaEgsSection>` + `lib/schema-egs.ts`).
The EGS section lists `egs_game`, `vndb_cache` rows scoped to
`cache_key LIKE 'egs:%'`, `vn_egs_link`, `egs_vn_link`, plus a
presence flag for `app_setting.egs_username` (never the value
itself). A "Stale-while-error" badge appears when any EGS
cache row carries the flag in its JSON body. Test:
`tests/schema-egs-section.test.ts`.

### MediaGallery kebab convention ✅
Per-tile kebab dropdown in `<MediaGallery>` has a locked sizing
contract: `min-width: 12rem`, `max-width: 18rem`, constants in
`src/components/media-menu-helpers.ts`. Every row uses
`whitespace-nowrap`, `overflow-hidden`, and `text-overflow:
ellipsis`. Labels render in a **short** variant
(`t.media.openLightboxShort`, `setAsCoverShort`,
`setAsBannerShort`, `openOriginalShort`); the long form rides on
`aria-label` and `title`. Horizontal flip is rem-based via
`decideMediaMenuHorizontal(triggerRight, viewportWidth)` so a
kebab within 12 rem of the right edge opens to the left. Roving
keyboard focus across `[role="menuitem"]` rows, with
Enter / Space activating the focused row and Escape returning
focus to the kebab trigger. Test: `tests/media-menu.test.ts`.

### PortalPopover for card overlays ✅
`<PortalPopover>` is the canonical primitive for any popover
that needs to escape the card / tile clipping context. It
portals into `document.body`, computes preferred placement,
flips on viewport collision, and re-measures on scroll /
resize. The card-overlay info popovers on the shelf unplaced
pool, the lists picker on every `<VnCard>`, and the saved-filter
chips all funnel through this primitive instead of mounting
inside the card. Without the portal, the shelf-pool info
popover used to clip against `overflow: hidden` parents and the
"Add to list" panel used to flip on its own internal `z-index`
stacking context. Test: `tests/portal-popover.test.ts`.

### Platform label mapping ✅
`src/lib/platform-display.ts` exports `platformLabel(code,
dict)` which maps VNDB platform codes (`win`, `mac`, `lin`,
`ios`, `and`, `web`, `swi`, `ps3`, …) to localised display
labels (FR / EN / JA). Duplicate keys collapse; unknown codes
fall back to the raw uppercase form so a freshly-added VNDB
platform code never silently breaks the page. Every card
chip, search-filter chip, and release row uses this helper
instead of rendering the raw code. Tests:
`tests/platform-display.test.ts`, `tests/platform-label.test.ts`.

### VNDB BBCode link normalization ✅
`src/lib/vndb-link-normalize.ts` rewrites VNDB-flavoured links
at render time so internal references jump to the matching App
Router route instead of dead `/cNNN` paths. Three input shapes:
absolute `https://vndb.org/cNNN`, bare `cNNN`, and relative
`/cNNN`. Mapping: `v` → `/vn/v…`, `c` → `/character/c…`,
`r` → `/release/r…`, `p` → `/producer/p…`, `g` → `/tag/g…`,
`i` → `/trait/i…`, `s` → `/staff/s…`. Unknown prefixes
(`d`/doc, `u`/user, `t`/thread, `w`/review) keep their external
URL. Normalisation runs at render via `<VndbMarkup>` /
`<CustomSynopsis>`, NOT during ingest, so the cache layer
keeps the raw VNDB payloads and any future policy change
applies retroactively without a cache rebuild. Test:
`tests/vndb-link-normalize.test.ts`.

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
| `producer` | VNDB producer mirror | id, name, original, lang, type, description, aliases JSON, extlinks JSON, logo_path, fetched_at |
| `series` / `series_vn` | VNDB-relation-aware groupings | series.id, series_vn.{series_id, vn_id, order_index} |
| `user_list` | Universal user-curated lists | id, name, slug UNIQUE, description, color, icon, pinned, created_at, updated_at |
| `user_list_vn` | List membership join | list_id FK, vn_id (no FK), order_index, added_at, note |
| `vn_route` | Per-VN route list | id, vn_id, name, completed, completed_date, order_index, notes |
| `vn_quote` | Cached VNDB quotes | quote_id, vn_id, quote, score, character_id |
| `vn_staff_credit` | Indexed staff role table | vn_id, sid, role, name |
| `vn_va_credit` | Indexed VA + character table | vn_id, sid, c_id, c_name, c_image_url, va_name |
| `vn_activity` | Reading-log audit trail | id, vn_id, kind, payload JSON, occurred_at |
| `vn_game_log` | Free-form timestamped journal | id, vn_id FK, note, logged_at, session_minutes, created_at, updated_at |
| `owned_release` | Physical / digital inventory | composite PK (vn_id, release_id); columns: location, edition_label, condition, price_paid, currency, acquired_date, purchase_place, dumped, notes |
| `character_image` | Local mirror of VNDB character images | character_id PK, local_path, original_url, fetched_at |
| `shelf_unit` | One per "real shelf" the user models | id, name, cols, rows, order_index, created_at, updated_at |
| `shelf_slot` | Sparse placement table (one row per occupied cell) | composite PK (shelf_id, row, col); UNIQUE(vn_id, release_id); FK on (vn_id, release_id) cascades from owned_release |
| `shelf_display_slot` | Face-out / front-display shelf slots | composite PK (shelf_id, after_row, position); UNIQUE(vn_id, release_id); FK on (vn_id, release_id) cascades from owned_release |
| `release_resolution_cache` | Normalized VNDB release resolutions | release_id PK, **vn_id (nullable, lazily filled)**, width, height, raw_resolution, aspect_key, fetched_at |
| `owned_release_aspect_override` | Manual aspect/resolution corrections per owned edition | composite PK (vn_id, release_id); width, height, aspect_key, note, updated_at |
| `vn_aspect_override` | VN-level manual aspect override (highest priority) | vn_id PK (FK→vn), aspect_key, note, updated_at |
| `vn_egs_link` | Manual VN→EGS mapping override (sticky) | vn_id PK (FK→vn), egs_id (nullable: NULL = "no EGS"), note, updated_at |
| `egs_vn_link` | Manual EGS→VNDB mapping override (overlaid on EGS-side feeds) | egs_id PK, vn_id (nullable: NULL = "no VNDB"), note, updated_at |
| `staff_credit_index` | Derived index from `staff_full` cache | (sid, vn_id, is_va) — narrows brand-overlap scans before parsing JSON |
| `character_vn_index` | Derived index from `char_full` cache | (character_id, vn_id) — narrows trait fan-out before parsing JSON |
| `app_setting_audit` | Append-only audit log | id, key, prior_preview, next_preview, changed_at — last 4 chars only |
| `vndb_cache` | HTTP cache for VNDB + EGS responses | cache_key, body, etag, last_modified, fetched_at, expires_at |
| `app_setting` | Misc key/value store | key, value |
| `saved_filter` | Saved filter combos | id, name, params, position |
| `reading_goal` | Yearly goals | year, target |
| `reading_queue` | Priority queue separate from Planning | vn_id PK, position, added_at |
| `steam_link` | VN ↔ Steam appid map | vn_id, appid, steam_name, source, last_synced_minutes |

Migrations are idempotent via `ensureColumn` / `CREATE TABLE IF NOT
EXISTS`, with marker rows in `app_setting` for one-shot data migrations
(e.g. EGS playtime hours → minutes, EGS id colon → underscore).
