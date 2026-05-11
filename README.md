# VN Collection

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
  physical location (multi-tag), box type, edition label, condition
  (sealed / new / opened / used / damaged), price paid + currency,
  acquired date, dumped state, and notes — independently of the VN-level
  status
- **Routes** — heroine / branch tracker with autocomplete from the VN's
  main / primary cast, completion checkboxes, and reorderable list
- **Markdown notes** (GFM, tables, code blocks) for personal reviews
- **Series / collections** to group VNs (`Fate`, `Type-Moon`, …)
- Sort: recently updated, added, title, VNDB rating, your rating, playtime,
  release year, publisher, **EGS rating**, **combined (VNDB + EGS) / 2**
- Filters: status, publisher, series, tag, free-text, place, year range,
  **dumped state** — all persisted in the URL
- Group-by: status, publisher, tag, series
- Recently viewed strip on the home page (localStorage, last 12 entries)
- Bulk select / edit / download

### VNDB integration (every Kana endpoint)
- VN search (debounced) + advanced filters
- Producer pages with logo upload + ranking + average rating
- Character pages — metadata, traits, every VN they appear in
- Tag & trait browsers — trait page has an "In my collection" toggle
- Release listings per VN — package artwork, languages with mtl flag,
  voiced level, GTIN / catalog, all extlinks
- Quote of the moment (footer, hover-reveal)
- VNDB global stats + auth info on `/stats` and `/data`
- **Wishlist** — pulls your VNDB Wishlist (label 5), bulk select + delete
  (PATCH `/ulist/{vid}` with `labels_unset:[5]` — other labels survive)
- **VNDB token settable from the Settings panel** (stored locally in the
  SQLite app_setting table); `VNDB_TOKEN` env var stays the fallback

### ErogameScape integration
- Auto-resolve via VNDB release extlinks (every release's `extlinks` is
  scanned for an ErogameScape URL). Falls back to a fuzzy name search
  against the EGS `gamelist` when no extlink exists.
- Pulls every available column: gamename, gamename_furigana, brand_id +
  brand_name, model, sellday, median / average / dispersion / count,
  description (prelude / shoukai_for_game / gamelist_introduction —
  tried in order), okazu, erogame, and the entire row as `raw_json`.
- Median user playtime computed locally from `user_review_for_game`.
- Cover image mirrored locally so it survives EGS being down.
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
- Custom cover upload (override the VNDB poster)
- Custom banner upload + drag-positionable focal point
- **Hide all images** mode + **blur R18** mode with adjustable threshold
  (0–2) + **Hide sexual content** hard filter
- Prefer-local toggle so images survive offline / VNDB outages
- "Download all data" button on the library fully refreshes both VNDB
  and EGS payloads + re-mirrors all images

### Caching & offline
- Per-endpoint TTL with **ETag / If-None-Match** support
- In-flight dedupe (multiple concurrent requests for the same data → 1
  upstream hit)
- Stale-while-error fallback if VNDB / EGS is down
- Cache panel on `/stats` (counts per endpoint, prune expired, clear all)
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

### Backup & migration
- **Export**: full collection as JSON (versioned schema)
- **Import**: round-trip restore — drop a `.json` (merge) or a `.db` /
  `.sqlite` file (full replace via `ATTACH` + column-intersected copy
  in a single transaction)
- **DB backup**: download the SQLite `.db` directly (WAL checkpoint
  flushed first)
- Title display can be flipped per-locale (Settings → "Original title
  first") so 日本語 becomes the headline and romaji the subtitle

### Settings (Settings panel — top-right gear icon)
- Hide all images / Blur R18 / NSFW threshold / Prefer local images
- **Hide sexual content** (hard filter — entries above the threshold
  are dropped, not blurred)
- **Original title first** (swap headline ↔ subtitle)
- **VNDB token** (paste from <https://vndb.org/u/tokens>)
- **Random quote source** — all VNDB or only from your collection

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
                              ┌──────────────────┐ ┌──────────────┐
                              │ data/            │ │ data/storage │
                              │ collection.db    │ │ ├ vn/        │
                              │ (SQLite WAL)     │ │ ├ vn-sc/     │
                              │                  │ │ ├ cover/     │
                              │ vn / collection  │ │ ├ producer/  │
                              │ producer / series│ │ ├ series/    │
                              │ series_vn        │ │ └ character/ │
                              │ owned_release    │ └──────────────┘
                              │ vn_route         │
                              │ character_image  │
                              │ egs_game         │
                              │ vndb_cache       │
                              │ app_setting      │
                              └──────────────────┘
```

VNDB and ErogameScape entries coexist:
- `v\d+` → VNDB-sourced (the regular path)
- `egs:\d+` → EGS-only synthetic, used for games missing from VNDB.
  VNDB-only helpers (`getCharactersForVn`, `getReleasesForVn`,
  `getQuotesForVn`) short-circuit for non-`v` ids so list / detail
  pages still render cleanly without 500s.

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
