# VN Collection

<p align="center">
  <img src="./Screenshot.png" alt="VN Collection screenshot" width="100%" />
</p>

Self-hosted visual novel collection manager.

VN Collection helps you catalogue, search, sort, and manage a personal visual novel library. It stores your data locally in SQLite, caches metadata from VNDB and ErogameScape, and provides tools for inventory, shelf layout, reading progress, notes, images, tags, recommendations, and source comparison.

No cloud account. No telemetry. No bundled games. No bundled copyrighted media.

![status](https://img.shields.io/badge/status-self--hosted-blue)
![stack](https://img.shields.io/badge/stack-Next.js%2016%20·%20React%2019%20·%20SQLite-22c55e)
![locale](https://img.shields.io/badge/i18n-FR%20·%20EN%20·%20JA-f5c518)

---

## What it does

- Manage a local VN library with status, ratings, playtime, dates, favorites, notes, routes, reading queue, and lists.
- Track physical or digital editions separately from VN-level status.
- Organize owned editions in a visual shelf layout, including fullscreen read-only browsing and drag-and-drop layout editing.
- Cache and compare metadata from VNDB and ErogameScape.
- Search locally and remotely across VNs, releases, producers, staff, characters, tags, traits, and EGS entries.
- Browse discovery pages such as upcoming releases, top-ranked VNs, recommendations, dumped status, and statistics.
- Customize layouts, density, filters, spoiler visibility, and content display.
- Export, import, and back up the local SQLite database.

---

## Data sources

VN Collection can read metadata from:

- [VNDB Kana API v2](https://api.vndb.org/kana)
- [ErogameScape](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/)

Source data is cached locally to reduce repeated requests and improve offline browsing. The app includes rate limiting, cache expiry, stale-while-error behavior, and source links so entries can be traced back to their origin.

VNDB and ErogameScape are independent third-party projects. Their data, site content, images, ratings, names, and metadata remain subject to their own terms, licenses, and rights holders. VN Collection does not grant redistribution rights for third-party data.

---

## Key features

### Library

- Status tracking: planning, playing, completed, on hold, dropped.
- Personal rating, playtime, start/finish dates, favorites, notes, routes, logs, and reading queue.
- URL-driven filters and grouping by status, developer, publisher, tag, series, year, dumped state, aspect ratio, and more.
- Per-page card density controls with saved defaults.
- Bulk select, random pick, download missing data, and full refresh actions.
- Recently viewed, anniversaries, reading queue, and library sections with persistent layout options.

### Detail pages

- VN detail pages with cover, banner, metadata, tags, releases, characters, staff, relations, notes, quotes, media, and source comparison.
- Custom cover and banner selection from local, VNDB, EGS, release images, or screenshots.
- Media gallery with lightbox, compact actions, and local caching.
- Clickable metadata chips for navigation and filtering.
- VNDB status writeback when a token is configured.

### Editions and shelf

- Per-edition inventory with release id, platform, language, condition, location, box type, price, acquisition date, dump state, and notes.
- Support for VNDB releases and synthetic entries for EGS-only items.
- Shelf views:
  - visual read-only shelf
  - by edition
  - by VN
  - drag-and-drop layout editor
- Front display rows, fullscreen shelf browsing, saved visual sizing, and exact-edition placement.

### VNDB integration

- VN, release, producer, staff, character, tag, trait, quote, schema, stats, and user-list endpoints.
- Token support for private list/status read and writeback.
- Wishlist and VNDB list label management.
- Global request throttling and retry handling.
- Selective and full metadata download.

### ErogameScape integration

- EGS matching, manual mapping, ranking, anticipated releases, ratings, playtime, brand metadata, and source comparison.
- EGS-only entries can be added to the local library with synthetic ids.
- Manual EGS ↔ VNDB mapping for missing or incorrect matches.
- EGS cover resolution and local mirroring.

### Search and discovery

- Global search across local data, VNDB, and EGS.
- Character and staff search with local/VNDB modes where supported.
- Tag and trait exploration with local collection and VNDB result modes.
- Recommendations based on tags, ratings, ownership state, and discovery mode.
- Top-ranked pages with vote thresholds and weighted ranking.
- Upcoming and anticipated releases with cache freshness indicators.

### Stats and maintenance

- Collection stats, ratings, playtime, platforms, languages, tags, producers, years, dumped progress, and EGS coverage.
- Clickable charts and rows for navigation.
- Database status, cache status, source settings, backup, import/export, and maintenance tools.
- Schema browser for local, VNDB, and EGS-related data structures.

### Content controls

Some visual novel databases include age-rated or adult metadata. VN Collection provides local content controls for:

- spoiler level
- image hiding
- R18 blur
- sexual image filtering
- NSFW threshold
- spoiler reveal on hover/focus/tap
- per-page and global display settings

These controls affect the local UI only. They do not modify upstream data.

---

## Quick start

```bash
git clone <this-repo>
cd vndb-collection
cp .env.example .env.local
yarn install
yarn dev
````

Open:

```text
http://localhost:3000
```

For production:

```bash
yarn build
yarn start
```

The canonical package manager is **yarn**.

Local data is stored in:

```text
data/collection.db
data/storage/
```

Both are gitignored.

---

## VNDB token

The app works without a VNDB token for public read-only metadata. A token is required for private list/status features such as wishlist sync and VNDB list writeback.

Create a token from your VNDB account page, then either:

* paste it in Settings → Integrations, or
* set it in `.env.local`:

```env
VNDB_TOKEN=xxxx-xxxxx-xxxxx-xxxx-xxxxx-xxxxx-xxxx
```

When both are present, the locally saved setting takes priority.

Never commit `.env.local`.

---

## ErogameScape

ErogameScape integration does not require an API key. The app can query publicly reachable EGS pages/forms, cache the results locally, and link back to the source.

If you configure an EGS user id, the app can also help sync user-specific public review/playtime data where available.

---

## Tech stack

| Layer     | Choice                      |
| --------- | --------------------------- |
| Framework | Next.js 16 App Router       |
| UI        | React 19, Tailwind CSS      |
| Icons     | lucide-react                |
| Database  | SQLite via better-sqlite3   |
| Markdown  | react-markdown + remark-gfm |
| Tests     | Vitest                      |

No hosted backend, no tracking, no third-party analytics.

---

## Architecture

```text
VNDB API / ErogameScape
          │
          ▼
Next.js server routes
          │
          ▼
SQLite cache + local collection DB
          │
          ▼
React UI
```

Main local data:

```text
data/collection.db
data/storage/
```

The app separates:

* local collection data
* cached source metadata
* downloaded images
* user settings
* owned-edition inventory
* shelf layout
* source mappings

Refreshing metadata does not add an item to your collection. Collection membership and cached source data are separate systems.

---

## Documentation

* [FEATURES.md](FEATURES.md) — detailed feature catalogue
* [TUTORIAL.md](TUTORIAL.md) — user walkthrough
* [PLAN.md](PLAN.md) — historical implementation notes
* [CLAUDE.md](CLAUDE.md) — developer and agent guide

---
## Data, media, and compliance

VN Collection is a self-hosted personal library manager.

It does not include, sell, distribute, or host:

* visual novel game files
* patches
* cracks
* serials or activation material
* bundled copyrighted covers, screenshots, or release artwork
* upstream database dumps

The application can download and cache metadata and images from configured public sources for local personal library management. Users are responsible for complying with each source’s terms, license requirements, rate limits, and applicable law.

VNDB data is subject to [VNDB’s Data License](https://vndb.org/d17) and the [VNDB Kana API usage terms](https://api.vndb.org/kana).

ErogameScape data and site content remain subject to [ErogameScape](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/), its site policies, and the relevant rights holders. ErogameScape’s public SQL pages are available through [エロゲーマーのためのSQL](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_index.php), but this project does not treat that access as permission to redistribute cached database exports or media.

This project does not claim ownership over third-party metadata or media.

If you publish a fork, demo, screenshot, dataset, or hosted instance, review the upstream terms first and avoid redistributing cached media or database exports unless you have the right to do so.
