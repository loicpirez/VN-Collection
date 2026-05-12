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
links to its staff page.

### Series auto-detect ✅
When the VN's VNDB relations include other in-collection entries, the
detail page surfaces a card proposing "Join series X" or "Create series
Y" with a name derived from the longest common prefix.

### Routes ✅
Per-VN ordered list of routes (e.g. "Saber → Rin → Sakura") with completion
tracking and free-form notes.

### Per-route notes ✅
Each route entry can carry its own notes + completion date.

### Smart status hint ✅
Non-intrusive banner: "you've logged ≥ VNDB length — mark as completed?"
when `playtime_minutes >= length_minutes` and status is `playing`.

### Banner + custom cover ✅
Upload a banner image and position its focal point with a drag pin.
Custom cover overrides both VNDB and EGS posters.

### Owned editions ✅
Track every physical / digital copy: location, edition label, box type,
condition, price paid, currency, acquired date, photos.

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
`/upcoming` — future releases from producers already in your collection.
Grouped by month, with patch / freeware / 18+ chips per entry.

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

### VNDB list write-back 🧪
Status changes locally also `PATCH /ulist/<id>` against VNDB when a
token is set. Mapping local statuses → VNDB labels is documented in
[`src/lib/vndb-sync.ts`](src/lib/vndb-sync.ts).

### ErogameScape ✅
SQL form scraping for scores, playtime medians, brand, genre, comments.
Typed `EgsUnreachable` error (network / server / throttled / blocked)
propagates to the UI so transient outages don't wipe matched rows.

### Steam playtime sync 🧪
When a VN's release has a Steam extlink and the user provides a Steam
API key, pull `playtime_forever` minutes and merge into the local
`playtime_minutes` after a confirmation dialog.

### Anime adaptations 🧪
Surfaces an "Anime adaptation" chip on the detail page when the VN has
`has_anime` (queried lazily). Links out to AniDB / Anilist.

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

### Tutorial tour ✅
First-time visitors get a guided pass over the most important surfaces
(library, search, VN detail, settings, stats). Re-runnable from
`/data → Tour`.

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

### QR labels (print view) 🧪
`/labels?ids=…` prints a sheet of QR codes that point back to the VN's
detail page. Tape them to your boxes for instant lookup.

### Shelf visualisation 🧪
`/shelf` groups owned editions by `physical_location` and renders them
as boxes-on-shelves. Hover for the cover + edition label.

### Insurance / value tracking 🧪
`owned_release` already carries `price_paid` and `currency`; the shelf
view sums it per location and exposes a CSV export.

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
