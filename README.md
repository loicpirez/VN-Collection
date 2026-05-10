# VN Collection

Personal Visual Novel collection manager with a polished, IMDB / Steam-inspired UI.
All your data lives in a local SQLite file — no cloud, no account, no telemetry.

Built on top of the [VNDB Kana API v2](https://api.vndb.org/kana) for metadata,
with full local caching, image mirroring, and offline-friendly browsing.

![status](https://img.shields.io/badge/status-self--hosted-blue)
![stack](https://img.shields.io/badge/stack-Next.js%2015%20·%20React%2019%20·%20SQLite-22c55e)
![locale](https://img.shields.io/badge/i18n-FR%20·%20EN%20·%20JA-f5c518)

---

## Features

### Library
- Steam-like detail pages (custom cover, custom banner, hero backdrop)
- Track per-VN: status (planning / playing / completed / on hold / dropped),
  personal rating (10–100), playtime, started/finished dates, favorite
- **Inventory**: edition type (physical / limited / collector / digital / download code…),
  country of release (FR / JP / US / DE / KR …), free-text **physical location**
  (« Étagère salon haut, boîte cuir »)
- **Markdown notes** (GFM, tables, code blocks) for personal reviews
- **Series / collections** to group VNs (`Fate`, `Type-Moon`, …)
- Sort: recently updated, added, title, VNDB rating, your rating, playtime, release year, publisher
- Filters: status, publisher, series, **tag** (click any tag → see your collection filtered),
  free-text — all **persisted in the URL** (back/forward, bookmarkable)
- Group-by: status, publisher, tag, series

### VNDB integration (every Kana endpoint)
- VN search (debounced) + advanced filters (langs, platforms, length, year range, rating, has_screenshot/review/anime)
- Producer pages with logo upload + ranking by VN count + average rating
- Character pages — metadata, traits, **all the VNs they appear in** (with poster, rating, role)
- Tag & trait browsers with per-category filtering
- Release listings per VN — package artwork, languages with mtl flag, voiced level, GTIN/catalog, all extlinks
- Quote of the moment (footer, hover-reveal, lazy-loaded)
- VNDB global stats + auth info displayed on `/stats`

### Image management
- **Auto-download on add**: cover + thumbnail + screenshots + every release
  package image (pkgfront, pkgback, pkgcontent, pkgside, pkgmed, dig)
- Image gallery filtered by type, with lightbox
- "Set as banner" button on every gallery image to use it as the hero backdrop
- Custom cover upload (override the VNDB poster)
- Custom banner upload (override the hero backdrop)
- **Hide all images** mode + **blur R18** mode with adjustable threshold (0–2)
- Prefer-local toggle so images survive offline / VNDB outages

### Caching & offline
- Per-endpoint TTL with **ETag / If-None-Match** support
  (5 min for VN search, 1 h for stats / tags / traits, 24 h–7 days for everything else)
- In-flight dedupe (3 concurrent requests for the same data → 1 VNDB hit)
- Stale-while-error fallback if VNDB is down
- Cache panel on `/stats` (counts per endpoint, prune expired, clear all)

### Stats & charts
- Personal: total VN, hours played, average rating, favorites, status donut
- Time series: VNs finished per month (last 12 months)
- Distributions: rating histogram, by language, by platform, by country, by edition, by year
- Top tags in your collection
- Global VNDB counters

### Backup & migration
- **Export**: full collection as JSON (versioned schema, all your fields + cached VN data + series)
- **Import**: round-trip restore (drop a JSON or pick a file, idempotent upsert)
- **DB backup**: download the SQLite `.db` directly (with WAL checkpoint flushed first)

### i18n
French / English / Japanese, type-safe dictionary. Cookie-driven, switch from the navbar.
Zero hardcoded user-facing string in components.

---

## Quick start

```bash
git clone <this-repo>
cd vndb-collection
cp .env.example .env.local       # add your VNDB token (optional but recommended)
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

Visit <https://vndb.org/u/tokens> while logged in, generate one, paste into `.env.local`:

```
VNDB_TOKEN=xxxx-xxxxx-xxxxx-xxxx-xxxxx-xxxxx-xxxx
```

The app works without a token (anonymous read access) but rate limits are tighter.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Server actions + RSC + dynamic routes |
| UI | React 19, TailwindCSS 3.4 | No component library; fast iteration |
| Icons | lucide-react | Tree-shakable, consistent style |
| DB | better-sqlite3 11 | Sync, in-process, WAL, blazing fast |
| API client | Native `fetch` | With a custom cache layer using SQLite |
| Markdown | react-markdown + remark-gfm | For personal notes |

No state library. No auth. No tracking.

---

## Architecture in one diagram

```
                                      ┌─────────────────────────┐
                                      │      VNDB Kana API      │
                                      │   api.vndb.org/kana     │
                                      └────────────┬────────────┘
                                                   │
                                                   ▼  (cached, ETag-aware)
        ┌──────────────────────┐    ┌──────────────────────────────┐
        │  Browser (React 19)  │◀──▶│ Next.js 15 server (Node 20+) │
        │  - URL-driven state  │    │  - /api/* routes             │
        │  - i18n (cookie)     │    │  - lib/vndb.ts (client)      │
        │  - SafeImage         │    │  - lib/vndb-cache.ts         │
        │  - SVG charts        │    │  - lib/db.ts (better-sqlite3)│
        └──────────────────────┘    │  - lib/assets.ts             │
                                    └──┬──────────────────┬────────┘
                                       │                  │
                                       ▼                  ▼
                              ┌─────────────────┐ ┌──────────────┐
                              │ data/           │ │ data/storage │
                              │ collection.db   │ │ ├ vn/        │
                              │ (WAL)           │ │ ├ vn-sc/     │
                              │                 │ │ ├ cover/     │
                              │ Tables:         │ │ ├ producer/  │
                              │ - vn            │ │ └ series/    │
                              │ - collection    │ └──────────────┘
                              │ - producer      │
                              │ - series        │
                              │ - series_vn     │
                              │ - vndb_cache    │
                              └─────────────────┘
```

---

## Contributing

This is a personal project, but the architecture is generic enough to fork.
See [CLAUDE.md](CLAUDE.md) for the developer / agent guide
(file layout, conventions, gotchas, how to add new VNDB endpoints, etc.).

---

## License

Personal use. Data fetched from VNDB is subject to the
[VNDB Data License](https://vndb.org/d17).
