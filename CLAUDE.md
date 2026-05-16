# CLAUDE.md — Agent / Developer Guide

> Read this **first** before making any changes. It explains the design choices,
> the conventions used everywhere, and the small list of footguns we've hit
> while building this.

---

## Project at a glance

**What it is**: a single-user, self-hosted Visual Novel collection manager.
Owner runs it locally on `localhost:3000`. No login, no cloud, no telemetry.

**What it does**: mirrors metadata + images from [VNDB Kana API v2](https://api.vndb.org/kana)
**and** [ErogameScape's public SQL form](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/)
into a local SQLite, lets the owner annotate every VN (status, playtime, notes,
edition inventory, banner …), groups them in series / routes, and surfaces stats.
VNDB and EGS coexist per-field via a source-resolve helper (auto / VNDB / EGS).

**Non-goals**: multi-user, public sharing, mobile-first, accessibility-first.
We optimise for the desktop power-user use case (large screens, mouse, French/English/Japanese).

---

## Stack snapshot

| | |
| --- | --- |
| Runtime | Node 20+ |
| Framework | **Next.js 16** App Router · React 19 · TypeScript strict |
| Styling | **Tailwind 3.4**, no component lib, dark theme baked in `globals.css` |
| Icons | **lucide-react** — never use unicode pictographs |
| DB | **better-sqlite3 11**, sync, WAL, single file at `data/collection.db` |
| Markdown | react-markdown + remark-gfm (notes only) |
| Tests | Vitest (`yarn test` / `yarn test:watch`). Per-worker temp SQLite via `tests/setup.ts`. Smoke tests under `scripts/smoke.sh`. |
| Next.js version | 16.x with Turbopack default. `next dev` writes to `.next/dev`, `next build` to `.next/`. Concurrent execution works. |
| Lint | `next lint` was removed in Next 16. No formal linter wired in yet; tsc + tests are the safety net. |
| Proxy / middleware | The `middleware` filename was renamed to `proxy` in Next 16. CSRF guard lives at `src/proxy.ts` (Node.js runtime). |

The sandbox runs `yarn build` to verify TypeScript + Next routes compile.
Always run it before declaring a change "done".

---

## Repository layout

```
vndb-collection/
├── data/                              # gitignored — SQLite + downloaded images
│   ├── collection.db (+ .db-shm/.db-wal)
│   └── storage/                        # subdirs auto-created lazily on first write
│       ├── vn/         (cover + thumb)
│       ├── vn-sc/      (screenshots + release pkg artwork)
│       ├── cover/      (user-uploaded custom cover/banner)
│       ├── producer/   (publisher logos)
│       ├── series/     (series cover + banner, written by /api/series/[id]/image)
│       └── character/  (VNDB character images mirrored by downloadCharacterImages)
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── layout.tsx                  # I18nProvider + DisplaySettings + nav + QuoteFooter
│   │   ├── page.tsx                    # Library (Suspense + LibraryClient)
│   │   ├── search/page.tsx             # SearchClient (debounced + advanced filters)
│   │   ├── producers/page.tsx          # Two-tab ranking: Developers / Publishers
│   │   ├── producer/[id]/page.tsx      # Producer detail — dev section + pub section
│   │   ├── series/page.tsx             # Series management
│   │   ├── series/[id]/page.tsx        # Series detail
│   │   ├── tags/page.tsx               # Tag browser (click → /?tag=g…)
│   │   ├── traits/page.tsx             # Trait browser
│   │   ├── stats/page.tsx              # Charts + cache panel + import/export
│   │   ├── character/[id]/page.tsx     # Character detail with "appears in" gallery
│   │   ├── vn/[id]/page.tsx            # The big VN detail page
│   │   ├── not-found.tsx
│   │   └── api/                        # see "API surface" below
│   ├── components/
│   │   ├── LibraryClient.tsx           # URL-driven filters/sort/group, debounced search
│   │   ├── SearchClient.tsx            # Quick + advanced VNDB search
│   │   ├── EditForm.tsx                # Per-VN tracking + inventory + series picker
│   │   ├── MarkdownNotes.tsx           # tabbed editor + MarkdownView
│   │   ├── MediaGallery.tsx            # Combined screenshot + release art lightbox
│   │   ├── CharactersSection.tsx       # Lazy-loaded section on VN detail
│   │   ├── ReleasesSection.tsx
│   │   ├── VnDetailLayout.tsx          # dnd-kit reorder/hide/collapse VN sections
│   │   ├── QuotesSection.tsx
│   │   ├── QuoteFooter.tsx             # Hover-reveal random quote (lazy)
│   │   ├── SafeImage.tsx               # Hide / blur-R18 / prefer-local
│   │   ├── VnCard.tsx                  # Library/Search/Series card (React.memo)
│   │   ├── StatusBadge.tsx · StatusIcon.tsx
│   │   ├── CoverUploader.tsx · BannerControls.tsx · SetBannerButton.tsx
│   │   ├── DownloadAssetsButton.tsx · BulkDownloadButton.tsx
│   │   ├── ProducerLogo.tsx · ProducerLogoUpload.tsx
│   │   ├── SeriesManager.tsx · SeriesAddVnForm.tsx · SeriesRemoveVn.tsx
│   │   ├── SettingsButton.tsx          # Modal portal → escapes header stacking ctx
│   │   ├── LanguageSwitcher.tsx
│   │   ├── CachePanel.tsx · ImportPanel.tsx
│   │   └── charts/BarChart.tsx         # HBarChart, VBarChart, DonutChart (SVG)
│   └── lib/
│       ├── db.ts                       # SQLite, schema migrations, all queries
│       ├── vndb.ts                     # VNDB API client (server-only)
│       ├── vndb-cache.ts               # cachedFetch with TTL + ETag + dedupe
│       ├── vndb-types.ts               # types shared with client (no 'server-only')
│       ├── erogamescape.ts             # EGS SQL form client (server-only) + resolveEgsForVn
│       ├── source-resolve.ts           # resolveField helper (VNDB-first auto-fallback)
│       ├── types.ts                    # Domain types
│       ├── files.ts                    # storage bucket helpers (download, save, read)
│       ├── assets.ts                   # ensureLocalImagesForVn (covers + sc + release art + char + EGS)
│       ├── vn-detail-layout.ts         # versioned VN detail section layout config
│       ├── home-section-layout.ts      # versioned home strip visibility/collapse config
│       ├── aspect-ratio.ts             # resolution → aspect bucket helpers
│       ├── settings/client.tsx         # DisplaySettingsProvider (localStorage) + resolveTitles
│       └── i18n/
│           ├── dictionaries.ts         # FR / EN / JA, type-safe via Widen<>
│           ├── server.ts               # getLocale() + getDict() (cookie-based)
│           ├── actions.ts              # setLocale Server Action
│           └── client.tsx              # I18nProvider + useT + useLocale
├── .env.example                        # Template — never commit .env.local
├── .gitignore
├── next.config.mjs                     # serverExternalPackages: ['better-sqlite3']
├── tailwind.config.ts                  # Custom palette (bg, status colors, accent)
├── package.json
├── README.md
└── CLAUDE.md   ← you are here
```

---

## API surface

Routes prefixed `/api/`. All are dynamic, runtime `nodejs`, `force-dynamic` cache.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/collection` | List + stats (filters: status, **producer** (developer side), **publisher** (publisher side), series, tag, q, sort, order). Sort accepts `producer` / `publisher`; group accepts `producer` / `publisher`. |
| POST | `/api/collection/[id]` | **First add: triggers `ensureLocalImagesForVn`** synchronously |
| PATCH | `/api/collection/[id]` | Update tracking fields |
| DELETE | `/api/collection/[id]` | Remove from collection |
| POST | `/api/collection/[id]/cover` | Upload custom cover (multipart) |
| DELETE | `/api/collection/[id]/cover` | Reset cover |
| POST | `/api/collection/[id]/banner` | Set banner (multipart upload OR `{ source, value }` JSON) |
| DELETE | `/api/collection/[id]/banner` | Reset banner |
| POST | `/api/collection/[id]/assets?refresh=true` | Force VNDB metadata refresh + redownload images |
| GET | `/api/collection/export` | JSON dump (file download) |
| POST | `/api/collection/import` | Restore from JSON (raw or multipart) |
| GET | `/api/backup` | Stream the `.db` file (after WAL checkpoint) |
| GET | `/api/files/[...path]` | Serve any file under `data/storage/` (with Cache-Control immutable) |
| GET | `/api/search?q=` | Quick VN search |
| POST | `/api/search/advanced` | Multi-filter VN search (langs, platforms, length, year, rating, has_*) |
| GET | `/api/vn/[id]` | VN detail (cache 24 h via DB) |
| GET | `/api/vn/[id]/characters` | Characters of a VN |
| GET | `/api/vn/[id]/releases` | Releases of a VN |
| GET | `/api/vn/[id]/quotes` | Quotes of a VN |
| GET | `/api/character/[id]` | Character detail |
| GET | `/api/release/[id]` | Single release |
| GET | `/api/staff?q=` | Staff search |
| GET | `/api/tags?q=&category=` | Tag search/browse |
| GET | `/api/traits?q=` | Trait search/browse |
| GET | `/api/producer/[id]` | Producer detail (cache 24 h) |
| POST | `/api/producer/[id]/refresh` | Bust the dev (`POST /vn:producer`) + pub (`POST /release:producer`) cache rows then re-fetch. Used by the per-page Refresh button on `/producer/[id]`. |
| POST | `/api/producer/[id]/logo` | Upload producer logo |
| DELETE | `/api/producer/[id]/logo` | Reset logo |
| GET | `/api/producers` | Returns both `producers` (developer ranking) and `publishers` (publisher ranking) arrays. |
| GET | `/api/series` / POST | List + create |
| GET/PATCH/DELETE | `/api/series/[id]` | CRUD |
| POST/DELETE | `/api/series/[id]/vn/[vnId]` | Link/unlink VN |
| GET | `/api/vndb/stats` | Global VNDB counters |
| GET | `/api/vndb/auth` | Token info / username / permissions |
| GET | `/api/vndb/quote/random` | Random quote (TTL = 0, never cached) |
| GET | `/api/vndb/cache` | Cache stats |
| DELETE | `/api/vndb/cache` (`?mode=expired|prefix&prefix=…`) | Invalidate cache |
| GET/PATCH | `/api/settings` | Read / update app settings. SAFE_KEYS include `vndb_token`, `random_quote_source`, `default_sort`, `default_order`, `default_group`, `home_section_layout_v1`, `vn_detail_section_layout_v1`, `vndb_writeback`, `vndb_backup_url`, `vndb_backup_enabled`, `steam_api_key`, `steam_id`, `egs_username`, `vndb_fanout`. Sensitive keys (token / Steam key / backup URL) leave a tail in `app_setting_audit`. |
| GET | `/api/wishlist` | Authenticated wishlist (ulist label 5) + in_collection + EGS hint |
| DELETE | `/api/wishlist/[id]` | Remove a VN from VNDB wishlist (PATCH labels_unset=[5]) |
| GET/POST/PATCH/DELETE | `/api/collection/[id]/owned-releases` | Per-edition inventory (location, edition_label, condition, price, dumped, aspect override…) |
| GET/POST/PATCH/DELETE | `/api/collection/[id]/game-log` | Per-VN free-form timestamped notes (`vn_game_log`) |
| GET/PATCH | `/api/collection/[id]/source-pref` | Per-VN / per-field source preference JSON |
| GET/POST/DELETE | `/api/vn/[id]/erogamescape` | Resolve / link / unlink an EGS game for a VN |
| GET | `/api/vn/[id]/erogamescape?refresh=1` | Force re-fetch of every EGS column |
| GET/PATCH/DELETE | `/api/vn/[id]/vndb-status` | Read the user's VNDB ulist labels for a VN + toggle them via `labels_set` / `labels_unset` |
| GET | `/api/vn/[id]/lists` | Lists this VN belongs to |
| POST | `/api/egs/[id]/add` | EGS-only add → synthetic VN id `egs_<id>` + collection insert |
| GET | `/api/egs/search?q=&limit=` | EGS candidate search (used by /search and the manual-link picker) |
| GET | `/api/egs-cover/[id]` | Tiered cover resolver for an EGS game (proxies bytes server-side) |
| GET | `/api/egs-cover/[id]/candidates` | Enumerate every known EGS cover source (banner, VNDB, image.php, Suruga-ya, DMM, DLsite, Gyutto) without probing — UI shows them side-by-side |
| GET | `/api/route/[routeId]` / PATCH / DELETE | Per-route management |
| GET/POST/PATCH | `/api/collection/[id]/routes` | Per-VN routes (autocomplete from cast) |
| GET / POST | `/api/lists` | List / create user lists |
| GET / PATCH / DELETE | `/api/lists/[id]` | List CRUD |
| POST / DELETE | `/api/lists/[id]/items` | Add / remove / reorder list members |
| POST | `/api/refresh/global` | Bust EGS cover cache + re-fetch page-level caches. Gated behind `requireLocalhostOrToken`. |
| GET | `/api/download-status` | Polling snapshot of every in-flight fan-out job + throttle stats. Fallback for clients without `EventSource`. |
| GET | `/api/collection/[id]/activity` | Per-VN audit-trail entries (status / playtime / rating changes + manual notes) |
| GET/POST | `/api/collection/[id]/custom-description` | Per-VN user-authored synopsis override |
| GET | `/api/collection/find?q=` | Fuzzy in-collection title search (used by the Steam linker) |
| POST | `/api/collection/full-download` | Selective bulk fan-out for a subset of VNs |
| POST | `/api/collection/order` | Custom-sort drag order writeback |
| GET | `/api/collection/tags`, `/api/collection/traits` | Aggregated tag / trait usage across the collection |
| GET | `/api/export/csv` / `/api/export/ics` / `/api/export/raw` | CSV / iCal / raw-cache exports |
| POST | `/api/backup/restore` | DB / JSON import (multipart) |
| GET | `/api/maintenance/duplicates` / `/api/maintenance/stale` | Diagnostics for the data-maintenance panel |
| GET | `/api/places` | Distinct values seen in `owned_release.physical_location` |
| GET/POST | `/api/reading-goal` | Per-year target; POST upserts the row. |
| GET/POST/DELETE/PATCH | `/api/reading-queue` | Personal "play next" queue; POST adds, DELETE removes, PATCH reorders. |
| GET/POST/DELETE/PATCH | `/api/saved-filters` (+ `/[id]` for DELETE) | Pinned URL-param presets above the library filters. PATCH reorders. |
| GET | `/api/egs/sync` | Suggestions table for the EGS reviews fan-out (paired with POST below) |
| POST | `/api/egs/sync` | Apply EGS reviews / playtime sync for confirmed rows |
| GET | `/api/series/[id]/image` | Series cover / banner asset |
| GET/POST/DELETE | `/api/series/[id]/vn/[vnId]` | Per-VN series membership (POST link, DELETE unlink). |
| POST | `/api/search/textual` | Server-side filtered text search |
| POST | `/api/staff/[id]/download` | Trigger full VNDB credit-list fan-out for a staff profile |
| GET | `/api/steam/library` / `POST /api/steam/link` / `POST /api/steam/sync` | Steam integration endpoints |
| POST | `/api/vn/[id]/link-vndb` | Promote an `egs_NNN` synthetic VN to a real `v\d+` once VNDB knows it |
| POST | `/api/vndb/pull-statuses` | Bulk refresh of users' ulist labels |
| GET | `/api/shelves[?pool=1]` | List shelves; `?pool=1` also returns the unplaced editions |
| POST | `/api/shelves` | Create a shelf `{name, cols?, rows?}` |
| PATCH | `/api/shelves` | Reorder `{order: id[]}` |
| GET | `/api/shelves/[id]` | Shelf + every placed slot (joined with VN + owned-release display data) |
| PATCH | `/api/shelves/[id]` | Rename `{name}` and/or resize `{cols?, rows?}`. Resize returns `evicted[]` so the UI can warn |
| DELETE | `/api/shelves/[id]` | Delete a shelf; slots cascade to the unplaced pool |
| POST | `/api/shelves/[id]/slots` | Place an owned edition at `(row, col)` — atomic swap if both ends are slots |
| DELETE | `/api/shelves/[id]/slots` | Return an edition to the unplaced pool |
| GET | `/api/download-status/stream` | SSE stream of the download-status snapshot (pub/sub driven, with keep-alive comments every 25 s) |

---

## Database schema

All managed via raw SQL in `lib/db.ts`. We never run a migration tool — the
`ensureColumn(db, table, column, ddl)` helper at startup `ALTER TABLE` if the
column is missing. **Always use `ensureColumn` for new fields** so existing
DBs upgrade transparently.

```
vn               PK id           — VNDB id (v123)
                  title, alttitle, image_url, image_thumb, image_sexual, image_violence,
                  released, olang, devstatus, languages, platforms,
                  length, length_minutes, length_votes,
                  rating, votecount, average,
                  description, titles (JSON), aliases (JSON), extlinks (JSON),
                  developers (JSON), publishers (JSON), tags (JSON),
                  screenshots (JSON), release_images (JSON), relations (JSON),
                  has_anime, editions (JSON), staff (JSON), va (JSON),
                  local_image, local_image_thumb, custom_cover, banner_image, banner_position,
                  raw (full VNDB payload), fetched_at
                  — Most JSON columns are added via `ensureColumn` migrations
                  so older DBs upgrade in place. See `db.ts` lines 351–422.

collection       PK vn_id (FK→vn)
                  status, user_rating, playtime_minutes, started_date, finished_date,
                  notes, favorite, location, edition_type, edition_label,
                  physical_location, box_type, download_url, dumped, custom_description,
                  custom_order,
                  source_pref (JSON: {description:'egs', image:'vndb', …}),
                  added_at, updated_at

owned_release    PK (vn_id, release_id)
                  notes, location, physical_location (JSON), box_type, edition_label,
                  condition, price_paid, currency, acquired_date, purchase_place,
                  dumped, added_at

vn_route         PK id (auto)
                  vn_id, name, completed, completed_date, order_index, notes,
                  created_at, updated_at

character_image  PK character_id      — local mirror of VNDB character images
                                       (populated by downloadCharacterImages())
                  url, local_path, fetched_at

egs_game         PK vn_id (FK→vn)
                  egs_id, gamename, gamename_furigana, brand_id, brand_name,
                  model, description, image_url, local_image, okazu, erogame,
                  raw_json (full gamelist row), median, average, dispersion,
                  count, sellday, playtime_median_minutes,
                  source ('extlink' | 'search' | 'manual' | NULL when no match),
                  fetched_at

app_setting      PK key
                  value                — used for vndb_token, random_quote_source

vn (additions)   egs_only INT — synthetic entries from /api/egs/[id]/add use
                  id format `egs_<numeric>` and skip VNDB-only operations

producer         PK id           — VNDB producer id (p123)
                  name, original, lang, type, description, aliases (JSON),
                  extlinks (JSON), logo_path, fetched_at

series           PK id (auto)
                  name (UNIQUE), description, cover_path, banner_path,
                  created_at, updated_at

series_vn        PK (series_id, vn_id), order_index

vn_quote         PK quote_id
                  vn_id, quote, score, character_id, character_name, fetched_at
                  — Mirrors VNDB's `/quote` payload per VN.

vn_staff_credit  no formal PK; indexed on (vn_id, sid)
                  vn_id, sid, aid, eid, role, note, name, original, lang
                  — Materialized from vn.staff JSON for fast aggregate queries

vn_va_credit     no formal PK; indexed on (vn_id, sid)
                  vn_id, sid, aid, c_id, c_name, c_original, c_image_url,
                  va_name, va_original, va_lang, note
                  — Joins vn ↔ staff ↔ character for the seiyuu page

saved_filter     PK id (auto)
                  name, params, position, created_at

reading_queue    PK vn_id
                  position, added_at

reading_goal     PK year
                  target, updated_at

steam_link       PK vn_id (FK→vn)
                  appid, steam_name, source ('auto'|'manual'),
                  last_synced_minutes, created_at, updated_at

shelf_unit       PK id (auto)
                  name, cols, rows, order_index, created_at, updated_at
                  — Drag-and-drop 2-D shelf grid, /shelf?view=layout

shelf_slot       PK (shelf_id, row, col)
                  vn_id, release_id, placed_at
                  UNIQUE (vn_id, release_id) — one slot per edition.
                  All writes go through `placeShelfItem` for atomic
                  swap-or-evict semantics.

shelf_display_slot PK (shelf_id, after_row, position)
                  vn_id, release_id, placed_at
                  UNIQUE (vn_id, release_id) — face-out display rows.
                  All writes go through `placeShelfDisplayItem`.

release_resolution_cache PK release_id
                  vn_id (nullable, lazily filled by upsertReleaseResolutionCache
                          so aspect filters can match a VN without owned_release),
                  width, height, raw_resolution, aspect_key, fetched_at

owned_release_aspect_override PK (vn_id, release_id)
                  width, height, aspect_key, note, updated_at
                  — per-edition manual override

vn_aspect_override PK vn_id (FK→vn)
                  aspect_key, note, updated_at
                  — VN-level manual override. Highest priority in the
                  derivation chain: vn_aspect_override > per-edition
                  override > release_resolution_cache (owned or vn-bound)
                  > vn.screenshots dims fallback > unknown. See
                  `deriveVnAspectKey(vnId)` in lib/db.ts.

user_list        PK id (auto)
                  name, slug (UNIQUE), description, color, icon,
                  pinned BOOL, created_at, updated_at

user_list_vn     PK (list_id, vn_id)
                  order_index, added_at, note
                  — NO FK on vn_id so anticipated / wishlist entries
                  — that aren't in `vn(id)` yet can be tracked

vn_activity      PK id (auto)
                  vn_id (FK→vn), kind, payload JSON, occurred_at

vn_game_log      PK id (auto)
                  vn_id (FK→vn), note, logged_at, session_minutes NULL,
                  created_at, updated_at

vndb_cache       PK cache_key
                  body, etag, last_modified, fetched_at, expires_at
                  cache_key format: "{METHOD path}|{METHOD}|{sha1(body)[:16]}"
                  Also hosts EGS cover resolver entries under
                  "egs:cover-resolved:<egs_id>" with shorter neg-TTL.
```

---

## ErogameScape integration (lib/erogamescape.ts)

EGS exposes a **public SQL form** at
`erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer.php`.
No API key, no auth — we just send a polite `User-Agent` and cache every
response (CSV) in the shared `vndb_cache` table.

### Resolution path

1. `resolveEgsForVn(vnId)` short-circuits for `egs_<id>` synthetic VNs
   (the encoded number IS the EGS id).
2. Otherwise it pulls the VN's releases via VNDB, scans each release's
   `extlinks` array for `ErogameScape` → that's `source: 'extlink'`.
3. If no extlink, name-search EGS using the VN's alttitle (Japanese) then
   title → `source: 'search'`.
4. The user can override via the manual picker → `source: 'manual'`.
5. The full result (including a `null` "no match") is persisted in
   `egs_game` so cards / library / stats can read it without re-hitting EGS.

### SQL conventions

- **Endpoint** is `sql_for_erogamer_form.php` (the bare `sql_for_erogamer.php`
  is a 404), **POST only** (GET re-renders the input form), and the
  response is **HTML**. The `format=csv` param is silently ignored;
  we parse the last `<table>`. There is no `_csv` endpoint.
- **Postgres on EGS rejects explicit `NULLS LAST`** on the public SQL
  form. Use `ORDER BY (col IS NULL), col DESC` instead.
- **Real column names** (don't trust documentation, verify against
  `information_schema.columns`):
  - `count2` (not `count`) for vote count
  - `average2` for average, `stdev` for dispersion
  - `furigana` (not `gamename_furigana`) for the kana reading
  - `gamelist.brandname` is the brand FK id (numeric); JOIN
    `brandlist b ON g.brandname = b.id` and alias `b.brandname AS brand_name`
  - `gamelist.shoukai` is a URL (publisher's product page), not a synopsis
  - `total_play_time_median` is in `gamelist`, but the per-user
    `play_time` lives in `userreview` (no `user_review_for_game` table)
- Description: there is no structured synopsis column. We fetch the
  highest-`point` `userreview.long_comment` as a stand-in.
- Median playtime: computed locally from `userreview.play_time` (sorted,
  middle value), with `gamelist.total_play_time_median` as backup.
- Cover image: `gamelist.banner_url` first, then the `image.php?game=N`
  redirector as fallback.
- Search both `gamename` and `furigana` so romaji / hiragana queries hit.
- `SELECT g.*` on every game query so the full row lands in `raw_json`.
  `EgsRichDetails` reads from `raw_json` to surface columns the panel
  doesn't first-class (erogetrailers, dmm, dlsite_id, gyutto_id, genre,
  axis_of_soft_or_hard, max2, min2, median2, hanbaisuu, POV A/B/C, …).

### Synthetic VN ids (`egs_<id>`)

- Used by `/api/egs/[id]/add` when a game isn't on VNDB.
- `markVnEgsOnly()` flips `vn.egs_only = 1`; `isEgsOnly()` checks it.
- VNDB helpers (`getCharactersForVn`, `getReleasesForVn`, `getQuotesForVn`)
  early-return `[]` for any id not starting with `v` so server pages
  render cleanly for EGS-only entries.
- `loadVn()` on `/vn/[id]` skips the VNDB refresh for `isEgsOnly(id)` VNs.

### Shelf layout (`shelf_unit` + `shelf_slot` + `shelf_display_slot`)

- `shelf_unit` rows model named physical shelves with `(cols, rows)`
  dimensions, clamped to `[1, 200]` server-side. `order_index` controls
  tab order on `/shelf?view=layout`.
- `shelf_slot` is sparse: a row exists only for occupied slots. The
  PRIMARY KEY `(shelf_id, row, col)` enforces "one edition per slot";
  the UNIQUE `(vn_id, release_id)` enforces "one slot per edition".
- `shelf_display_slot` is the face-out / front-display layer between
  rows. `after_row` ranges `0..rows` (top, between rows, bottom);
  `position` ranges `0..cols-1`. It also has UNIQUE `(vn_id,
  release_id)`, and the DB helpers delete the same edition from the
  other placement table before inserting.
- `placeShelfItem` runs the entire move/swap/evict logic inside a
  single `db.transaction(...)` to avoid the half-state where the
  UNIQUE constraint refuses an insert. Always go through that helper
  — never write to `shelf_slot` directly.
- Resizing through `resizeShelf` returns the evicted slot list (rows
  outside the new bounds, including front-display rows/positions) so
  callers can surface "N editions moved to unplaced" warnings. Slots
  are NOT silently lost.
- Pool query (`listUnplacedOwnedReleases`) is a `NOT EXISTS` subquery
  across both `shelf_slot` and `shelf_display_slot`.

### Synthetic release ids (`synthetic:<vnId>`)

- Used by the shelf adder when a VN has **zero** rows in
  `POST /release` (the common case for `egs_*` VNs, occasionally for
  `v*` VNs as well). Lets the user shelve a "Main edition" without a
  real release id.
- Validated in `/api/collection/[id]/owned-releases` via
  `validateReleaseId(raw, vnId)` — accepts either `r\d+` (case-
  insensitive, lowercased) or the literal `synthetic:<vnId>` for the
  current VN. Reject everything else.
- `/shelf` detects `release_id.startsWith('synthetic:')` and renders
  plain text instead of a broken `/release/[id]` link.
- All other owned-release columns (location, condition, currency,
  dumped flag) work identically.

### Per-field source preference

- Stored in `collection.source_pref` as JSON: `{ description: 'egs', image: 'auto' }`.
- Resolver: `resolveField(vndb, egs, pref)` (lib/source-resolve.ts).
  - Explicit pref (`vndb` | `egs`) wins when that side has content.
  - Falls back to the other side if the preferred is empty.
  - `auto` (default) = VNDB first with EGS fallback.
- UI: `<FieldCompare>` (text) + `<CoverCompare>` (image) provide a
  "Compare" toggle that expands into a side-by-side view with per-column
  "Use this" actions.

### Footguns

- **EGS schema isn't 100% standardised** — some columns may be missing
  on certain mirrors. Always `?? null` and verify with the raw row.
- **CSV parser** is RFC 4180 compliant for the cases EGS produces; if a
  row has embedded newlines inside a quoted cell, the existing parser
  handles it — don't simplify to `text.split('\n')`.
- **Random quote with random=1 + filters**: VNDB allows it but limits
  the predicate count. `getRandomQuoteForVns()` picks one random VN
  client-side and queries for one quote on that single VN.

---

## VNDB token resolution

`readVndbToken()` in `lib/vndb.ts` checks the DB (`app_setting.vndb_token`)
first, then `process.env.VNDB_TOKEN`. The Settings panel can set / clear
the DB value at runtime; a Node-side `require('./db')` is used inside the
helper so importing `vndb.ts` from edge / build contexts doesn't break.

---

## Conventions

### i18n
- Every user-facing string lives in `src/lib/i18n/dictionaries.ts` under `fr` / `en` / `ja`.
- Server components: `const t = await getDict()` then `t.section.key`.
- Client components: `const t = useT()`.
- Adding a new key: add it to **all three locales**. The `Widen<>` helper makes
  TypeScript flag mismatches.
- Status / location / edition labels are looked up via `t.status[key]` etc.,
  never hardcoded.

### URL-as-state
- Library filters (status, **producer** (developer side), **publisher**
  (publisher side, separate from producer), series, tag, q, sort,
  order, group) are derived **from `useSearchParams`**, not from
  `useState`. Setters update the URL via `router.replace(..., { scroll: false })`.
- Only the search input (`qInput`) keeps a local mirror, debounced 300 ms → URL.
- The `q` text box reads back from URL on changes (`useEffect → setQInput(urlQ)`)
  so external clears (e.g. "Reset" button) propagate.

### Images
- **Always** use `<SafeImage>` for any user/VNDB image. It honours the global
  Display settings: hide, blur R18 (with adjustable threshold), prefer-local.
- Pass both `src` (URL) and `localSrc` (relative storage path). The component
  prepends `/api/files/` to local paths for serving.
- For images we render in plain `<img>` (only the hero banner does), use
  `${ '/api/files/' + relPath }` if it's a stored path, else the raw URL —
  detect with a `^https?://` regex.

### VNDB API client (lib/vndb.ts)
- All queries go through `cachedFetch` with a per-endpoint TTL from `lib/vndb-cache.ts`.
- The cache key includes a sha1 of the JSON body so different filter combinations
  cache independently.
- **Footgun**: VNDB rejects an `or` / `and` clause with **fewer than 2** predicates.
  Always check `clauses.length` and unwrap when there's only one.
- **Footgun**: the `length` filter on `/vn` only accepts `=` and `!=` despite
  having the `o` (orderable) flag in the docs. For ranges, expand to
  `or length=1, length=2, …`.
- **Footgun**: the random-quote endpoint must NEVER be cached — pass `TTL.quotesRandom = 0`.
- ETag / If-Modified-Since are sent opportunistically when the server set them.
  VNDB does not currently emit these headers, but the code is ready when they do.

### VNDB rate-limiting (lib/vndb-throttle.ts) — read before adding any new fetch
- **Every outbound api.vndb.org request must go through `throttledFetch`**
  (wired by `cachedFetch` for POSTs, and by the direct ulist helpers in `vndb.ts`).
  Calling raw `fetch()` against VNDB bypasses the limiter and can trigger 429s
  that affect every other in-flight request.
- Defaults: 1 concurrent slot, 1 s minimum gap, 2 retries on 429.
- On 429 the **failing caller** sleeps `Retry-After` (capped at 60 s) and retries.
  Other callers are unaffected unless 3+ 429s pile up in 60 s — then `acquire()`
  adds a 10 s soft pause for new requests.
- Live counters via `getVndbThrottleStats()` — surfaced on `/api/download-status`
  and the bottom-right `DownloadStatusBar` indicator.

### Fan-out (auto-recursive download) — staff-full / character-full / producer-full
- When a VN is downloaded (3 paths: `GET /api/vn/[id]`, `POST /api/collection/[id]`,
  `POST /api/collection/[id]/assets`), we fire 3 fire-and-forget jobs:
  `downloadFullStaffForVn`, `downloadFullCharForVn`, `downloadFullProducerForVn`.
- Each fan-out reads the VN's local credit table, finds entries missing from
  the 30-day cache, and queues sequential VNDB fetches (rate-limited by the
  global throttle).
- **Failures are never silenced**. Each job ticks through `lib/download-status.ts`
  (start/tick/finish) and records per-item errors. Surfaced in the UI via
  `DownloadStatusBar`.
- Setting `vndb_fanout = '0'` in `app_setting` (toggle in Settings → "Auto-download
  staff / characters / developers") makes each helper return `{ scanned: 0,
  downloaded: 0 }` early. Pass `{ force: true }` to bypass when the user has
  explicitly opted in (e.g. `/data` selective full download).

### Adding a new field to a VN entry
1. Add the column with `ensureColumn(db, 'vn' or 'collection', 'name', 'TYPE …')` in `open()`.
2. Add it to `DbRow` interface and `rowToItem()`.
3. Add to `RawVnPayload` if it comes from VNDB (and to `upsertVn`).
4. Add to `CollectionFields` / `VnRow` types.
5. Add to `pickFields` in `/api/collection/[id]/route.ts` if user-editable.
6. Add to the `EditForm` UI.
7. Add to `exportData` / `importData` (in `lib/db.ts`) so backups stay round-trip.

### Adding a new VNDB endpoint
1. Add a `XXX_FIELDS` constant + a function in `lib/vndb.ts` calling `vndbPost`/`vndbGet`
   with an appropriate TTL key from `vndb-cache.ts:TTL`.
2. Add the type to `lib/vndb-types.ts` (so client components can import it without `'server-only'`).
3. Add a route under `src/app/api/…/route.ts` that wraps it.
4. Add a UI section / page that consumes the route.
5. Add i18n keys.

### Caching gotchas
- TTL is **per request body** — search for "fate" caches separately from "ever17".
- After a write that changes the VNDB-side data (you wouldn't be doing that —
  we are read-only on VNDB), invalidate via `invalidateVnCache(id)` or
  `invalidateByPath('POST /vn')`.
- **Cache key format** is `{METHOD} {path}|{METHOD}|{hash}` (`buildKey()`
  in `lib/vndb-cache.ts`). e.g. `POST /vn|POST|<sha1>`. When writing
  LIKE patterns against `cache_key` always anchor with `'% /path|%'`,
  never `'/path|%'` — the latter never matches because of the
  method prefix.
- The cache panel on `/stats` lets the user purge expired or by prefix
  and is **collapsed by default** (uncollapses on click).
- The `vndb_cache` table also hosts EGS cover resolver entries under
  `egs:cover-resolved:<egs_id>`. Hits cache for 7d; misses for 1h.
- `POST /api/refresh/global` **busts before re-fetching** so the
  re-fetch actually moves `fetched_at` forward. Bust patterns mirror
  what the route then re-populates: `egs:cover-resolved:%`,
  `anticipated:%`, `% /stats|%`, `% /schema|%`, `% /authinfo|%`,
  `% /release|%`, `% /release:%`, `% /producer|%`, `% /producer:%`,
  `% /tag|%`, `% /trait|%`. Without this step the freshness chip
  would show a refresh but the actual data wouldn't change.

### Time-ago formatting
- `src/lib/time-ago.ts` is the single source of truth for "X ago"
  formatting. Six tiers: minute (< 1h) → hour (< 24h) → day (< 7d) →
  week (< 30d) → month (< 365d) → year. i18n via `t.timeAgo.*` keys.
- Consumers: `RefreshPageButton` (the freshness chip), `GameLog`
  (entry timestamps). When adding a new "X ago" surface, use this util
  rather than inlining the math.

### Lazy-loading images
- `<SafeImage>` drives loading via `IntersectionObserver`
  (`rootMargin: 500px 0px`), not native `loading="lazy"` — the native
  attribute breaks subtly on overflow-scroll grids and SSR/hydration
  mismatches. Resets state when `src` changes so virtualised lists
  don't inherit a stale "errored" flag.
- Pass `priority` for above-the-fold imagery to skip the observer.

### Content controls hub (eye icon)
- `SpoilerToggle` is the user-facing component but it covers every
  display gate now (spoiler / hide images / blur R18 / hide sexual /
  NSFW threshold / show sexual traits).
- A "All settings…" button at the bottom of the popover dispatches a
  `vn:open-settings` `CustomEvent`. `SettingsButton` listens for it
  (lives in `layout.tsx` as a sibling) and opens its modal.
- When adding a new content-safety pref, surface it in **both** the
  eye popover and the gear modal so users can reach it from either.

### Lists feature (lib/db.ts → "User Lists" section)
- `user_list_vn.vn_id` has **no FK to vn(id)**. Anticipated entries
  the user wants to curate before they hit the local `vn` table need
  to fit, so we deliberately drop the constraint.
- `listAllListMemberships()` is the bulk-lookup helper for cards. When
  exposing the lists count on a card grid, prefer calling this once
  server-side and threading `listCount` into the card data rather than
  per-VN `listListsForVn()`.
- `ListsPickerButton` is lazy — it only fetches `/api/lists` +
  `/api/vn/[id]/lists` when the popover opens. Card grids stay cheap.

### Cover source picker
- `CoverSourcePicker` is the canonical surface for changing the cover.
  Three sources: VNDB (DELETE `/api/collection/[id]/cover`), EGS (POST
  `{source:'url', value:'/api/egs-cover/<egs_id>'}`), Custom (file
  upload, URL input, or pick from the in-VN gallery). Modal opens to
  the **Custom** tab so the file-upload affordance is on screen
  immediately. Tab order: Custom → VNDB → EGS.
- A secondary trigger lives directly on the cover image as
  `CoverEditOverlay` (pinned top-right, always tap-target, hover-
  revealed on desktop). It dispatches a `vn:open-cover-picker`
  CustomEvent with the VN id; the modal listens for it and opens.
  Single modal instance, multiple triggers.
- `BannerSourcePicker` mirrors the same pattern (Custom default tab).
- When adding a new source, extend the tabbed UI; don't introduce a
  separate component.

### Playtime model
- Four sort keys + a virtual "All" column: `playtime` (user only,
  no fallback), `length_minutes` (VNDB length), `egs_playtime` (EGS
  user-review median), `combined_playtime` (avg of every populated
  source — VNDB / EGS / Mine — divided by count of populated, so a
  single-source value ranks at its own magnitude).
- `PlaytimeCompare` on `/vn/[id]` is the canonical UI; writes
  `source_pref.playtime`.
- `VnCard` shows the **All** value as primary chip + the per-source
  breakdown beneath. When adding a new playtime surface, average the
  three sources (not just two) — single-source fallback was the bug
  earlier.

### Publishers — release-level role, persisted on the VN row
- VNDB's `/vn` endpoint exposes `developers{...}` but NOT publishers.
  Publishers only exist on `release.producers[]` with `publisher: true`.
- We aggregate publishers across every release of a VN in
  `fetchAndDownloadReleaseImages()` (`lib/assets.ts`) — same loop that
  mirrors release images. Deduped by id and written to the
  `vn.publishers` JSON column via `setVnPublishers()`. So both the
  individual add path (`POST /api/collection/[id]`) and the bulk
  refresh path (`POST /api/collection/[id]/assets?refresh=true`) keep
  it fresh; no separate publisher fetch needed.
- The library filter exposes `?producer=p123` (developers) and
  `?publisher=p123` (publishers) as **separate** params. Never merge
  them into an OR — a producer can be credited only as publisher
  (localization houses), and the user's mental model distinguishes
  the roles.

### Refresh button / freshness chip
- `RefreshPageButton` is shown only on pages whose render genuinely
  depends on a remote cache: `/upcoming`, `/tags`, `/traits`.
  Local-only pages (`/stats`, `/data`, `/producers`) deliberately do
  **not** show the chip — a freshness reading there is misleading.
- The button accepts `lastUpdatedAt`: omitted/undefined → no chip,
  `null` → "never" chip, number → relative time. Server passes the
  result of `getCacheFreshness(patterns)` which returns
  `MAX(fetched_at)` across matching cache rows.
- SSR: `now` defaults to `lastUpdatedAt` so the first paint reads
  "just now" instead of a raw timestamp. Client useEffect re-syncs
  to `Date.now()` + ticks every 30 s.
- Refresh click → `POST /api/refresh/global` which busts + re-fetches
  (see "Caching gotchas").

### Tailwind
- Custom palette: `bg`, `bg-card`, `bg-elev`, `border`, `accent`, `accent-blue`, `muted`,
  `status-*`. Use these instead of stock colours.
- Component classes (`.btn`, `.input`, `.label`, `.chip`, `.chip-active`) live in
  `globals.css` `@layer components`.

### Loading states (skeletons everywhere — no exceptions)
- **Rule**: every async section renders a skeleton placeholder while loading.
  Never show "no results" / "empty" / "nothing yet" before the fetch has resolved.
- Empty-state copy is **only** for the post-resolve case where the result really is empty.
- Skeletons mirror the final layout (grid of cover placeholders for a card grid,
  bar rows for a table, etc.) — not a generic spinner. Reach for the primitives in
  `src/components/Skeleton.tsx`: `<SkeletonBlock />`, `<SkeletonCardGrid />`, `<SkeletonRows />`.
- Server components with a slow secondary panel wrap that panel in
  `<Suspense fallback={<SkeletonCardGrid />}>` so the rest of the page paints first.
  Client components with an async `useEffect` fetch keep a `loading` boolean and render
  the skeleton until it flips false.
- When you add a new client-side fetch, the loading skeleton is part of the change —
  not a follow-up. The user has flagged "Nothing available" / "No results" flashes
  before data arrives as a recurring quality issue.
- Client-side fetches must clean up on unmount: use `AbortController`
  where fetch supports it, guard `finally` blocks from setting state
  after abort, and clear timers/listeners in cleanup. This matters on
  VN detail pages, where opening many items in sequence otherwise
  stacks in-flight fetches and stale timers.

### Markdown
- `MarkdownNotes` (editor) is in `MarkdownNotes.tsx`; the heavy
  `MarkdownView` (`react-markdown` + `remark-gfm`, ~100 kB gz) lives
  in its own module and is `next/dynamic`-loaded so the bundle only
  ships when the user opens the preview tab.

### VNDB BBCode rendering
- `<VndbMarkup>` in `src/components/VndbMarkup.tsx` is the single
  source of truth for rendering VNDB-flavoured BBCode
  (`[url=…]label[/url]`, `[b]`, `[i]`, `[u]`, `[s]`, `[spoiler]`,
  autolinks, `\n` → `<br />`). URL hrefs are scheme-allowlisted
  (http/https/mailto/relative) — `javascript:` / `data:` are
  rewritten to `#`.
- For plain-text needs (filter chips, search snippets) call
  `stripVndbMarkup` from the same module. The inline `stripBb` regex
  copies that used to live in 4 pages were removed.

### Language codes
- `lib/language-names.ts` maps VNDB language codes to display names
  via `languageDisplayName(code)`. Lookup is case-insensitive; codes
  unknown to the map fall back to the raw uppercase form. Replaces
  the previous `LangFlag` Regional-Indicator-emoji rendering — every
  surface now renders the `Globe` Lucide icon plus the localised
  name.

### Shared `CardData` projection
- `src/components/cardData.ts` exports `toCardData` (and
  `toCardDataLite` for partial rows). Every grid that renders
  `<VnCard>` should call `toCardData(it)` instead of inlining
  `data={{ id: it.id, … }}` — inline objects break the
  `React.memo(VnCard)` shortcut whenever an unrelated parent state
  ticks. The function is WeakMap-cached on the input row.

### Drag-id parser
- `src/lib/drag-id.ts` exposes `parseDragId` / `parseCellId` for
  `@dnd-kit` ids. Both the shelf-layout editor and the unit tests
  import directly from here — the test suite previously re-inlined
  the parser and would silently pass while the source regressed.

### Tap-target utility classes
- `globals.css` ships `.tap-target` (±10 px invisible hit area) and
  `.tap-target-tight` (±6 px) plus `.icon-chip`, `.tile`,
  `.icon-btn`, `.pill` shared chip primitives. Use these on icon-
  only buttons and any chip-shaped element so the bundle doesn't
  ship the same long Tailwind class string 80+ times.

### DB caching gotchas
- `getAggregateStats` keeps a 30-second in-process cache.
  `addToCollection` / `updateCollection` / `removeFromCollection`
  call `invalidateAggregateStats()` to bust it; callers that mutate
  outside those helpers should do the same.
- Next.js 16's `images.minimumCacheTTL` defaults to **4 hours**.
  `next.config.mjs` doesn't override it, so any future `<Image
  src="…">` consumer of an external host gets at most 4h of
  negative caching — long enough to matter when a fresh upload
  "doesn't appear" until the TTL expires. The app currently routes
  every external image through `<SafeImage>` (plain `<img>`) so
  this default isn't exercised, but flag it if a user reports stale
  external images after a Next 16 upgrade.

### Lazy DB init
- `lib/db.ts` exports `db = open()` at the top, but the heavy work
  (mkdirSync, schema creation, migration block) only fires on first
  module import via the `global.__vndb_db` singleton — under
  Next.js semantics that's first-request-that-touches-the-module.
  The DB path is built via string concatenation so Turbopack's NFT
  tracer can't statically follow it into the project tree.

---

## Common operations cheatsheet

### Add a new sort key in the library
1. `lib/db.ts` → extend `ListOptions['sort']` union and `sortMap`.
2. `app/api/collection/route.ts` → add to `VALID_SORTS`.
3. `components/LibraryClient.tsx` → add to `SORT_KEYS`.
4. i18n: add `library.sort.<key>` in all locales.

### Add a new locale
Two strict requirements:
- All keys present (Widen<typeof dictionaries['fr']> enforces shape).
- Locale code added to `LOCALES` in `dictionaries.ts`.

### Reset everything
```bash
rm -f data/collection.db data/collection.db-shm data/collection.db-wal
rm -rf data/storage
yarn dev   # next time you GET /, the schema is recreated
```

---

## Testing

- **Unit tests**: Vitest is wired up. Run with `yarn test` (one-shot) or
  `yarn test:watch`. Test files live under `tests/` and each spec
  isolates its DB via a per-worker temp directory configured by
  `tests/setup.ts` (sets `DB_PATH` to a `mkdtemp` location).
- **Smoke script**: `scripts/smoke.sh` starts a production server,
  exercises a few high-traffic endpoints, and tears down.
- **Build as the safety net**: `yarn build` runs full TypeScript +
  Next.js validation + page generation — the strongest single check
  and the closest emulation of production.

---

## Feature catalogue — see FEATURES.md

Every shipped user-facing feature is documented in `FEATURES.md` at the
repo root, with cross-links to the relevant files and DB tables. Start
there if you're new.

`PLAN.md` is the spec for the first feature batch (now landed); future
batches will not have PLAN docs — feature additions live directly in
FEATURES.md instead.

If you're an agent picking up mid-feature:
- Read **FEATURES.md** first.
- New helpers live in `src/lib/*.ts` (one file per feature, not piled
  into `db.ts`). The conventions in this guide still apply —
  `getDict()`, `SafeImage`, URL-state-over-`useState`, etc.
- All routes accept their dynamic params via the async `params` /
  `searchParams` shape from Next.js 16 — `const { id } = await params`.

New DB tables introduced by recent batches:

| Table | Owner feature | Notes |
| --- | --- | --- |
| `vn_activity` | Reading log | One row per status / playtime / note change. Written inside the existing `updateCollection` transaction so the audit trail never drifts from the actual state. |
| `vn_game_log` | Game log | Free-form timestamped journal next to the Pomodoro. Distinct from `vn_activity` — the activity table tracks state, this one tracks impressions. `session_minutes` is optional and lifted from the live Pomodoro count via `SessionPanel`. |
| `user_list` / `user_list_vn` | Universal lists | Free-form user-curated groupings, vn_id has **no FK** to support anticipated / wishlist entries. `listAllListMemberships()` returns a `Map<vn_id, UserList[]>` for cheap per-card lookups. |
| `saved_filter` | Saved filter combos | URL-param strings pinned by name; rendered as chips above the library filters. |
| `reading_queue` | Reading queue | VNs the user wants to play next, distinct from the "Planning" status. Ordered manually. |
| `reading_goal` | Yearly reading goal | One row per year. Progress ring against `countFinishedInYear`. |
| `steam_link` | Steam playtime sync | VN ↔ Steam appid mapping with `source` ('auto' / 'manual') and last-synced minutes. Manual links are sticky. |
| `shelf_unit` / `shelf_slot` / `shelf_display_slot` | Drag-and-drop shelf layout | `shelf_unit` is the grid metadata; `shelf_slot` is regular cells; `shelf_display_slot` is face-out rows between shelves. Both placement tables enforce UNIQUE `(vn_id, release_id)` through helpers so one edition is placed once. |
| `release_resolution_cache` / `owned_release_aspect_override` | Aspect-ratio filtering | VNDB release resolutions are normalized to buckets; manual per-edition overrides take precedence for library filters/groups. |

## Backlog cleared (2026-05-15 batch H)

- VNDB ulist writes (vote / started / finished / notes) — wired through
  the existing `PATCH /api/vn/[id]/vndb-status` route via the new
  `<UlistDetailsEditor>` panel on `/vn/[id]`.
- Schema browser at `/schema` renders the `getSchema()` payload as a
  filterable, collapsible JSON tree.
- Character search at `/characters` and staff search at `/staff` —
  full VNDB-wide query, idle hint + skeleton-free zero-state copy.
- Live invalidation: `/api/download-status/stream` is a Server-Sent
  Events feed driven by the pub/sub in `lib/download-status.ts`. The
  status bar subscribes and falls back to polling on EventSource
  failure.
- Tests: Vitest configured (`yarn test` / `yarn test:watch`),
  per-worker temp DB via `tests/setup.ts`, server-only stubbed in
  `tests/stubs/`. Coverage: shelf placement / swap / resize semantics
  + download-status pub/sub.

## Not implemented (yet)

- VNDB `/rlist` (release-level list) writes — `/ulist` is implemented;
  release-list mutation has no consumer in the app today.

---

## When in doubt
- Run `yarn build`.
- Read the relevant i18n key — if it's missing in EN/JA, add it.
- Check that you used `<SafeImage>` for any new image.
- Check that filters / sort / new state lives in the URL, not in `useState`.
- Don't introduce a new dependency unless absolutely necessary; we've kept
  it deliberately tiny.
