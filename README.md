# VN Collection

<p align="center">
  <img src="./Screenshot.png" alt="VN Collection screenshot — library grid with status filters, sort controls and cards" width="100%" />
</p>

Personal Visual Novel collection manager with a polished, IMDB / Steam-inspired UI.
All your data lives in a local SQLite file — no cloud, no account, no telemetry.

Pulls from the [VNDB Kana API v2](https://api.vndb.org/kana) for metadata and
the public [ErogameScape](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/)
SQL form for Japan-side ratings, brand info, and synopses. Both sources are
ingested, cached locally, and can be combined or compared per-field.

![status](https://img.shields.io/badge/status-self--hosted-blue)
![stack](https://img.shields.io/badge/stack-Next.js%2015%20·%20React%2019%20·%20SQLite-22c55e)
![locale](https://img.shields.io/badge/i18n-FR%20·%20EN%20·%20JA-f5c518)

---

## Features

### Library
- Steam-like detail pages (custom cover, custom banner, hero backdrop)
- Track per-VN: status (planning / playing / completed / on hold / dropped),
  personal rating (10–100), playtime, started / finished dates, favorite,
  "dumped" flag, free-form download URL
- **Per-edition inventory** — every `owned_release` row tracks location,
  physical location (multi-tag, e.g. *Living room · Shelf B · Floor 2
  · Row 3*), box type, edition label, condition (sealed / new /
  opened / used / damaged), price paid + currency, acquired date,
  **purchase place** (store / URL / second-hand vendor), dumped
  state, and notes — independently of the VN-level status
- **Synthetic releases for EGS-only / no-release VNs** — games VNDB
  doesn't list a release for (typically `egs:*` entries) can still be
  shelved: the inventory adder shows a "Main edition" synthetic tile
  (`release_id = synthetic:<vnId>`). All owned-release plumbing
  (locations, currency, dumped state, shelf grouping) works the same
  way as for VNDB releases; the only difference is no clickable
  `/release/[id]` link.
- **Shelf has three views** — `/shelf` switches between three modes
  via `?view=release|item|layout`. *Per-item* lists every owned
  edition (the original behavior — useful for "which copy is in box
  vs shelf"). *Per-VN* collapses multiple editions of the same VN
  into a single card with the edition count, the set of distinct
  locations, and the summed currency totals. Money is rendered with
  `Intl.NumberFormat` so JPY shows as ¥, EUR as €, etc.
- **Drag-and-drop shelf layout** — `/shelf?view=layout` opens a
  2-D grid editor where each cell is a physical slot. Create
  multiple shelves ("Living room — left bookcase", "Office — top
  shelf"), resize them in rows × columns at any time, then drag
  editions from the **Unplaced** pool into specific slots to
  reproduce your real-life arrangement. Drag from slot to slot to
  move; drag onto an occupied slot to **swap** atomically; drag
  back to the pool to unplace. Touch-friendly (long-press to drag),
  keyboard-accessible (Space to pick up, arrows to move, Space to
  drop), and optimistic — every action persists to `shelf_unit` /
  `shelf_slot` with full rollback on error.
- **Routes** — heroine / branch tracker with autocomplete from the VN's
  main / primary cast, completion checkboxes, and reorderable list
- **Markdown notes** (GFM, tables, code blocks) for personal reviews
- **Series / collections** to group VNs along VNDB relations (`Fate`, `Type-Moon`, …)
- **Universal Lists** (`/lists`) — free-form user-curated groupings
  ("GOAT", "To replay", "Comfy SoL", …) that work across the whole app.
  A VN can be in any number of lists, with color tags, pinning and
  drag-handle reorder. Lists accept any VN id including anticipated
  / wishlist entries that aren't fully in your collection yet.
- **Favorite toggle on every card** — a heart icon at the top-left of every
  poster is always tappable (mobile / tablet parity). Auto-adds a search
  hit to the collection (`status=planning`) before favoriting if needed.
- **Lists picker on every card** — a bookmark icon at the top-right opens
  a lazy popover with the full list registry, search filter, and an inline
  "create new list" input. Optimistic toggles.
- Sort: recently updated, added, title, VNDB rating, your rating,
  release year, **developer** (first dev name), **publisher** (first
  publisher name — VNDB's release-level role), **EGS rating**,
  **combined rating (VNDB + EGS) / 2**, and the four-way playtime model:
    - **My playtime** — `collection.playtime_minutes` only, no fallback.
    - **VNDB length** — `vn.length_minutes` only.
    - **EGS playtime** — `egs_game.playtime_median_minutes` only.
    - **All playtime (avg)** — average of every populated source.
      Example: VNDB 95 + EGS 90 + Mine 93 → 92.67. Single-source
      entries rank at their own magnitude (no divide-by-three
      penalty for missing data). Cards display the All value as the
      primary playtime chip with the per-source breakdown beneath.
- Filters: status, **developer (`?producer=`)**, **publisher
  (`?publisher=`)** — two separate axes, never collapsed — series,
  tag, free-text, place, year range, **dumped state** — all
  persisted in the URL
- Group-by: status, developer, publisher, tag, series
- Recently viewed strip on the home page (localStorage, last 12 entries)
- Bulk select / edit / download
- **Viewport-aware lazy image loading** via IntersectionObserver
  (`rootMargin: 500px`) so virtualised / overflow-scroll grids actually
  fetch covers as the user scrolls instead of stalling on stale cells

### VNDB integration (every Kana endpoint)
- VN search (debounced) + advanced filters
- **Producer pages**: `/producer/[id]` paginates `POST /vn`
  (developer credits) AND `POST /release` (publisher credits) and
  renders two distinct sections — "As developer" and "As publisher"
  — with owned/missing badges. `/producers` ranking has two tabs
  (Developers / Publishers) backed by independent indexes
  (`vn.developers` vs `vn.publishers`), so a publisher-only studio
  appears only under the Publishers tab. Logo upload + average
  rating per role.
- Character pages — metadata, traits, every VN they appear in
- **Staff / seiyuu pages** (`/staff/[id]`) — every credit grouped by
  role. The Voice section renders each VN as a full **VnCard**
  (owned chip, VNDB / EGS external links) with the character
  thumbnails the seiyuu voiced inline under the card. Tap a
  character thumb to jump to `/character/[id]`. Makes "what does
  Sumire Uesaka sound like in *this* role" a one-click lookup.
- Tag & trait browsers — trait page has an "In my collection" toggle
- Release listings per VN — package artwork, languages with mtl flag,
  voiced level, GTIN / catalog, all extlinks
- Quote of the moment (footer, hover-reveal)
- VNDB global stats + auth info on `/stats` and `/data`
- **VNDB list status panel** on `/vn/[id]` — every label from your VNDB
  profile (Wishlist / Playing / Finished / Stalled / Dropped / Blacklist
  + custom labels) shown as a toggle. Clicking sends
  `PATCH /ulist/{vid}` with `labels_set` / `labels_unset` so other
  labels and your vote stay intact. "Remove from VNDB list" calls
  `DELETE /ulist/{vid}`.
- **Wishlist** — pulls your VNDB Wishlist (label 5), bulk select + delete
  (same `labels_unset:[5]` mechanism, other labels survive)
- **VNDB token settable from the Settings panel** (stored locally in the
  SQLite app_setting table); `VNDB_TOKEN` env var stays the fallback
- **Global rate limiter** — every outbound request goes through
  `lib/vndb-throttle.ts`: 1 concurrent, 1 second minimum gap (~1 req/s
  ceiling). When VNDB returns 429, the calling request honors
  `Retry-After` (capped at 60 s) and retries up to twice. If 3+ 429s
  pile up in any 60 s window, a soft 10 s pause is added to every
  acquire so we slow the herd without freezing the queue.
- **Auto-recursive download (opt-out)** — when a VN is added or
  re-fetched, the app fans out in the background to pull the full
  profile for every staff member, character, and developer it credits
  (cached 30 days). Disable via Settings → "Auto-download staff /
  characters / developers" if you want strict on-demand API usage.
- **Selective full download** — `/data` carries a checkbox picker
  listing every VN in your collection with select-all / select-none /
  invert helpers. Tick the ones you want and click "Run (N)" to
  trigger the fan-out for that subset, bypassing the auto-fan-out
  toggle. Rate-limited by the global throttle.
- **Live download status** — pinned indicator on the right side of
  the viewport. Click for per-job progress bars, error lines, and a
  visible countdown when VNDB is throttling us back (429 +
  Retry-After).

### ErogameScape integration
EGS is wired as a **first-class peer of Steam**: dedicated landing page,
sync block, manage UI, and synthetic VN ids so EGS-only games coexist
alongside VNDB-sourced ones across the whole app (library, lists,
recommendations, shelf, dumped, stats).

- **`/egs` page** mirrors `/steam` exactly — shows every EGS-linked VN
  in your collection with its EGS median, EGS playtime, source
  (auto-resolved via extlink vs fuzzy / manual / search), plus the
  EGS sync block (pull user reviews / playtime in bulk).
- Public SQL form at `sql_for_erogamer_form.php` — POSTs SQL, parses the
  returned HTML table. No API key needed.
- Auto-resolve via VNDB release extlinks (every release's `extlinks` is
  scanned for an ErogameScape URL). Falls back to a fuzzy name search
  against `gamelist.gamename` **and** `gamelist.furigana` when no
  extlink exists, so romaji / hiragana queries hit too.
- **Every gamelist column** is ingested into the local `egs_game` row:
  gamename, furigana, brand (joined to brandlist for the readable name),
  model, sellday, median, average2, stdev, count2, max2, min2, median2,
  okazu, erogame, banner_url, total_play_time_median, time_before_understanding_fun_median,
  genre, axis_of_soft_or_hard, hanbaisuu, dmm / dlsite_id / gyutto_id,
  erogetrailers, twitter, tourokubi, … plus the whole row as `raw_json`
  so we never need to re-query for fields we forgot.
- Median user playtime computed locally from `userreview.play_time`.
- Top user long-comment surfaced as the EGS "description" (EGS has no
  structured synopsis column).
- "EGS — extra info" panel on `/vn/[id]` surfaces the rest: EroGameTrailers
  link, demo download, DMM / DLsite / Gyutto store links, brand Twitter,
  genre tag, soft↔hard axis, score range (min – max · median²), POV
  breakdown (A / B / C distribution), sales rank, time-before-fun.
- Cover image mirrored locally (banner_url first, then EGS's image
  redirector) so it survives EGS being down.
- **Manual link picker** — when auto-resolve fails or picks the wrong
  game, "Search EGS" opens a candidate picker and links the chosen
  one (persisted with `source: 'manual'`).
- **EGS-side search** on `/search` — when a game is missing from VNDB,
  flip the source toggle to EGS, find the game, click "Add via EGS".
  Synthetic VN id `egs:<id>`; the entry coexists with VNDB-sourced VNs.
- **Per-field source preference** with VNDB-first auto-fallback.
  Each field (description, cover, brand) on `/vn/[id]` shows a
  "Compare" toggle that expands into a side-by-side view with
  "Use VNDB" / "Use EGS" / "Auto" actions. Choice persisted per-VN as
  `collection.source_pref` JSON. VNDB stays the default for everything.
- Combined rating `(VNDB + EGS) / 2` and summed playtime
  `mine + EGS median` shown on the VN page; aggregates on `/stats`.
- No API key required — EGS exposes a public SQL form.

### Image management
- **Auto-download on add**: cover + thumbnail + screenshots + every
  release package image (pkgfront, pkgback, pkgcontent, pkgside, pkgmed,
  dig) + every character image + the EGS cover
- Image gallery filtered by type, with lightbox
- "Set as banner" button on every gallery image
- **Cover source picker** — modal triggered from a "Change cover"
  overlay on the cover image itself (always tappable on touch,
  hover-revealed on desktop) and from the action bar. Opens to the
  Custom tab so the file-upload affordance is visible immediately;
  the other two tabs are one click away:
    1. **Custom** (default) — file upload, paste a URL, or pick
       any screenshot / per-release art already on the VN.
    2. **VNDB** — revert to the upstream cover.
    3. **EGS** — use the cover served by `/api/egs-cover/[id]`.
- **Banner source picker** — parallel modal for the hero banner.
  "Default" tab (use the cover-derived blurred backdrop) and "Custom"
  tab (upload / URL / pick from in-VN gallery).
- Banner uploader has a drag-positionable focal point for fine-tuning.
- **Three-way cover compare** on `/vn/[id]` — VNDB / EGS / Custom side
  by side with "Use this" buttons. Auto-resolution priority Custom →
  VNDB → EGS so a user pick always wins over the upstream default.
- **EGS cover resolver** with tiered fallback: banner_url (trusted,
  no probe) → linked VNDB cover via `egs_game.vn_id` → probed EGS
  `image.php` → first available shop URL (Suruga-ya / DMM / DLsite /
  Gyutto). The route **proxies image bytes server-side** instead of
  302-redirecting so referer / mixed-content / bot-mitigation
  failures don't break the browser fetch. Negative cache TTL of 1 h
  so a freshly-published cover surfaces within an hour; the global
  refresh busts the cache.
- **Multi-source EGS cover picker** — the cover picker's EGS tab no
  longer locks you into the resolver's first choice. It calls
  `/api/egs-cover/<id>/candidates` and renders **every** known source
  side-by-side (banner_url, linked VNDB poster, EGS `image.php`,
  Suruga-ya, DMM, DLsite, Gyutto) as clickable tiles. Pick the
  prettiest one and it's pinned as `custom_cover` (survives refresh
  and global cache busts). "Use EGS auto" stays available for the
  original priority-fallback behavior.
- **Anticipated covers via VNDB** — `/upcoming?tab=anticipated`
  batches one VNDB call for every anticipated row carrying a
  `vndb_id`, then renders the high-quality VNDB poster directly.
  Cards are laid out 2-per-row with 128×192 (152×224 on sm+) covers
  for genuine visibility. EGS-only entries fall back to the resolver
  chain above.
- **Content-controls hub** (closed-eye icon in the navbar) — opens a
  popover with spoiler level (0/1/2), hide all images, blur R18,
  hide sexual images, NSFW threshold slider (0–2), show sexual traits,
  plus a one-click jump to the full settings modal
- Prefer-local toggle so images survive offline / VNDB outages
- "Download all data" button on the library fully refreshes both VNDB
  and EGS payloads + re-mirrors all images

### Caching & offline
- Per-endpoint TTL with **ETag / If-None-Match** support
- In-flight dedupe (multiple concurrent requests for the same data → 1
  upstream hit)
- Stale-while-error fallback if VNDB / EGS is down
- Cache panel on `/stats`, **collapsed by default** (counts per endpoint,
  prune expired, clear all)
- **Per-page Refresh button** with a **Data Xh ago** chip on the
  pages whose render genuinely depends on a remote cache —
  `/upcoming`, `/tags`, `/traits`. (Pages backed by purely-local SQL
  — `/stats`, `/data`, `/producers` — don't show the chip because a
  freshness reading there would be meaningless.) The chip reads the
  freshest `fetched_at` from cache rows matching the page's LIKE
  patterns and renders a tiered relative time (minute / hour / day /
  week / month / year), ticking every 30 s.
- Clicking Refresh runs `/api/refresh/global`: **busts** the relevant
  cache rows first (EGS cover resolver, anticipated, VNDB stats /
  schema / authinfo / release / producer / tag / trait), then
  re-fetches each so `fetched_at` actually moves forward. Without the
  bust step the helpers would just read the still-fresh cache and the
  chip would never update — which is what made the button feel like
  a no-op before.
- DB status panel on `/data`: row counts per table, VNDB auth state,
  token source (DB / env / none), EGS coverage, cache freshness, DB path

### Stats & charts
- Personal: total VN, hours played, average rating, favorites,
  status donut
- Time series: VNs finished per month (last 12 months)
- Distributions: rating histogram, by language, by platform, by
  country, by edition, by year (clickable bars → library filter)
- Top tags in your collection
- EGS aggregates: matched count, average EGS median across the
  collection, sum of EGS playtimes, `total = mine + EGS`
- Global VNDB counters

### Dump tracking
- **`/dumped` page** — dedicated management view for backup /
  archival progress. Top: global stats grid (total editions, dumped
  editions, fully-dumped VNs, completion %) with a progress bar.
  Below: a card per VN showing its dumped-editions ratio (e.g.
  *2 / 3*) and a mini progress bar, with fully-dumped VNs visually
  flagged. Companion to the existing per-edition `is_dumped` flag
  in `owned_release` — gives the same "how complete is my archive?"
  signal as the editor / producer completion pages.

### Backup & migration
- **Export**: full collection as JSON (versioned schema)
- **Import**: round-trip restore — drop a `.json` (merge) or a `.db` /
  `.sqlite` file (full replace via `ATTACH` + column-intersected copy
  in a single transaction)
- **DB backup**: download the SQLite `.db` directly (WAL checkpoint
  flushed first)
- Title display can be flipped per-locale (Settings → "Original title
  first") so 日本語 becomes the headline and romaji the subtitle

### Reading & journaling
- **Pomodoro timer** on every detail page — 25 min default, configurable.
  On stop, prompt to merge the elapsed minutes into `playtime_minutes`.
  Publishes the live elapsed-minute count via `SessionPanel` so the
  game log can stamp notes with "23m into a session".
- **Game log** — free-form timestamped journal next to the Pomodoro.
  Distinct from the activity log (which records state changes). Entries
  are grouped by day with hover-revealed edit / delete, ⌘/Ctrl+Enter to
  submit, character counter, optional session-minute attachment.
- **Activity log** — automatic per-VN audit trail of status / rating /
  playtime / favorite / started / finished / notes changes, plus manual
  entries.
- **Reading queue** — drag-orderable priority queue, distinct from
  `status='planning'`.

### Settings & content controls
The **closed-eye icon** in the navbar opens the content-controls hub:
- **Spoiler level** (0 = none / 1 = minor / 2 = all) — matches VNDB
- **Hide all images** globally
- **Blur R18** imagery
- **Hide sexual images** as a hard filter
- **NSFW threshold** slider (0 → 2, 0.1 steps)
- **Show sexual traits** on character pages
- "All settings…" jumps to the full gear-icon modal

The **gear icon** in the navbar opens the full settings modal:
- Every content-controls toggle (mirrored)
- **Original title first** (swap headline ↔ subtitle)
- **VNDB token** (paste from <https://vndb.org/u/tokens>) + writeback,
  status pull, fan-out auto-download toggle, backup URL
- **Steam** API key + 64-bit SteamID
- **Random quote source** — all VNDB or only from your collection
- **Default sort** for the library

### i18n
French / English / Japanese, type-safe dictionary. Cookie-driven, switch
from the navbar. Zero hardcoded user-facing string in components.

---

## Quick start

```bash
git clone <this-repo>
cd vndb-collection
cp .env.example .env.local       # add your VNDB token (optional)
npm install
npm run dev                       # http://localhost:3000
```

For production:

```bash
npm run build
npm start
```

The local DB lives at `./data/collection.db` (SQLite WAL).
Downloaded images go under `./data/storage/`.
Both directories are gitignored.

### Getting a VNDB token

Visit <https://vndb.org/u/tokens> while logged in, generate one, then either:

- paste it into the **Settings panel** in the app (stored in the SQLite
  DB — preferred for non-developer users), or
- set the `VNDB_TOKEN` env var in `.env.local`:

  ```
  VNDB_TOKEN=xxxx-xxxxx-xxxxx-xxxx-xxxxx-xxxxx-xxxx
  ```

When both are set the DB value wins. The app works without a token
(anonymous read access) but rate limits are tighter and the wishlist
endpoint is gated behind authentication.

### ErogameScape

No setup needed. The integration hits the public SQL form at
<https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer.php>
with a polite User-Agent and caches everything in the local `vndb_cache`
table.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Server actions + RSC + dynamic routes |
| UI | React 19, TailwindCSS 3.4 | No component library; fast iteration |
| Icons | lucide-react | Tree-shakable, consistent style |
| DB | better-sqlite3 11 | Sync, in-process, WAL, blazing fast |
| API client | Native `fetch` | Custom cache layer in SQLite |
| Markdown | react-markdown + remark-gfm | For personal notes |

No state library. No auth. No tracking.

---

## Architecture

```
                ┌─────────────────────────┐  ┌─────────────────────────┐
                │   VNDB Kana API v2      │  │   ErogameScape SQL form │
                │   api.vndb.org/kana     │  │   (public, no API key)  │
                └────────────┬────────────┘  └────────────┬────────────┘
                             │                            │
                             ▼  (cached, ETag-aware)      ▼  (cached, 24h TTL)
        ┌──────────────────────┐    ┌──────────────────────────────┐
        │  Browser (React 19)  │◀──▶│ Next.js 15 server (Node 20+) │
        │  - URL-driven state  │    │  - /api/* routes             │
        │  - i18n (cookie)     │    │  - lib/vndb.ts               │
        │  - SafeImage         │    │  - lib/vndb-cache.ts         │
        │  - SVG charts        │    │  - lib/erogamescape.ts       │
        │  - Compare views     │    │  - lib/db.ts (better-sqlite3)│
        │                      │    │  - lib/assets.ts             │
        │                      │    │  - lib/source-resolve.ts     │
        └──────────────────────┘    └──┬──────────────────┬────────┘
                                       ▼                  ▼
                              ┌────────────────────────┐ ┌──────────────┐
                              │ data/                  │ │ data/storage │
                              │ collection.db          │ │ ├ vn/        │
                              │ (SQLite WAL)           │ │ ├ vn-sc/     │
                              │                        │ │ ├ cover/     │
                              │ vn / collection        │ │ ├ producer/  │
                              │ producer / series      │ │ ├ series/    │
                              │ series_vn              │ │ └ character/ │
                              │ owned_release          │ └──────────────┘
                              │ vn_route               │
                              │ vn_activity            │
                              │ vn_game_log            │
                              │ vn_quote               │
                              │ vn_staff_credit        │
                              │ vn_va_credit           │
                              │ character_image        │
                              │ egs_game               │
                              │ user_list              │
                              │ user_list_vn           │
                              │ saved_filter           │
                              │ reading_queue          │
                              │ reading_goal           │
                              │ steam_link             │
                              │ shelf_unit             │
                              │ shelf_slot             │
                              │ vndb_cache             │
                              │ app_setting            │
                              └────────────────────────┘
```

VNDB and ErogameScape entries coexist:
- `v\d+` → VNDB-sourced (the regular path)
- `egs:\d+` → EGS-only synthetic, used for games missing from VNDB.
  VNDB-only helpers (`getCharactersForVn`, `getReleasesForVn`,
  `getQuotesForVn`) short-circuit for non-`v` ids so list / detail
  pages still render cleanly without 500s.

---

## Roadmap & references

[FEATURES.md](FEATURES.md) is the canonical catalogue of every shipped
feature, with file paths, DB shape and API surface. Start there if
you're new to the codebase.

[TUTORIAL.md](TUTORIAL.md) is the user-facing walkthrough — every
screen, every keyboard shortcut, every workflow.

[PLAN.md](PLAN.md) captures the implementation plans for the historical
feature batches and what's still on deck.

[CLAUDE.md](CLAUDE.md) is the architecture / agent guide — conventions,
gotchas, where to add new endpoints, how the rate limiter / fan-out /
cache layer fit together.

First-time visitors also get an in-app guided tour
(re-runnable from `/data → Tour`).

---

## Contributing

This is a personal project, but the architecture is generic enough to fork.
See [CLAUDE.md](CLAUDE.md) for the developer / agent guide
(file layout, conventions, gotchas, how to add new VNDB / EGS endpoints).

---

## License

Personal use. Data fetched from VNDB is subject to the
[VNDB Data License](https://vndb.org/d17). ErogameScape data is
public; cite the project if you redistribute.
