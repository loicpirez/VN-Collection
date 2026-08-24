# VN Collection

<p align="center">
  <img src="./Screenshot.png" alt="VN Collection screenshot" width="100%" />
</p>

Self-hosted visual novel collection manager.

VN Collection helps you catalogue, search, sort, and manage a personal visual novel library. It supports SQLite for simple local installs and PostgreSQL for production deployments, caches metadata from VNDB and ErogameScape, and provides tools for inventory, shelf layout, reading progress, notes, images, tags, recommendations, and source comparison.

No cloud account. No telemetry. No bundled games. No bundled copyrighted media.

![status](https://img.shields.io/badge/status-self--hosted-blue)
![stack](https://img.shields.io/badge/stack-Next.js%2016%20·%20React%2019%20·%20SQLite%20%2F%20PostgreSQL-22c55e)
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
- Export, import, and back up the configured SQLite or PostgreSQL database.
- Print QR label sheets for physical editions via `/labels`.
- Check per-VN shop stock and prices across Eroge Price, Sofmap, Suruga-ya, Mandarake, Melonbooks, Unoya, Trader, WonderGOO, and other linked retailers.
- Browse and match second-hand stock from AliceNet against VNDB/EGS on the AliceNet shop's page.

---

## Data sources

VN Collection can read metadata from:

- [VNDB Kana API v2](https://api.vndb.org/kana)
- [ErogameScape](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/)

Source data is cached locally to reduce repeated requests and improve offline browsing. The app includes rate limiting, cache expiry, stale-while-error behavior, and source links so entries can be traced back to their origin.

VNDB and ErogameScape are independent third-party projects. Their data, site content, images, ratings, names, and metadata remain subject to their own terms, licenses, and rights holders. VN Collection does not grant redistribution rights for third-party data.

The optional shop map is private by default. It does not mount the external
tile layer or enable address search until you allow external map services in
the map UI. Enabling it loads tiles from CARTO. Address searches send the
entered query to Nominatim (OpenStreetMap); saved collection rows are not sent
as a bulk payload. The explanation can be collapsed after review without
changing the opt-in state.

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
- Character, staff, and producer detail pages also support drag-reorderable sections.

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

### AliceNet stock mirror

- Download the current second-hand stock from [AliceNet](https://www.alice-kobe.com/) on demand (never auto-fetched).
- Full sync: items no longer listed (sold) are deleted from the local DB.
- Auto-match stock entries against VNDB and ErogameScape with rate-limited batch processing.
- Top-3 VNDB candidates stored per item for quick remapping without re-searching.
- Six-step "Download all": stock, VNDB + EGS match, retry no-result, match VNDB from EGS, VNDB data download, EGS resolution. Three of those operations are also exposed as standalone single ops (`match-vndb-from-egs`, `retry-vndb-aggressive`, `search-egs-no-vndb`).
- Filter tabs: All, Matched, VNDB, EGS only, Unmatched, No VNDB result, In collection, In wishlist.
- The AliceNet controls live only on the linked AliceNet shop place page (`/places/[id]` when that place is assigned to AliceNet). `/stock` shows generic per-VN stock lookup and cached AliceNet offers, but it does not mount mirror-wide AliceNet controls; individual VN detail pages do not mount them either.
- Outbound fetch can route through the stock SOCKS5/HTTP proxy settings.

### Per-VN stock and price lookup

`/stock` and the Stock section on each VN page query supported shops only after an explicit button press.

- Uses cached VNDB release links, JAN/GTIN codes, EGS links, and known official-shop pages to find offers.
- Stores per-provider snapshots locally, including price, availability, condition, edition label, shop location, and fetch errors.
- Supported provider families include Eroge Price, Sofmap, Suruga-ya, PC Shop Unoya, Melonbooks, Mandarake, WonderGOO, Trader, Animate, ebten, Getchu, Gamers, GAMECITY, Asakusa Mach, Amazon JP, AmiAmi, Otakarasouko, GEO, Joshin, Neowing, Yodobashi, and Bikkuri Takarajima.
- The VN page shows available count, best price, last check time, selectable provider groups, per-provider diagnostics, and direct shop links.
- Provider tiles distinguish structured prices, structured offers, cached inventory, and search-link-only integrations. JAN-capable shops and constrained integrations are labeled explicitly.

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
cd vndb-collection-new
cp .env.example .env.local
yarn install
yarn dev
```

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

## Proxy configuration

Some outbound requests (ErogameScape, VNDB mirror, and stock shops) can be routed through a SOCKS5 or HTTP proxy. Set env vars for fixed network providers, or configure the visible controls in Settings → Integrations.

```env
EGS_PROXY_ENABLED=true
EGS_PROXY_PROTOCOL=socks5h
EGS_PROXY_HOST=proxy.example.com
EGS_PROXY_PORT=1080
EGS_PROXY_USERNAME=user
EGS_PROXY_PASSWORD=pass
```

Same pattern for the `VNDBMIRROR_` prefix. AliceNet has no page-enable environment flag and uses the stored Stock proxy settings rather than an `ALICENET_` or `STOCK_` env prefix.

Proxy passwords are never logged or echoed by the settings API.

`AliceNet` is the canonical label and identifier prefix. The `/api/alicenet/*`
routes and `alicenet_*` SQLite identifiers are used by the linked AliceNet shop
place page. `/stock` can display cached AliceNet offers as part of per-VN stock
lookup, but the mirror controls stay on the shop page and are not mounted on
individual VN pages. On first open, databases created before this rename
migrate their prior local table, settings, cached stock rows, and activity rows
forward automatically.

---

## Basic Auth reverse proxy

When Nginx protects the deployment with HTTP Basic Auth, include
`ops/nginx/vndb-public-icons.conf` inside the HTTPS `server` block before the
authenticated `location /` block:

```nginx
include /etc/nginx/snippets/vndb-public-icons.conf;

location / {
    include /etc/nginx/snippets/vndb-basic-auth.conf;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    include /etc/nginx/snippets/vndb-proxy-proof.conf;
}
```

Generate one random proxy secret. Store it as `TRUSTED_PROXY_SECRET` in the
application environment with `ALLOW_TRUSTED_PROXY=1`, and install a root-only
`/etc/nginx/snippets/vndb-proxy-proof.conf` from
`ops/nginx/vndb-trusted-proxy.conf.example` using the same value. Nginx must
overwrite `X-Proxy-Secret`; never forward the client-supplied value. Keep the
installed snippet mode `0600`. This proof lets the application distinguish a
Basic-Auth-protected request relayed over loopback from a direct local request.
Forwarded host and protocol are trusted for Origin checks only after that proof
matches.

Safari and iOS can request `favicon.ico` and Apple touch icons from a separate
`NetworkingExtension` credential context immediately after the document login.
Challenging those no-content discovery requests can display a second Basic Auth
prompt. The reviewed snippet returns an empty cacheable response only for those
icon names. All pages, Next.js assets, and API routes remain behind Basic Auth.

Validate with `sudo nginx -t` before reloading Nginx.

---

## Database backends and PostgreSQL operations

SQLite and PostgreSQL implement the complete typed asynchronous repository
contract. SQLite remains the zero-configuration default for local installs;
`DATABASE_BACKEND=postgres` selects the production-capable PostgreSQL backend.
The reference production deployment completed its verified PostgreSQL cutover
in August 2026. `sqlite-readonly` remains available only for migration
verification and deliberate rollback preparation.

PostgreSQL schema changes are deliberate operator actions. The application
never creates or upgrades its PostgreSQL schema during normal startup:

```bash
DATABASE_BACKEND=postgres \
DATABASE_URL=postgresql://user:password@localhost:5432/vndb_collection \
yarn db:postgres:apply
```

Migration files under `db/postgres/migrations/` must use sequential
`0001_name.sql` filenames and an outer `BEGIN`/`COMMIT` wrapper. The migration
runner serializes operators with a PostgreSQL advisory lock, applies each
pending file atomically, records it in `schema_migration`, and rolls back a
failed file. On Node startup, the app compares the exact applied version set
with the files shipped in the current build. Missing, unexpected, or absent
version state blocks startup with an actionable error instead of modifying the
database implicitly.

Review migrations and take a verified backup before running the command against
an existing database. Never run two application builds with different migration
sets against the same database during deployment.

The Backup action on `/data` produces an online `.db` snapshot in SQLite mode
and a streamed `.vncbackup` logical archive in PostgreSQL mode. PostgreSQL
archives include migration/schema metadata, per-table counts, and a row digest.
Restore requires typed destructive confirmation, validates the complete archive
in temporary staging tables, replaces application rows atomically, verifies
destination counts, and realigns identity sequences. Local media storage is not
part of either database archive and must be backed up separately. Scheduled
operator backups with `pg_dump` remain the independent disaster-recovery layer;
see `docs/POSTGRESQL_OPERATIONS.md`.

Contractual JSON columns remain `TEXT` during the controlled cutover so existing
repository return shapes and checksums stay compatible. PostgreSQL queries use
normalized index tables instead of casting historical JSON text. The copy tool
preserves `NULL` and empty values, copies valid JSON unchanged, and moves every
non-empty malformed value into `postgres_json_quarantine` while storing `NULL`
in the destination domain column. The migration report includes the quarantine
count; a nonzero count requires review before cutover.

PostgreSQL substring search uses a shared NFKC plus lowercase key and `pg_trgm`
GIN indexes. This preserves literal substring behavior for Latin and Japanese
text, including full-width compatibility forms, without relying on a language
tokenizer. User `%`, `_`, and backslash characters are escaped before binding.

### Reproducible local PostgreSQL

The development service uses PostgreSQL 16.10 pinned by multi-architecture image
digest, binds only to localhost, persists data in a named volume, and waits for
`pg_isready` before returning:

```bash
yarn db:postgres:dev:up
export DATABASE_BACKEND=postgres
export DATABASE_URL='postgresql://vndb:vndb-local-only@127.0.0.1:55432/vndb_collection'
yarn db:postgres:apply
yarn db:postgres:smoke
```

Stop it without deleting the database volume:

```bash
yarn db:postgres:dev:down
```

The isolated test service uses a tmpfs database on port `55433`; stopping it
deletes all test rows:

```bash
yarn db:postgres:test:up
export DATABASE_BACKEND=postgres
export DATABASE_URL='postgresql://vndb_test:vndb-test-only@127.0.0.1:55433/vndb_collection_test'
yarn db:postgres:apply
yarn db:postgres:test:down
```

These credentials are intentionally fixed for localhost-only development and
tests. Do not reuse them in a shared or production environment, and do not expose
either Compose port on a public interface.

---

## Advanced environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_BACKEND` | `sqlite` | Select writable `sqlite`, compatibility `sqlite-readonly`, or primary `postgres` mode |
| `DATABASE_URL` | unset | Required PostgreSQL connection URL when `DATABASE_BACKEND=postgres` |
| `DATABASE_POOL_MAX` | `10` | PostgreSQL pool limit, from 1 to 100 connections |
| `DATABASE_IDLE_TIMEOUT_MS` | `30000` | PostgreSQL idle connection timeout, from 1,000 to 600,000 ms |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | PostgreSQL connection timeout, from 100 to 120,000 ms |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | PostgreSQL statement timeout, from 100 to 600,000 ms |
| `DATABASE_LOCK_TIMEOUT_MS` | `5000` | PostgreSQL lock timeout, from 100 to 120,000 ms |
| `DATABASE_SSL_MODE` | `disable` | PostgreSQL TLS policy: `disable`, `require`, or `verify-full` |
| `DATABASE_APPLICATION_NAME` | `vndb-collection` | PostgreSQL client name, limited to 63 characters |
| `DB_PATH` | `./data/collection.db` | Override the SQLite file location in `sqlite` or `sqlite-readonly` mode |
| `STORAGE_ROOT` | `./data/storage/` | Override media/image storage directory |
| `VN_ADMIN_TOKEN` | unset | Admin bearer token (alternative to localhost-only auth) |
| `VN_PUBLIC_READ_AUTH` | unset | Public API read policy: `token` enforces `VN_ADMIN_TOKEN`; `upstream` declares that the reverse proxy already authenticates every request |
| `ALLOW_TRUSTED_PROXY` | unset | Set to `1` only when the reverse proxy injects the private proof header |
| `TRUSTED_PROXY_SECRET` | unset | Random secret shared with the trusted proxy and stored outside the repository |
| `VNCOLL_DISABLE_ACTIVITY` | unset | Set to `1` to disable the global `user_activity` audit log (only the literal `1` is honoured; other values are a no-op) |

Leave `VN_PUBLIC_READ_AUTH` unset for the historical localhost or trusted-LAN
deployment. Use `token` only when the client or reverse proxy supplies
`Authorization: Bearer <VN_ADMIN_TOKEN>` or `x-admin-token` on API requests.
Use `upstream` only when the reverse proxy already blocks unauthenticated page
and API access; this mode suppresses the deployment warning but deliberately
does not duplicate the upstream authentication check.

---

## Tech stack

| Layer     | Choice                      |
| --------- | --------------------------- |
| Framework | Next.js 16 App Router       |
| UI        | React 19, Tailwind CSS      |
| Icons     | lucide-react                |
| Database  | SQLite via better-sqlite3 or PostgreSQL 16 |
| Markdown  | react-markdown + remark-gfm |
| Tests     | Vitest                      |

No hosted backend, no tracking, no third-party analytics.

---

## Architecture

```text
React UI
   │
   ▼
Next.js server routes
   ├── VNDB API / ErogameScape
   └── Typed repository contract
          ├── SQLite
          └── PostgreSQL
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
* [TODO/README.md](TODO/README.md) - active audit backlog and verification status
* [docs/SQLITE_RECOVERY_RUNBOOK.md](docs/SQLITE_RECOVERY_RUNBOOK.md) - safe operator recovery for a corrupt local SQLite database
* [docs/POSTGRESQL_MIGRATION_RUNBOOK.md](docs/POSTGRESQL_MIGRATION_RUNBOOK.md) - controlled PostgreSQL rehearsal, cutover, validation, and rollback procedure
* [docs/POSTGRESQL_OPERATIONS.md](docs/POSTGRESQL_OPERATIONS.md) - PostgreSQL health, shutdown, backup, monitoring, and incident operations

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
