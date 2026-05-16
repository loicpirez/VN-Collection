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

## Safety rules (read before ANY commit)

- **Package manager**: `yarn`, never `npm`. Both lockfiles exist for
  legacy reasons but yarn is canonical. CI, smoke tests, and every
  internal doc assume yarn.
- **Commands you'll run**:
    - `yarn dev`           — local dev server on :3000
    - `yarn build`         — full TypeScript + Next.js validation
    - `yarn typecheck`     — fast `tsc --noEmit` only
    - `yarn test`          — Vitest single run
    - `yarn test:watch`    — Vitest watch mode
    - `yarn smoke`         — bash script that exercises every page
                              and a few APIs (needs a running server)
- **Never `git push`** unless the user explicitly asks. Never
  `git push --force`, never `git reset --hard` without an explicit
  ask. Never amend or rewrite commits the user already accepted.
- **No `Co-Authored-By:` trailers** in commit messages. The user has
  explicitly forbidden them. Don't add `🤖 Generated with Claude
  Code` either.
- **No real tokens in tests**. Vitest setup pins `DB_PATH` to a temp
  directory; never paste a real VNDB token / Steam API key / EGS
  username into a test fixture. Mock the upstream response and use
  fake placeholders (`'fake-test-token-not-a-real-vndb-credential'`).
- **`data.old/`** in the repo root is an untouched legacy backup.
  Never read, edit, or `git add` anything under that directory.
  `.gitignore` already excludes it; don't override.
- **`git add -A` is dangerous** — it sweeps untracked dirs. Prefer
  `git add <specific-files>` or `git add` with explicit paths. If
  you must use `-A`, run `git status --short` first and confirm no
  user-only data is being staged.
- **Migrations are append-only**. Use `ensureColumn(db, table,
  column, ddl)` for every new field; never `DROP TABLE`,
  `ALTER TABLE … DROP COLUMN`, or any non-idempotent DDL.
- **Credential previews never include the credential itself**.
  Settings PATCH responses, audit-log rows, and error messages
  must mask via `tail4` (token-shaped) or hostname (URL-shaped) —
  see `settingAuditPreview` in `lib/db.ts`. `/api/settings` GET
  returns `{ hasKey/hasToken/hasUrl: boolean, preview/host: …,
  isDefault?: boolean }` for every sensitive key. The raw value
  is never echoed even on localhost-gated routes — the gate
  reduces blast radius but does not replace masking. Tests live
  in `tests/settings-backup-url-mask.test.ts`.
- **Commit message hygiene**: no personal / user-referential
  phrasing. "The user reported", "user wanted", "user QA",
  "Loïc's collection" are all forbidden in commit subjects and
  bodies; use neutral product wording ("manual QA flagged",
  "the spec requires", "the operator can…"). The same rule
  applies to source comments, JSDoc, tests, and docs. Real VN /
  game / studio / character names are also forbidden across all
  of these surfaces — use placeholders ("heroine A", "Studio X",
  synthetic ids like `v9xxxx`). Local commits can be rewritten
  with `git filter-branch --msg-filter` (see
  `/tmp/rewrite-commit-msgs.py` for the canonical sed-style
  transformations); pushed commits cannot be force-pushed unless
  explicitly authorized.

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

vn_egs_link      PK vn_id (FK→vn)
                  egs_id (nullable; NULL means user pinned
                  "no EGS counterpart"), note, updated_at
                  — Manual VN→EGS override that beats the auto
                  resolver. Survives cache invalidation.

egs_vn_link      PK egs_id
                  vn_id (nullable; NULL = pinned "no VNDB"),
                  note, updated_at
                  — Manual EGS→VNDB override. Used by EGS-side
                  feeds (anticipated, top-ranked, /egs unlinked
                  list) to overlay the user's chosen mapping on
                  top of the native EGS payload, even on cache
                  hits. No FK on `vn_id` so the user can pin a
                  VNDB id that isn't yet in the local `vn` table.

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
- **Four view modes, one route**:
  - `/shelf` (= `?view=spatial`, **default**): server-rendered
    spatial visualization of every `shelf_unit` as a visual grid
    (cols × rows) with Top Display (`after_row = 0`), Bottom
    Display (`after_row = rows`), and Between-Row displays
    (`after_row = 1..rows-1`). NO drag, NO mutation control —
    "browse your physical layout" mode. Includes a fullscreen
    toggle (body-scroll-lock + Escape + focus restore + ArrowUp/
    Down navigation between sections).
  - `/shelf?view=release`: server-rendered read-only flat grid
    of every owned edition, grouped by primary
    `owned_release.physical_location` text tag. Useful for
    power users who track free-form location tags separate from
    the spatial layout.
  - `/shelf?view=item`: server-rendered read-only flat grid
    bucketed by VN (one card per VN even with multiple owned
    editions).
  - `/shelf?view=layout`: client-mounted `<ShelfLayoutEditor>`
    (drag/resize/rename/delete/add). The only surface with
    mutation controls.

  `<ShelfSpatialView>` reads `listShelves` + `listShelfSlots(id)`
  + `listShelfDisplaySlots(id)`. `<ShelfSpatialFullscreen>` is
  the client wrapper that owns the fullscreen toggle.

  Schema: `shelf_display_slot.after_row` semantics —
  `after_row = 0` is the row that visually sits ABOVE every
  cell row (rendered as "Top display"). `after_row = N` (where
  N = `shelf.rows`) is the row that sits BELOW the last cell
  row (rendered as "Bottom display"). Values 1..rows-1 are
  Between-row displays (rendered as "Between row X and Y").
- **Pool item info popover**: each draggable tile in the unplaced
  pool of `<ShelfLayoutEditor>` carries an `<Info>` button at top-
  right that opens an absolute-positioned popover with release id,
  condition, box type, physical location, price, acquired date,
  dumped flag, plus "Open VN" / "Open release" links. The button
  is keyboard- and touch-reachable (not hover-only). Click stops
  propagation so dnd-kit's PointerSensor doesn't fire.

### Manual EGS ↔ VNDB mapping

Two override tables, both reversible, both keyed on a single id:

- `vn_egs_link` — pins (`vn_id` → `egs_id`), or (`vn_id` → `NULL`)
  to record "this VN has no EGS counterpart". Highest priority in
  `resolveEgsForVn`; survives cache invalidation and auto-rematch.
- `egs_vn_link` — pins (`egs_id` → `vn_id`), or (`egs_id` → `NULL`).
  Used by EGS-side feeds (`fetchEgsAnticipated`,
  `fetchEgsTopRanked`, /egs unlinked list) that overlay the user's
  choice on top of native EGS data. The overlay runs even on cache
  hits.

API:
  - `POST /api/vn/[id]/erogamescape` `{ egs_id }` — pin VN → EGS id.
  - `DELETE /api/vn/[id]/erogamescape?mode=…` — `auto` (default),
    `manual-none`, `clear-manual` modes control whether the
    override layer is reset or pinned to "no counterpart".
  - `GET/POST/DELETE /api/egs/[id]/vndb` — symmetric EGS → VNDB pin.

UI: `<MapEgsToVndbButton>` and `<MapVnToEgsButton>` are the two
shared modal pickers; both wrapped via `useDialogA11y` so Escape
and focus restore work consistently. Surfaces:
  - `/upcoming?tab=anticipated` rows missing `vndb_id`
  - `/top-ranked?tab=egs` rows missing `vndb_id`
  - `/egs` unlinked list (paginated, 50 rows + "+N more" hint)
  - `/vn/v\d+` EgsPanel manual picker
  - `/vn/egs_NNN` still uses the heavyweight `<LinkToVndbButton>`
    that migrates the whole synthetic row to a real `v\d+` id.

The lighter pinning model and the heavyweight id migration are
intentionally separate — the user almost never wants the id
migration from a listing page.

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
- TTL is **per request body** — two different search queries cache separately even if they hit the same VNDB endpoint.
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

### EGS uses a uid, not a token

- ErogameScape authentication for the public SQL form is a
  **username (uid)**, not an API key. Stored at
  `app_setting.egs_username`. No password, no bearer, no headers.
- The Settings → Integrations tab carries the canonical input
  (label / placeholder / hint / Clear). `<EgsSyncBlock>` on `/egs`
  and `/data` reads the same setting; the two surfaces are
  synchronised through the storage key, not by passing the value
  around.
- The uid is public (it appears in the user's profile URL). It
  is NOT in `AUDITED_SETTING_KEYS` — no audit row needed.
- Never call EGS a "token" in the UI; the EGS settings copy
  always says "username (uid)".

### Settings modal — eight tabs in a fixed order

`SETTINGS_TABS` (`SettingsButton.tsx`):
  1. `display` — image / title / card-density preferences
  2. `content` — spoilers / NSFW threshold / sexual content
  3. `library` — default sort / order / grouping
  4. `home` — section visibility / reset (drag-reorder lives on
     the home page itself via `<HomeLayoutEditorTrigger>`, but
     the per-section visibility list is mirrored here)
  5. `vn-page` — VN detail section visibility / collapse defaults
  6. `account` — VNDB token (audited) + writeback toggle +
     status pull + backup URL
  7. `integrations` — Steam API key + SteamID + EGS username +
     random-quote source toggle
  8. `automation` — fan-out toggle only

Each tab renders into a single panel block. ARIA tab semantics
are partial — see the audit notes in `SettingsButton.tsx`. Don't
add a second `{activeTab === '<id>' && (...)}` block for the same
tab; the H6 audit found that pattern split panels in unexpected
ways.

External callouts can deep-link directly to a specific tab by
dispatching `vn:open-settings { tab: 'integrations' }` via
`window.dispatchEvent(new CustomEvent(...))`. The Settings modal
listens for the event, validates the tab id against
`SETTINGS_TABS`, and pre-selects it on open. Used by `/data`'s
"Manage in Settings → Integrations" callout links.

### Versioned JSON config pattern

Both `home_section_layout_v1` and `vn_detail_section_layout_v1`
follow the same shape:

  1. Constant `XXX_SECTION_IDS` array — canonical render order.
  2. `validate<…>V1(input: unknown)` — coerces arbitrary input,
     drops unknown ids, fills missing defaults, returns the full
     default on garbage. Two-shape tolerant: accepts both the v0
     flat form and the current `{ sections, order }` form.
  3. `parse<…>V1(raw: string | null)` — wrapper that catches JSON
     parse errors.
  4. `XXX_LAYOUT_EVENT` constant — CustomEvent name dispatched
     after a successful PATCH so siblings re-sync without a
     full router.refresh.
  5. `/api/settings` PATCH MERGES partial patches on top of the
     persisted layout. The per-section menu sends
     `{ sections: { [id]: state } }`; the drag-reorder sends
     `{ order: [...] }`. The two paths never clobber each other.

When adding a new versioned config, follow this shape exactly
and bump the suffix (`_v2`, etc.) only on incompatible schema
changes.

### Library toolbar convention (two-level model)

The Library page (`src/components/LibraryClient.tsx`) follows a
compact two-level toolbar pattern. Future agents should NOT
expand everything back into a single visible row.

Always-visible primary toolbar (one row at md+):
  - search input
  - `<AdvancedFiltersDrawer>` toggle with active-count badge

Active filter chips (render only when any are live):
  - one chip per active filter (producer, publisher, series,
    tag, place, year, aspect, dumped), each removable on click
  - a `Clear all` action on the right

Below: Sort + order + reorder + group + density + main actions.

Inside `<AdvancedFiltersDrawer>` (collapsed by default):
  - developer / publisher / series selects (3-col grid)
  - aspect ratio + dumped chips
  - tri-state `<MoreFilters>` list (match VNDB, match EGS,
    fan disc, favourite, etc.)

The badge on the drawer toggle shows the active hidden filter
count so the user knows the drawer is hiding live filters.
Adding a new filter? Default it to the drawer, NOT the always-
visible row. Only status chips + search + sort + group + density
+ primary actions are first-class. If you must surface a filter
above the drawer (e.g. very-frequently-used), document the
reasoning in the commit message.

URL-state, default sort/order/group, and clear semantics are
unchanged by this layout convention.

### Card density

- Shared `cardDensityPx` setting in `useDisplaySettings()` clamped
  to `[120, 480]` via `clampCardDensity()`. Range widened from the
  original `[140, 320]` so the user can genuinely get ~2 cards per
  row at the high end.
- The value flows into a CSS variable `--card-density-px` set on
  the document root by `<CardDensityVarSetter>` (client) + an
  inline `<html style="--card-density-px:…">` in `layout.tsx`
  (server seed from cookie, no flash of default density).
- Every server-rendered listing grid uses
  `minmax(min(100%, var(--card-density-px, 220px)), 1fr)` so
  changing the slider doesn't require a page reload AND a slider
  value larger than the viewport doesn't force a horizontal
  scroll on mobile. The `min(100%, …)` envelope is mandatory —
  without it, slider=480 on a 360px phone forces overflow.
- **Card content must scale with column width.** Every card uses
  `aspect-[2/3] w-full` (or equivalent) on the cover image so a
  wider column produces a proportionally larger cover. The
  failure mode this prevents: wide column + tiny fixed-size
  cover + huge empty whitespace. /upcoming and /top-ranked row
  cards scale their cover via `width: clamp(96px,
  calc(var(--card-density-px) * 0.38), 200px)`.
- The Library's `denseLibrary` boolean is separate from the
  slider; it multiplies the column min by 0.72 in dense mode so
  the same slider value yields more columns + a tighter gap.
  Other pages don't have a denseLibrary equivalent.
- **`max(280px, var(--card-density-px, 280px))` floors are
  forbidden** — they prevent the slider from doing anything
  below the floor. Use the slider value directly. Pages that
  need a text-density floor should apply it at the grid template
  level instead (e.g. `minmax(min(100%, max(320px,
  var(--card-density-px, 320px))), 1fr)` is OK because the
  floor is part of the grid contract, not a hard slider veto).

### Navbar responsive + i18n convention

`<GroupedNav>` (`src/components/MoreNavMenu.tsx`) renders the
top-of-page nav. Future agents MUST preserve these breakpoints:

  - **md (768px) → xl-1 (1279px): icons only.** Labels are
    `hidden xl:inline`. Every NavLink / NavGroup carries
    `aria-label` + `title` so screen readers + tooltips work.
  - **xl (1280px+): icons + text.** Below xl the longest French
    strings ("Bibliothèque", "Wishlist", "Rechercher",
    "Découvrir", "Parcourir", "Données & Stats") collide with
    the right-side controls (Spoiler / Settings / Language).
  - **md and below: hidden, replaced by a Menu button + sheet.**

Primary nav slot is reserved for the 3 daily-use entries —
Library, Wishlist, Search. /lists lives in the Discover menu.
Anything else goes in a NavGroup. Don't add a fifth primary
without measuring the FR overflow at xl-1.

Mobile sheet (`<MobileSheet>`) duplicates every entry so mobile
users still see Lists prominently in the Primary group.

### URL state vs durable defaults

The app uses two layers for view preferences:

  - **URL state** (search params) for SHAREABLE / TRANSIENT
    state: filters, sort, group, status chip, search query,
    aspect, dumped, year range, manual tag pin. The URL is the
    source of truth on every page load; the user can copy/paste
    a library URL to share a specific view.
  - **Persisted defaults** for DURABLE / repeated preferences:
    `default_sort` / `default_order` / `default_group`,
    `cardDensityPx`, `denseLibrary`, `home_section_layout_v1`,
    `vn_detail_section_layout_v1`, `wishlist_defaults_v1`.

**Rule: URL state ALWAYS wins.** Persisted defaults only apply
on a clean URL with no matching param. A one-off search the
user typed into the box does NOT become a durable default; only
explicit `set('cardDensityPx', n)` / `set('denseLibrary', b)` /
PATCH-`/api/settings { default_sort: 'rating' }` writes update
the defaults.

When adding a new view preference:
  1. Decide whether it's shareable (URL state) or durable
     (persisted setting). Search queries → URL. Card density
     → persisted. Sort choice → BOTH (URL takes priority but
     the default is persisted).
  2. URL state goes through `setParam(key, value)` /
     `replaceParams(fn)` (see `LibraryClient.tsx`).
  3. Persisted state goes through `useDisplaySettings().set` or
     `PATCH /api/settings`.
  4. Never mix the two for the same value — pick one storage.

### Manual QA checklist

After non-trivial changes, walk through these in the browser
(EN + FR + JA + a mobile viewport):

  - `/` — Library:
    - Status chips filter; advanced filters drawer opens/closes
    - Active filter chips render under the toolbar, X removes
    - Search debounces to URL
    - Sort + order + group work
    - Density slider changes column count AND cover size
    - Drag-to-reorder via sort=custom
  - `/wishlist` — sort/group/hideOwned persist across reloads
  - `/recommendations` — seed tag picker round-trips through URL
  - `/similar?vn=v17` — same
  - `/top-ranked?tab=vndb` — VNDB section renders
  - `/top-ranked?tab=egs` — either renders rows OR shows the
    EGS-unreachable actionable error
  - `/upcoming?tab=anticipated` — EGS rows without vndb_id get
    a Map-to-VNDB button
  - `/egs` — linked + unlinked sections both render; manual
    mapping action opens a modal
  - `/shelf` — default view = spatial (Top/Bottom/Between
    display rows visible, no edit controls)
  - `/shelf?view=layout` — editor mode (drag works; pool item
    info popover flips above on viewport collision)
  - `/vn/[v…]` — section layout drag/hide/collapse; Aspect
    override; Similar tag picker
  - `/data` — only operational sections (no inline credential
    forms)
  - Settings modal: Display / Content / Library / Home /
    VN-page / Account / Integrations / Automation, including
    the deep-link from /data's "Manage in Settings →
    Integrations" button.
  - Mobile (≤ 640px): navbar is a Menu sheet, density slider
    accessible, advanced filter drawer fits, no horizontal
    scroll on any listing grid.

### Refresh button / freshness chip
- `RefreshPageButton` is shown only on pages whose render genuinely
  depends on a remote cache: `/upcoming`, `/top-ranked`. Local-only
  pages (`/stats`, `/data`, `/producers`, `/tags`, `/traits`)
  deliberately do **not** show the chip — a freshness reading there
  is misleading. (`/tags` + `/traits` were briefly mentioned in old
  docs but never actually wired with `RefreshPageButton`; the audit
  caught the mismatch.)
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
