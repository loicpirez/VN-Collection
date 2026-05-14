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
| Framework | **Next.js 15** App Router · React 19 · TypeScript strict |
| Styling | **Tailwind 3.4**, no component lib, dark theme baked in `globals.css` |
| Icons | **lucide-react** — never use unicode pictographs |
| DB | **better-sqlite3 11**, sync, WAL, single file at `data/collection.db` |
| Markdown | react-markdown + remark-gfm (notes only) |
| Tests | Smoke tests live in `/tmp/*_test.sh` shell scripts. No formal test framework yet. |

The sandbox runs `npm run build` to verify TypeScript + Next routes compile.
Always run it before declaring a change "done".

---

## Repository layout

```
vndb-collection/
├── data/                              # gitignored — SQLite + downloaded images
│   ├── collection.db (+ .db-shm/.db-wal)
│   └── storage/
│       ├── vn/         (cover + thumb)
│       ├── vn-sc/      (screenshots + release pkg artwork)
│       ├── cover/      (user-uploaded custom cover/banner)
│       ├── producer/   (publisher logos)
│       └── series/     (series cover, currently unused)
├── public/                             # static, currently empty
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── layout.tsx                  # I18nProvider + DisplaySettings + nav + QuoteFooter
│   │   ├── page.tsx                    # Library (Suspense + LibraryClient)
│   │   ├── search/page.tsx             # SearchClient (debounced + advanced filters)
│   │   ├── producers/page.tsx          # Ranked publisher table
│   │   ├── producer/[id]/page.tsx      # Publisher detail + VN grid
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
│   │   ├── QuotesSection.tsx
│   │   ├── QuoteFooter.tsx             # Hover-reveal random quote (lazy)
│   │   ├── SafeImage.tsx               # Hide / blur-R18 / prefer-local
│   │   ├── VnCard.tsx                  # Library/Search/Series card
│   │   ├── VnGrid.tsx                  # Producer/Series VN grids
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
| GET | `/api/collection` | List + stats (filters: status, producer, series, tag, q, sort, order) |
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
| POST | `/api/producer/[id]/logo` | Upload publisher logo |
| DELETE | `/api/producer/[id]/logo` | Reset logo |
| GET | `/api/producers` | Ranked publishers in your collection |
| GET | `/api/series` / POST | List + create |
| GET/PATCH/DELETE | `/api/series/[id]` | CRUD |
| POST/DELETE | `/api/series/[id]/vn/[vnId]` | Link/unlink VN |
| GET | `/api/vndb/stats` | Global VNDB counters |
| GET | `/api/vndb/auth` | Token info / username / permissions |
| GET | `/api/vndb/quote/random` | Random quote (TTL = 0, never cached) |
| GET | `/api/vndb/cache` | Cache stats |
| DELETE | `/api/vndb/cache` (`?mode=expired|prefix&prefix=…`) | Invalidate cache |
| GET/PATCH | `/api/settings` | Read / update app settings (`vndb_token`, `random_quote_source`) |
| GET | `/api/wishlist` | Authenticated wishlist (ulist label 5) + in_collection + EGS hint |
| DELETE | `/api/wishlist/[id]` | Remove a VN from VNDB wishlist (PATCH labels_unset=[5]) |
| GET/POST/PATCH/DELETE | `/api/collection/[id]/owned-releases` | Per-edition inventory (location, edition_label, condition, price, dumped…) |
| GET/POST/PATCH/DELETE | `/api/collection/[id]/game-log` | Per-VN free-form timestamped notes (`vn_game_log`) |
| GET/PATCH | `/api/collection/[id]/source-pref` | Per-VN / per-field source preference JSON |
| GET/POST/DELETE | `/api/vn/[id]/erogamescape` | Resolve / link / unlink an EGS game for a VN |
| GET | `/api/vn/[id]/erogamescape?refresh=1` | Force re-fetch of every EGS column |
| GET/PATCH/DELETE | `/api/vn/[id]/vndb-status` | Read the user's VNDB ulist labels for a VN + toggle them via `labels_set` / `labels_unset` |
| GET | `/api/vn/[id]/lists` | Lists this VN belongs to |
| POST | `/api/egs/[id]/add` | EGS-only add → synthetic VN id `egs:<id>` + collection insert |
| GET | `/api/egs/search?q=&limit=` | EGS candidate search (used by /search and the manual-link picker) |
| GET | `/api/egs-cover/[id]` | Tiered cover resolver for an EGS game (302 redirect) |
| GET | `/api/route/[routeId]` / PATCH / DELETE | Per-route management |
| GET/POST/PATCH | `/api/collection/[id]/routes` | Per-VN routes (autocomplete from cast) |
| GET / POST | `/api/lists` | List / create user lists |
| GET / PATCH / DELETE | `/api/lists/[id]` | List CRUD |
| POST / DELETE | `/api/lists/[id]/items` | Add / remove / reorder list members |
| POST | `/api/refresh/global` | Bust EGS cover cache + re-fetch page-level caches |

---

## Database schema

All managed via raw SQL in `lib/db.ts`. We never run a migration tool — the
`ensureColumn(db, table, column, ddl)` helper at startup `ALTER TABLE` if the
column is missing. **Always use `ensureColumn` for new fields** so existing
DBs upgrade transparently.

```
vn               PK id           — VNDB id (v123)
                  title, alttitle, image_url, image_thumb, image_sexual, image_violence,
                  released, olang, languages, platforms, length, length_minutes,
                  rating, votecount, description,
                  developers (JSON), tags (JSON), screenshots (JSON), release_images (JSON),
                  local_image, local_image_thumb, custom_cover, banner_image,
                  raw (full VNDB payload), fetched_at

collection       PK vn_id (FK→vn)
                  status, user_rating, playtime_minutes, started_date, finished_date,
                  notes, favorite, location, edition_type, edition_label,
                  physical_location, box_type, download_url, dumped,
                  source_pref (JSON: {description:'egs', image:'vndb', …}),
                  added_at, updated_at

owned_release    PK (vn_id, release_id)
                  notes, location, physical_location (JSON), box_type, edition_label,
                  condition, price_paid, currency, acquired_date, dumped, added_at

vn_route         PK id (auto)
                  vn_id, name, completed, completed_date, order_index, notes,
                  created_at, updated_at

character_image  PK char_id           — local mirror of EGS character covers
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
                  id format `egs:<numeric>` and skip VNDB-only operations

producer         PK id           — VNDB producer id (p123)
                  name, original, lang, type, description, aliases (JSON),
                  extlinks (JSON), logo_path, fetched_at

series           PK id (auto)
                  name (UNIQUE), description, cover_path, created_at, updated_at

series_vn        PK (series_id, vn_id), order_index

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

1. `resolveEgsForVn(vnId)` short-circuits for `egs:<id>` synthetic VNs
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

### Synthetic VN ids (`egs:<id>`)

- Used by `/api/egs/[id]/add` when a game isn't on VNDB.
- `markVnEgsOnly()` flips `vn.egs_only = 1`; `isEgsOnly()` checks it.
- VNDB helpers (`getCharactersForVn`, `getReleasesForVn`, `getQuotesForVn`)
  early-return `[]` for any id not starting with `v` so server pages
  render cleanly for EGS-only entries.
- `loadVn()` on `/vn/[id]` skips the VNDB refresh for `isEgsOnly(id)` VNs.

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
- Library filters (status, producer, series, tag, q, sort, order, group) are
  derived **from `useSearchParams`**, not from `useState`. Setters update the
  URL via `router.replace(..., { scroll: false })`.
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

### Markdown
- `MarkdownNotes` (editor) and `MarkdownView` (read-only) are exported from the
  same file. Always pass plain user input — we strip BBCode (VNDB-style)
  via a regex helper named `cleanDesc` / `stripBb` in the page that needs it.

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
npm run dev   # next time you GET /, the schema is recreated
```

---

## Smoke testing

There is no Vitest/Jest yet. Manual smoke scripts live in `/tmp/`. The pattern is:

```bash
pkill -f next; sleep 1
nohup npm start > /tmp/server.log 2>&1 &
disown
sleep 6
# curl checks here
pkill -f next
```

`npm run build` is the strongest single check — it runs full TypeScript +
Next.js validation + page generation.

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
  `searchParams` shape from Next.js 15 — `const { id } = await params`.

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

## Not implemented (yet)

- VNDB List Management (POST/PATCH /ulist, /rlist) — read-only is enough for now
- Schema browser (we fetch `/schema` but never display)
- Character search page (only the modal section + character detail exist)
- Staff search page (lib helpers exist, no UI route)
- Real-time WebSocket invalidation for the bulk download
- Tests

---

## When in doubt
- Run `npm run build`.
- Read the relevant i18n key — if it's missing in EN/JA, add it.
- Check that you used `<SafeImage>` for any new image.
- Check that filters / sort / new state lives in the URL, not in `useState`.
- Don't introduce a new dependency unless absolutely necessary; we've kept
  it deliberately tiny.
