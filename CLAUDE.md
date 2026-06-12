# CLAUDE.md — Agent / Developer Guide

> Read this **first** before making any changes. It explains the design choices,
> the conventions used everywhere, and the small list of footguns we've hit
> while building this.

---

## Permanent agent operating contract

This section is mandatory for every task in this repository. Repository-specific
rules below remain mandatory too. When rules differ, use the stricter
interpretation and gather evidence before acting.

### Evidence and execution

- Evidence beats inference. Read the relevant implementation, tests, and docs
  before claiming a behavior exists or is fixed.
- Unknown and unverified items stay open. Do not mark a task complete from
  naming, comments, or assumptions.
- Continue until the stated objective is complete or a concrete blocker is
  documented. Do not silently drop lower-severity findings.
- Answer opinion and product-judgement questions directly before implementing
  the chosen direction.
- Do not limit audits to an arbitrary number of findings. Inspect multiple
  representative pages, states, records, and viewport sizes.

### File inspection and task tracking

- Read this file before changing source.
- Inspect complete functions and their call sites before editing them.
- To verify a tracker row, read the tracker row and directly open each
  referenced source file. Search locates candidates; direct inspection verifies
  them.
- Never read, edit, or print `.env*` files unless the current prompt explicitly
  requests it.
- Never read, edit, or stage anything under `data.old/`.

### Command integrity

- Run verification, test, typecheck, build, smoke, debug, deployment, and Git
  commands transparently. Do not filter, truncate, redirect, or mask their
  output to determine whether they passed.
- Do not pipe verification output through `grep`, `tail`, `head`, `sed`, `awk`,
  `cut`, `sort`, or `uniq`.
- Run fresh verification in the foreground. Do not reuse cached temporary
  output as completion evidence.
- Use `yarn`, never `npm`.

### Git discipline

- Do not run Git commands unless the current prompt explicitly requests Git
  operations.
- Each push, pull-request creation, or other remote write needs fresh explicit
  approval.
- Commit subjects use only `<type>(<scope>): <description>`. Do not add a body,
  AI co-author trailer, generated marker, personal phrasing, or real VN, studio,
  staff, or character names.
- Do not run destructive Git commands unless the current prompt explicitly
  requests them.
- Never revert operator changes. Work with existing edits.

### Implementation quality

- Follow existing repository patterns and use structured parsers and validators.
- Keep edits scoped. Do not refactor unrelated code solely to make testing
  easier.
- Do not add fabricated defaults, silent deletions, or assumption-based
  migrations.
- Default to zero inline comments. Use ESDoc only where a durable exported
  contract needs explanation.
- Never suppress coverage or type errors.
- Use deterministic timers and explicit teardown in tests.
- Route tests assert one exact status and the expected response body.
- Multi-source metadata behavior must remain coherent across the full
  application, not only on one page.

### Frontend and responsive behavior

- Every asynchronous surface uses a loading skeleton. Empty-state text appears
  only after a resolved empty result.
- Phone and tablet views retain functional parity. Do not hide required
  controls at narrower breakpoints.
- Interactive targets are at least 44 px on touch surfaces and support keyboard
  focus.
- Use `lucide-react` icons where available. Do not add emojis, Unicode
  pictographs, or custom SVGs where the icon library already provides a match.
- Keep task-oriented interfaces compact and scannable.
- Do not add em dash or en dash punctuation in new UI text, docs, comments, or
  commit messages.

---

## Project at a glance

**What it is**: a single-user, self-hosted Visual Novel collection manager.
Owner runs it locally on `localhost:3000`. No login, no cloud, no telemetry.

**What it does**: mirrors metadata + images from [VNDB Kana API v2](https://api.vndb.org/kana)
**and** [ErogameScape's public SQL form](https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/)
into a local SQLite, lets the owner annotate every VN (status, playtime, notes,
edition inventory, banner …), groups them in series / routes, and surfaces stats.
VNDB and EGS coexist per-field via a source-resolve helper (auto / VNDB / EGS).

**Primary use case**: a desktop power-user workflow with large screens, mouse,
and French / English / Japanese content.

**Compatibility requirements**: phone and tablet functional parity, keyboard
access, and accessible interaction semantics. Multi-user hosting and public
sharing remain out of scope.

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

- **Package manager**: `yarn`, never `npm`. `yarn.lock` is the only
  lockfile present and is canonical. CI, smoke tests, and every
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
│   ├── collection.db (+ .db-shm/.db-wal)  # canonical DB (env DB_PATH override possible)
│   ├── vndb.db                            # legacy / unused placeholder; safe to delete on
│   │                                       # operator preference. Not referenced in any
│   │                                       # current code path. (R5-173)
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
│   │   ├── stock/page.tsx              # Generic stock / price lookup + AliceNet mirror
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
│       ├── stock.ts                    # Generic shop stock parsers + per-VN stock refresh
│       ├── stock-provider-capabilities.ts # Canonical shop capability catalogue
│       ├── stock-query.ts              # Bounded title-query generation
│       ├── stock-api-types.ts          # Client-safe stock response DTOs
│       ├── alicenet.ts           # AliceNet fetch/parse/match/refresh (server-only)
│       ├── proxy-config.ts             # Per-provider proxy configuration + credential masking
│       ├── proxy-fetch.ts              # providerFetch() — routes through SOCKS5/HTTP agent
│       ├── source-resolve.ts           # resolveField helper (VNDB-first auto-fallback)
│       ├── types.ts                    # Domain types
│       ├── files.ts                    # storage bucket helpers (download, save, read)
│       ├── assets.ts                   # ensureLocalImagesForVn (covers + sc + release art + char + EGS)
│       ├── vn-detail-layout.ts         # versioned VN detail section layout config
│       ├── character-detail-layout.ts  # versioned Character detail section layout config
│       ├── staff-detail-layout.ts      # versioned Staff detail section layout config
│       ├── producer-detail-layout.ts   # versioned Producer detail section layout config
│       ├── series-detail-layout.ts     # versioned Series detail section layout config
│       ├── home-section-layout.ts      # versioned home strip visibility/collapse config
│       ├── section-layout.ts           # shared section-layout base utilities
│       ├── shortcut-registry.ts        # keyboard shortcut definitions
│       ├── download-status-names.ts    # localized job-name lookup for DownloadStatusBar
│       ├── vn-id-shape.ts              # type guard isVndbVnId / isEgsOnlyId
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

Routes prefixed `/api/`. The table below highlights the main contracts. The
generated inventory beneath it is the exhaustive source-of-truth list.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/collection` | Paginated list + stats. Defaults to 240 rows, caps pages at 500 rows, and applies advanced filters before slicing. Sort accepts `producer` / `publisher`; group accepts `producer` / `publisher`. |
| GET | `/api/collection/[id]` | Read one collection row |
| POST | `/api/collection/[id]` | **First add: triggers `ensureLocalImagesForVn`** synchronously |
| PATCH | `/api/collection/[id]` | Update tracking fields |
| DELETE | `/api/collection/[id]` | Remove from collection |
| POST/PATCH/DELETE | `/api/collection/[id]/cover` | Upload, rotate, or reset custom cover |
| POST/PATCH/DELETE | `/api/collection/[id]/banner` | Set, rotate, or reset banner |
| POST | `/api/collection/[id]/assets?refresh=true` | Force VNDB metadata refresh + redownload images |
| GET | `/api/collection/export` | JSON dump (file download) |
| POST | `/api/collection/import` | Restore from JSON (raw or multipart) |
| GET | `/api/backup` | Stream the `.db` file (after WAL checkpoint) |
| GET | `/api/files/[...path]` | Serve private mirrored/uploaded media under `data/storage/`; requires localhost or admin token and sends private cache directives |
| GET | `/api/search?q=` | Quick VN search |
| POST | `/api/search/advanced` | Multi-filter VN search (langs, platforms, length, year, rating, has_*) |
| GET | `/api/vn/[id]` | VN detail (cache 24 h via DB) |
| GET | `/api/vn/[id]/characters` | Characters of a VN |
| GET | `/api/vn/[id]/releases` | Releases of a VN |
| GET/POST/DELETE | `/api/vn/[id]/stock` | Read cached shop stock offers, explicitly refresh provider snapshots, or clear one VN's stock cache. |
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
| POST/DELETE | `/api/wishlist/[id]` | Add or remove a VN from the VNDB wishlist label |
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
| GET | `/api/egs-cover/[id]/candidates` | Enumerate trusted-host EGS cover sources (banner, VNDB, image.php, Suruga-ya, DMM, DLsite, Gyutto) without probing — UI shows them side-by-side |
| GET | `/api/route/[routeId]` / PATCH / DELETE | Per-route management |
| GET/POST/PATCH | `/api/collection/[id]/routes` | Per-VN routes (autocomplete from cast) |
| GET / POST | `/api/lists` | List / create user lists |
| GET / PATCH / DELETE | `/api/lists/[id]` | List CRUD |
| POST / DELETE | `/api/lists/[id]/items` | Add / remove / reorder list members |
| POST | `/api/refresh/global` | Bust EGS cover cache + re-fetch page-level caches. Gated behind `requireLocalhostOrToken`. |
| GET | `/api/download-status` | Polling snapshot of every in-flight fan-out job + throttle stats. Fallback for clients without `EventSource`. |
| GET/POST/DELETE | `/api/collection/[id]/activity` | Read, append, or remove per-VN audit-trail entries |
| GET | `/api/activity` | Global app-wide audit feed (all entity types) |
| GET | `/api/activity/kinds` | Distinct activity kind values for the filter dropdown |
| PATCH/POST/DELETE | `/api/collection/[id]/custom-description` | Save or remove a per-VN user-authored synopsis override |
| GET | `/api/collection/find?q=` | Fuzzy in-collection title search (used by the Steam linker) |
| POST | `/api/collection/full-download` | Selective bulk fan-out for a subset of VNs |
| PATCH/DELETE | `/api/collection/order` | Save or reset custom-sort drag order |
| GET | `/api/collection/tags`, `/api/collection/traits` | Aggregated tag / trait usage across the collection |
| GET | `/api/export/csv` / `/api/export/ics` / `/api/export/raw` | CSV / iCal / raw-cache exports |
| POST | `/api/backup/restore` | DB / JSON import (multipart) |
| GET | `/api/maintenance/duplicates` / `/api/maintenance/stale` | Diagnostics for the data-maintenance panel |
| GET | `/api/places` | Distinct values seen in `owned_release.physical_location` |
| GET/POST | `/api/reading-goal` | Per-year target; POST upserts the row. |
| GET/POST/DELETE/PATCH | `/api/reading-queue` | Personal "play next" queue; POST adds, DELETE removes, PATCH reorders. |
| GET/POST/PATCH/DELETE | `/api/saved-filters` | Pinned URL-param presets above the library filters. DELETE uses `?id=N`, PATCH reorders via `{ ids: number[] }`. No `/[id]` subroute exists. |
| GET | `/api/egs/sync` | Suggestions table for the EGS reviews fan-out (paired with POST below) |
| POST | `/api/egs/sync` | Apply EGS reviews / playtime sync for confirmed rows |
| POST | `/api/series/[id]/image` | Upload a series cover or banner asset |
| GET | `/api/search/textual` | Server-side filtered text search |
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
| GET | `/api/alicenet` | Bounded/paged result: `{ items, stats, pending, last_fetch }`. `stats` is the nested counter block (`total, matched, vndb_matched, egs_only, unmatched, none_found, in_wishlist`), `pending` is `{ vndb_pending, egs_pending }`, and `last_fetch` is the last download epoch (or `null`). Reads the mirrored rows from SQLite but also calls VNDB via `fetchAuthenticatedWishlist()` to annotate each item with the live wishlist label (Label 5); it does not re-fetch the AliceNet website. |
| POST | `/api/alicenet/fetch` | Download the AliceNet stock page (EUC-JP decoded), parse, full-sync the DB (`added / updated / removed`), return `{ count, added, updated, removed, fetched_at }`. |
| POST | `/api/alicenet/match-next` | Match the next batch against VNDB + EGS. Body: `{ batch?: number (1–20), retry_none?: boolean }`. Returns `{ processed, remaining }`. |
| POST | `/api/alicenet/reset-matches` | Clear all auto-matched VN links (`vn_match_source = 'auto'`). Returns `{ cleared }`. Manual links are preserved. |
| POST | `/api/alicenet/download-vndb` | Download VNDB metadata for matched items not yet in the local `vn` table. Body: `{ batch? }`. Returns `{ processed, remaining }`. |
| POST | `/api/alicenet/resolve-egs` | Resolve EGS links for alicenet items with `vn_id` but no `egs_id`, via `resolveEgsForVn`. Body: `{ batch? }`. Returns `{ processed, remaining }`. |
| POST/DELETE | `/api/alicenet/[code]/link` | Manually set VN and/or EGS link for a AliceNet item, or clear a manual link. |
| POST | `/api/refresh/scope` | Scoped cache invalidation. Body: `{ scope: string, params?: Record<string, string> }`. Returns `{ ok, deleted, patterns, scope }`. Scope and template params are validated against `REFRESH_SCOPES`. |
| POST | `/api/proxy/test` | Test a proxy configuration against the provider's canonical URL. Body: `{ provider, … }`. Returns reachability result. |

### Exhaustive route inventory

Generated from `src/app/api/**/route.ts`. Keep this list synchronized when a
route file or exported HTTP method changes.

<!-- API_ROUTE_INVENTORY_START -->
| Route | Methods |
| --- | --- |
| /api/activity/kinds | GET |
| /api/activity | GET |
| /api/alicenet/[code]/link | POST, DELETE |
| /api/alicenet/download-vndb | POST |
| /api/alicenet/fetch | POST |
| /api/alicenet/match-next | POST |
| /api/alicenet/match-vndb-from-egs | POST |
| /api/alicenet/reset-matches | POST |
| /api/alicenet/resolve-egs | POST |
| /api/alicenet/retry-vndb-aggressive | POST |
| /api/alicenet/run | POST, DELETE |
| /api/alicenet | GET |
| /api/alicenet/search-egs-no-vndb | POST |
| /api/backup/restore | POST |
| /api/backup | GET |
| /api/character/[id] | GET |
| /api/collection/[id]/activity | GET, POST, DELETE |
| /api/collection/[id]/assets | POST |
| /api/collection/[id]/banner | POST, PATCH, DELETE |
| /api/collection/[id]/cover | POST, DELETE, PATCH |
| /api/collection/[id]/custom-description | PATCH, POST, DELETE |
| /api/collection/[id]/game-log | GET, POST, PATCH, DELETE |
| /api/collection/[id]/owned-releases | GET, POST, PATCH, DELETE |
| /api/collection/[id] | GET, POST, PATCH, DELETE |
| /api/collection/[id]/routes | GET, POST, PATCH |
| /api/collection/[id]/source-pref | GET, PATCH |
| /api/collection/characters | GET |
| /api/collection/export | GET |
| /api/collection/find | GET |
| /api/collection/full-download | POST |
| /api/collection/import | POST |
| /api/collection/order | PATCH, DELETE |
| /api/collection | GET |
| /api/collection/tags | GET |
| /api/collection/traits | GET |
| /api/download-status | GET |
| /api/download-status/stream | GET |
| /api/egs-cover/[id]/candidates | GET |
| /api/egs-cover/[id] | GET |
| /api/egs/[id]/add | POST |
| /api/egs/[id]/vndb | GET, POST, DELETE |
| /api/egs/search | GET |
| /api/egs/sync | GET, POST |
| /api/export/csv | GET |
| /api/export/game-list | GET |
| /api/export/ics | GET |
| /api/export/raw | GET |
| /api/files/[...path] | GET |
| /api/lists/[id]/items | POST, DELETE |
| /api/lists/[id] | GET, PATCH, DELETE |
| /api/lists | GET, POST |
| /api/maintenance/duplicates | GET |
| /api/maintenance/stale | GET |
| /api/places/[id]/link | POST, DELETE |
| /api/places/[id]/other-branches | GET |
| /api/places/[id] | GET, PATCH, DELETE |
| /api/places/[id]/stock | GET |
| /api/places/provider-map | GET |
| /api/places | GET, POST |
| /api/places/unassigned | GET |
| /api/producer/[id]/logo | POST, DELETE |
| /api/producer/[id]/refresh | POST |
| /api/producer/[id] | GET |
| /api/producers | GET |
| /api/proxy/test | POST |
| /api/reading-goal | GET, POST |
| /api/reading-queue | GET, POST, DELETE, PATCH |
| /api/refresh/global | POST |
| /api/refresh/scope | POST |
| /api/release/[id] | GET |
| /api/route/[routeId] | GET, PATCH, DELETE |
| /api/saved-filters | GET, POST, DELETE, PATCH |
| /api/search/advanced | POST |
| /api/search | GET |
| /api/search/textual | GET |
| /api/series/[id]/image | POST |
| /api/series/[id] | GET, PATCH, DELETE |
| /api/series/[id]/vn/[vnId] | POST, DELETE |
| /api/series | GET, POST |
| /api/settings | GET, PATCH |
| /api/shelves/[id]/displays | POST, DELETE |
| /api/shelves/[id] | GET, PATCH, DELETE |
| /api/shelves/[id]/slots | POST, DELETE |
| /api/shelves | GET, POST, PATCH |
| /api/staff/[id]/download | POST |
| /api/staff | GET |
| /api/steam/library | GET |
| /api/steam/link | GET, POST, DELETE |
| /api/steam/sync | GET, POST |
| /api/stock/batch | POST, DELETE |
| /api/stock/queue | GET |
| /api/stock/recent | GET |
| /api/stock/resolve-titles | GET |
| /api/stock/summary | GET, POST |
| /api/tags | GET |
| /api/tags/web-tree | GET |
| /api/traits | GET |
| /api/vn/[id]/aspect | GET, PATCH, DELETE |
| /api/vn/[id]/characters | GET |
| /api/vn/[id]/erogamescape | GET, POST, DELETE |
| /api/vn/[id]/link-vndb | POST |
| /api/vn/[id]/lists | GET |
| /api/vn/[id]/quotes | GET |
| /api/vn/[id]/releases | GET |
| /api/vn/[id] | GET |
| /api/vn/[id]/stock/aliases | GET, POST |
| /api/vn/[id]/stock/eroge-price | PATCH, POST, DELETE |
| /api/vn/[id]/stock | GET, POST, DELETE |
| /api/vn/[id]/stock/sources | GET, POST, DELETE |
| /api/vn/[id]/vndb-status | GET, PATCH, DELETE |
| /api/vndb/auth | GET |
| /api/vndb/cache | GET, DELETE |
| /api/vndb/pull-statuses | POST |
| /api/vndb/quote/random | GET |
| /api/vndb/stats | GET |
| /api/wishlist/[id] | POST, DELETE |
| /api/wishlist | GET |
<!-- API_ROUTE_INVENTORY_END -->

---

## Database schema

All managed via raw SQL in `lib/db.ts`. We never run a migration tool — the
`ensureColumn(db, table, column, ddl)` helper at startup `ALTER TABLE` if the
column is missing. **Always use `ensureColumn` for new fields** so existing
DBs upgrade transparently.

### Bootstrap table inventory

Generated from `CREATE TABLE IF NOT EXISTS` declarations in `lib/db.ts`.
The detailed notes below expand the most important tables; this inventory is
the exhaustive check against schema drift.

<!-- DB_TABLE_INVENTORY_START -->
| Table | Purpose |
| --- | --- |
| alicenet_stock | AliceNet mirrored inventory and match state |
| app_setting | Application key/value settings |
| app_setting_audit | Redacted sensitive-setting change history |
| character_image | Mirrored character image paths |
| character_vn_index | Character-to-VN cache index |
| collection | Per-VN tracking state |
| collection_place_index | Materialized collection physical-location index |
| egs_game | Resolved ErogameScape metadata |
| egs_vn_link | Manual EGS-to-VNDB mapping overrides |
| owned_release | Owned edition inventory |
| owned_release_aspect_override | Per-edition aspect-ratio overrides |
| place_provider_link | Physical place to provider-label mappings |
| place_registry | Structured physical shop registry |
| producer | VNDB producer metadata |
| reading_goal | Per-year reading target |
| reading_queue | Ordered play-next queue |
| release_meta_cache | Release-specific metadata for edition UI |
| release_resolution_cache | Release aspect-ratio cache |
| saved_filter | Saved library filter presets |
| series | User-managed series metadata |
| series_vn | Ordered VN memberships for series |
| shelf_display_slot | Face-out shelf placements |
| shelf_slot | Regular shelf-grid placements |
| shelf_unit | Shelf-grid definitions |
| staff_credit_index | Staff cache index for aggregate lookups |
| steam_link | VN-to-Steam app links |
| stock_batch_job | Durable bulk-stock refresh snapshots |
| user_activity | Global user-action audit trail |
| user_list | User-managed VN lists |
| user_list_vn | Ordered VN memberships for user lists |
| vn | Local VN metadata cache |
| vn_activity | Per-VN tracking activity |
| vn_aspect_override | VN-level aspect-ratio overrides |
| vn_developer_index | Materialized VN developer index |
| vn_egs_link | Manual VNDB-to-EGS mapping overrides |
| vn_game_log | Per-VN reading journal |
| vn_language_index | Materialized VN language index |
| vn_platform_index | Materialized VN platform index |
| vn_publisher_index | Materialized VN publisher index |
| vn_quote | VN quote cache |
| vn_route | Per-VN route tracking |
| vn_staff_credit | Materialized VN staff credits |
| vn_stock_alias | Per-VN stock search aliases |
| vn_stock_offer | Structured provider stock offers |
| vn_stock_provider_status | Per-provider stock refresh diagnostics |
| vn_stock_source | User-added exact stock source URLs |
| vn_tag_index | Materialized VN tag index |
| vn_title_resolve_cache | Stock title-to-VN resolution cache |
| vn_va_credit | Materialized voice-actor credits |
| vndb_cache | Shared outbound-response cache |
<!-- DB_TABLE_INVENTORY_END -->

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

character_image  PK char_id           — local mirror of VNDB character images
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
                  value                — key/value store. Commonly-used keys:
                  vndb_token, vndb_writeback, vndb_backup_url, vndb_backup_enabled,
                  vndb_fanout (auto-download staff/chars/devs toggle),
                  steam_api_key, steam_id, egs_username,
                  random_quote_source, default_sort, default_order, default_group,
                  home_section_layout_v1, vn_detail_section_layout_v1,
                  character_detail_section_layout_v1, staff_detail_section_layout_v1,
                  producer_detail_section_layout_v1, series_detail_section_layout_v1,
                  shelf_view_prefs_v1,
                  {provider}_proxy_config (JSON per provider: vndb, vndbmirror, egs, stock and per-shop stock overrides),
                  migration_* keys (one-shot migration idempotency guards)

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

alicenet_stock PK code (format "###-######-###")
                  title, jan, release_date, list_price, sale_price,
                  vn_id (FK-ish → vn, nullable), vn_match_source ('auto'|'manual'|'none'),
                  vn_candidates TEXT (JSON AliceNetCandidate[] top-3, for quick-pick remapping),
                  search_title TEXT (normalized query sent to VNDB/EGS; filled at match time),
                  last_matched_at INTEGER,
                  egs_id INTEGER, egs_match_source,
                  fetched_at, updated_at
                  — AliceNet second-hand stock mirror. Full-sync on every download:
                  items absent from the new snapshot are DELETED (sold). Route:
                  POST /api/alicenet/fetch from the /stock AliceNet controls.
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

---

## Per-provider proxy infrastructure (lib/proxy-config.ts + lib/proxy-fetch.ts)

Providers: `vndb` | `vndbmirror` | `egs` | `stock` plus per-shop stock overrides.

### Resolution order

Env vars take priority over DB settings for fixed providers. AliceNet is
stock-owned and uses only the stored Stock proxy setting configured in the
application.

| Env pattern | Meaning |
| --- | --- |
| `<PREFIX>_PROXY_ENABLED` | `true`/`1` → enable |
| `<PREFIX>_PROXY_PROTOCOL` | `http`/`https`/`socks5`/`socks5h` (default `socks5h`) |
| `<PREFIX>_PROXY_HOST` | hostname (RFC-1918 / loopback rejected) |
| `<PREFIX>_PROXY_PORT` | 1–65535 |
| `<PREFIX>_PROXY_USERNAME` / `_PASSWORD` | optional auth |

Prefixes: `VNDB`, `VNDBMIRROR`, `EGS`, `STOCK`.

`resolveProxyConfig(provider)` returns `ProxyConfig | null`. When null, all
calls fall back to native `fetch()` (no global proxy).

`providerFetch(url, init, providerId)` is the fixed-provider call site.
`stockProviderFetch(url, init, providerId)` is the stock-provider call site.
Both build a
`SocksProxyAgent` (socks5/h) or `HttpsProxyAgent` (http/https) from
`buildProxyUrl(config)` and passes it as `{ agent }` to `node-fetch`. Never
use raw `fetch()` for any URL that should be proxied.

### Security invariants (immutable — cannot be overridden by any input)

- `buildProxyUrl()` result is **never logged, never returned to client, never included in error messages**.
- `getProxyConfigForDisplay()` returns `{ enabled, protocol, host, port, username, hasPassword }` — raw password never echoed.
- Saving proxy settings preserves the stored password when the submitted value is `''` or `PROXY_PASSWORD_MASK = '••••••••'`.
- Proxy is NEVER applied globally to all outbound requests. Fixed providers call `providerFetch(...)`; stock providers, including AliceNet, call `stockProviderFetch(...)`.
- `add 'server-only'` to any file importing proxy-config.ts.

### DB storage

Stored per provider in `app_setting`:
- `egs_proxy_config` / `vndbmirror_proxy_config` / `stock_proxy_config` / per-shop stock override keys.

### UI

Settings → Integrations → `ProxySettingsSection` controls for EGS, VNDB, VNDB mirror, stock shops, and per-shop stock overrides. Fields: enabled toggle, protocol select, host, port, username, password (write-only input, existing value shown as `••••••••`). Test button fires `POST /api/proxy/test { provider }`.

---

## AliceNet stock mirror (src/lib/alicenet.ts)

`AliceNet` is the canonical label and identifier prefix for `/api/alicenet/*`
and `alicenet_*`. The SQLite bootstrap
migrates databases created before this rename forward on first open; keep
those migration inputs isolated to the migration block in `src/lib/db.ts`.

AliceNet is a shop mirrored from the Stock & prices surface. Its canonical UI
renders on `/stock` via `<AliceNetClient embedded basePath="/stock" />`; the
same client may also render on the linked AliceNet shop's place page
(`/places/[id]`) when the `AliceNet` provider branch is linked to that place.
AliceNet never auto-fetches; every stock, match, and download operation starts
from an explicit user action.
There is no AliceNet enable environment flag and the AliceNet browser is not
mounted on individual VN pages. AliceNet uses the stored Stock proxy setting
and has no `ALICENET_*` or `STOCK_*` environment prefix.

### Fetch

`fetchAliceNetHtml()` calls `stockProviderFetch(ALICENET_URL, …, 'alicenet')`.
The page is EUC-JP; the response buffer is decoded via `new TextDecoder('euc-jp')`.

### Parse

`parseAliceNetHtml(html)` uses three stateful regexes (row, cell, tag-strip).
Skips the header row and any row with a code that doesn't match `^\d{3}-\d{6}-\d{3}$`.
Returns `Pick<AliceNetStockRow, 'code'|'title'|'jan'|'release_date'|'list_price'|'sale_price'>[]`.

### Full sync

`upsertAliceNetStock(rows)` runs a single transaction that:
1. Reads all existing codes.
2. Upserts incoming rows (`INSERT … ON CONFLICT DO UPDATE`).
3. Deletes rows whose code is absent from the incoming set (sold items).
Returns `{ added, updated, removed }`.

### Title normalization

`normalizeTitle(rawTitle)` — strips used-goods markers, edition labels, platform
brackets, age-rating brackets, converts full-width ASCII → half-width,
collapses whitespace. The result is submitted as the VNDB/EGS query AND stored
as `search_title` for the UI's "Searched as: …" subtitle.

### Matching rate limits

- VNDB: handled by the shared `vndb-throttle.ts` queue (≤ 1 req/s).
- EGS: `MATCH_INTER_ITEM_DELAY_MS = 1500` ms inter-item sleep.
- AliceNet: manual-only trigger, never auto-fetched.
- Max batch size: 20 items per call (clamped in `matchNextAliceNetItems`).

### Candidate remap

Top-3 VNDB results are stored as `vn_candidates` JSON (`AliceNetCandidate[]` with
`{ id, title, alttitle, released }`). The first is auto-selected as `vn_id`.
`CandidateChips` in `AliceNetClient` renders them as clickable chips for remap
without re-searching. Manual link dialog pre-fills from `search_title`.

### `AliceNetCandidate` interface

```ts
export interface AliceNetCandidate {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}
```

---

## Generic stock provider capability contract

`StockProviderMeta` in `src/lib/stock-provider-capabilities.ts` is the source of truth for the
generic per-VN stock tiles. Keep these dimensions separate:

- `lookupCapabilities`: `aggregate_price`, `direct_link`, `jan_lookup`,
  `title_search`, or `cached_inventory`.
- `resultCapability`: `structured_prices`, `structured_offers`,
  `search_leads`, or `cached_offers`.
- `supportLevel`: `supported`, `limited`, or `manual_only`.
- `physicalStockMode`, `branchParserImplemented`, and
  `confirmedPhysicalUsable`: physical-store evidence only.

Do not infer parser support from `kind`, `physical`, or the existence of a
search URL. The VN stock provider tiles render this contract directly.
GAMECITY, AmiAmi, and Neowing intentionally remain `search_leads` with
`manual_only` support until their page shapes have structured parsers.

---

## Shop map privacy boundary

`MapPrivacyControl` is the required opt-in boundary for third-party map
requests. Consent is local-only under `vncoll.map.external-network.v1`.
`MapPageClient` does not mount `MapCanvas` until consent is enabled, and
`AddEditPlaceModal` disables Nominatim search until the same consent exists.
The explanatory notice can collapse independently under
`vncoll.map.privacy-notice-dismissed.v1`; collapsing it must never change
consent, and a compact labelled reopen control remains visible.

When enabled:
- `MapCanvas` loads CARTO tiles.
- Map and place-modal address search sends the entered query to Nominatim
  (OpenStreetMap).
- `geocodingAcceptLanguage(locale)` derives the Nominatim `Accept-Language`
  header from the current application locale.

Do not add a new map tile provider or geocoder without updating the UI privacy
copy and canonical docs. Never upload saved place rows as a bulk payload.

---

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
and focus restore work consistently. Custom dialog layouts render through
the body-level `<DialogPortal>` at the canonical modal layer so page-local
stacking contexts cannot cover or clip them. Surfaces:
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

- **EGS mirrors are not 100% standardised** — some columns may be
  missing on certain mirrors. Always `?? null` and verify with the raw
  row.
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

### Feature flags
- `VNCOLL_DISABLE_ACTIVITY=1` skips writes to the global `user_activity` audit table. The gate honours only the literal `'1'`; any other value (including `true`) is a no-op. Per-VN `vn_activity` (reading log) is unaffected.

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

### Adding a new API route

**File location**: `src/app/api/<resource>/route.ts` or `src/app/api/<resource>/[id]/route.ts`.

Every route exports named handler functions (`GET`, `POST`, `PATCH`, `DELETE`) and declares:

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
```

**Required boilerplate for every mutating handler (POST / PATCH / DELETE / PUT)**:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { upstreamError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = (await readJsonObject(req)) as { name?: string };
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  try {
    const result = doDbWork(id, body.name.trim());
    return NextResponse.json(result);
  } catch (e) {
    return upstreamError('resource/[id]', e);
  }
}
```

Rules:
- **Auth gate first** — `requireLocalhostOrToken` fires before any DB or network work.
  The 403 path is pure HTTP metadata; tests need no mocking.
- **Validate inputs before use** — read with `readJsonObject(req)`, check every field
  before touching the DB. Return `400` with `{ error: '…' }` on bad input.
- **Response shape** — always `NextResponse.json({ … }, { status: N })`. Errors use
  `{ error: 'message' }` with an appropriate 4xx/5xx. Never return raw strings.
- **Upstream errors** — wrap calls to VNDB / EGS in `upstreamError('route-name', e)`;
  it formats a 502 with the upstream message so the client gets actionable feedback.
- **Test the gate** — add a 403 test in `tests/auth-gate-routes.test.ts` alongside the
  other mutation tests.

### Adding a database migration

All schema work lives in `initDb()` / `open()` in `src/lib/db.ts`.

#### Rule 1 — Append-only (new columns only)

```ts
ensureColumn(db, 'collection', 'my_new_field', 'TEXT');
```

Never `DROP TABLE`, `ALTER TABLE … DROP COLUMN`, or truncate data.
`ensureColumn` is idempotent — it `ALTER TABLE … ADD COLUMN` only if the column is absent,
so existing installs upgrade in place without wiping data.

#### Rule 2 — One-shot migrations (marker pattern)

For data backfills or index rebuilds that must run exactly once:

```ts
const migrationDone = db
  .prepare(`SELECT value FROM app_setting WHERE key = 'my_migration_v1'`)
  .get() as { value: string } | undefined;

if (!migrationDone) {
  db.transaction(() => {
    db.prepare('UPDATE collection SET my_new_field = ? WHERE my_new_field IS NULL')
      .run('default');
    db.prepare(
      `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('my_migration_v1', '1')`,
    ).run();
  })();
}
```

The marker key prevents the block from re-running on every cold start. Use the `_v1`
suffix so a future incompatible version can use `_v2`.

#### Rule 3 — Transaction wrapping

Any operation that writes to more than one row or table must be wrapped:

```ts
db.transaction(() => {
  db.prepare('INSERT INTO …').run(…);
  db.prepare('UPDATE … WHERE …').run(…);
})();
```

A crash mid-operation leaves no partial state. The IIF pattern `db.transaction(fn)()`
is preferred over storing the result of `db.transaction` and calling it separately.

#### Rule 4 — Index maintenance

After adding a column that will be filtered or joined on, add a `CREATE INDEX IF NOT EXISTS`
call inside `initDb()` alongside the `ensureColumn`:

```ts
ensureColumn(db, 'vn', 'my_tag', 'TEXT');
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_vn_my_tag ON vn(my_tag)
    WHERE my_tag IS NOT NULL;
`);
```

Partial indexes (`WHERE … IS NOT NULL`) keep the index lean when most rows will have `NULL`.

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
  `egs:anticipated:%`, `egs:top-ranked:%`, `% /stats|%`,
  `% /schema|%`, `% /authinfo|%`, `% /release|%`,
  `% /release:upcoming|%`, `% /release:upcoming-all|%`,
  `% /producer|%`, `% /tag|%`, `% /trait|%`,
  `% /vn:top-ranked:%`. Without this step the freshness chip
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

### Spoiler / Content controls — shared `<SpoilerReveal>` pattern
- `<SpoilerReveal level={0|1|2} perSectionOverride?={0|1|2|null}>` is
  the single shared gate for any node that may carry spoilers (tag
  chips, character traits, synopsis BBCode `[spoiler]…[/spoiler]`,
  VNDB metadata with a `spoiler` field). Wraps a child and decides
  visibility from the truth table in `lib/spoiler-reveal.ts`:
    1. **Default** — hidden when `nodeLevel > globalSpoilerLevel`.
    2. **Pointer hover / keyboard focus** — transient reveal (blur
       lifts; re-blurs on leave/blur).
    3. **Touch / pen tap** — toggles persistent reveal for that node
       (pointerType === 'touch' | 'pen'). Mouse clicks bypass so the
       hover UX is preserved.
    4. **Enter / Space on focus** — keyboard parity with the tap
       toggle.
    5. **`perSectionOverride`** raises (never lowers) the effective
       level. Per-section toggles ("Spoil me" on `VnTagChips`) and
       the URL `?spoil=1|2` deep link both go through this lever.
- Truth table is pinned by `tests/spoiler-reveal.test.ts`.
- The synopsis renderer (`<VndbMarkup>` `[spoiler]…[/spoiler]`)
  now wraps spoiler blocks in `<SpoilerReveal level={2}>` so the
  rules apply consistently across server- and client-rendered
  surfaces.
- i18n keys live under `t.spoiler.*` —
  `{hidden, reveal, hideHint, revealHint, spoilMe, hideAll,
  showMinor, showAll, ariaHidden, ariaShown}` in all three locales.

### Cover / banner mutation events
- `src/lib/cover-banner-events.ts` exports
  `VN_COVER_CHANGED_EVENT` (`'vn:cover-changed'`) and
  `VN_BANNER_CHANGED_EVENT` (`'vn:banner-changed'`) along with
  typed `dispatchCoverChanged` / `dispatchBannerChanged` helpers.
- Producers (any surface that mutates the cover or banner —
  `MediaGallery` kebab "Set as cover/banner", `CoverSourcePicker`,
  `BannerSourcePicker`, the rotation buttons on `HeroBanner` and
  `CoverHero`) MUST:
  1. Optimistically update their own local state.
  2. POST/PATCH the server.
  3. On success dispatch the typed event so siblings repaint.
  4. Run `router.refresh()` as a defensive fallback so server-
     rendered surfaces (Library cards) also re-derive.
  5. Revert local state on error and surface a toast.
- Consumers (`HeroBanner`, `CoverHero`, anything else that renders
  the active cover/banner) subscribe via `useEffect` with a
  vn-id scoped guard so cross-VN events are ignored.

### VN route journal paging
- `<RoutesSection>` keeps the complete ordered route array in memory so
  move-up and move-down operations preserve global ordering.
- The rendered editor window is capped at 40 routes per page. Page controls
  use localized labels and clamp after deletion so long journals do not mount
  an unbounded number of interactive rows.

### Cover / banner rotation
- `vn.cover_rotation`, `vn.banner_rotation`, `owned_release.cover_rotation`
  store rotation in degrees (0/90/180/270). `normalizeRotation`
  coerces anything else to 0 so a corrupted column never produces
  a tilted transform.
- `PATCH /api/collection/[id]/cover` `{ rotation }` and
  `PATCH /api/collection/[id]/banner` `{ rotation }` are the
  write endpoints. The banner PATCH still accepts `position`; both
  can coexist in a single body.
- Rendering: `<SafeImage rotation={…}>` applies
  `transform: rotate(<deg>) scale(<container.w / container.h>)`
  with a ResizeObserver-measured container so 90/270 rotations
  fill the box. `buildRotationStyle()` is exported for unit tests.
- `HeroBanner` carries inline rotate-left / rotate-right buttons in
  the same hover-revealed desktop action group as the existing focal-point
  adjust button. Compact viewports show one 44 px edit entry at rest and expose
  the heavier controls only after edit mode opens.
- `CoverHero` exposes one compact edit trigger on the VN cover image. The cover
  source picker owns rotate-left / rotate-right / reset on compact viewports;
  the poster overlay remains available as a desktop quick action only.
- i18n keys live under `t.coverActions.{rotate, rotateLeft,
  rotateRight, resetRotation, rotationLabel}`.

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
- Candidate URLs from persisted or upstream EGS data pass through the
  trusted image-host allowlist before the browser sees them or the resolver
  writes them to its seven-day cache. Legacy unsafe cache rows are ignored.
- A secondary trigger lives directly on the cover image as
  `CoverEditOverlay` (pinned top-right, always tap-target, hover-
  revealed on desktop). It dispatches a `vn:open-cover-picker`
  CustomEvent with the VN id; the modal listens for it and opens.
  Single modal instance, multiple triggers.
- `BannerSourcePicker` mirrors the same pattern (Custom default tab).
- When adding a new source, extend the tabbed UI; don't introduce a
  separate component.

### MediaGallery kebab convention
- The per-tile kebab dropdown in `<MediaGallery>` has a locked sizing
  contract: `min-width: 12rem`, `max-width: 18rem`. Constants live in
  `src/components/media-menu-helpers.ts` so the contract is shared
  between the renderer and the Vitest cover.
- Every row uses `whitespace-nowrap`, `overflow-hidden`, and
  `text-overflow: ellipsis` so a localised label never wraps a row
  to two lines or blows out the menu width.
- Labels render in a **short** variant (`t.media.openLightboxShort`,
  `t.media.setAsCoverShort`, `t.media.setAsBannerShort`,
  `t.media.openOriginalShort` — e.g. "Open" / "Ouvrir" / "開く"). The
  long form rides on `aria-label` and `title` so screen readers and
  hover tooltips still report the full intent.
- Horizontal flip is rem-based, not menu-width-based: when the
  trigger sits within `MEDIA_MENU_FLIP_REM` (12rem) of the right
  viewport edge, the dropdown opens to the left. The pure helper
  `decideMediaMenuHorizontal(triggerRight, viewportWidth, remToPx?)`
  is unit-tested in `tests/media-menu.test.ts`.
- Keyboard contract: Arrow keys (Down/Up/Home/End) drive a roving
  focus across `[role="menuitem"]` / `[role="menuitemcheckbox"]`
  rows; Enter / Space activates the focused item via native button
  click; Escape closes and restores focus to the kebab trigger.
- Mobile: the kebab is always visible (`opacity-100`) on viewports
  below `md`, with a 32×32 minimum hit target.
- The image remains the primary click target — never cover the
  thumbnail with the kebab or a gradient button. Manual QA flagged
  the old gradient-button overlay as the worst offender for
  obscuring the actual screenshot.

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
  4. `vn-page` — home and detail-page section layout, visibility,
     collapse defaults, and reset actions
  5. `account` — VNDB token (audited) + writeback toggle +
     status pull + backup URL
  6. `integrations` — Steam API key + SteamID + EGS username +
     random-quote source toggle
  7. `automation` — fan-out toggle only
  8. `shortcuts` — keyboard shortcut reference

Each tab renders into a single panel block with tablist, tab, and
tabpanel semantics. Don't
add a second `{activeTab === '<id>' && (...)}` block for the same
tab; the H6 audit found that pattern split panels in unexpected
ways.

External callouts can deep-link directly to a specific tab by
dispatching `vn:open-settings { tab: 'integrations' }` via
`window.dispatchEvent(new CustomEvent(...))`. The Settings modal
listens for the event, validates the tab id against
`SETTINGS_TABS`, and pre-selects it on open. Used by `/data`'s
"Manage in Settings → Integrations" callout links.

### Quote avatar fallback chain

`src/lib/quote-avatar.ts` resolves the avatar src for every quote
surface with a three-tier fallback chain:

  1. Character portrait (1:1, via `character_image.local_path` JOIN).
  2. VN cover (2:3, via `vn.local_image_thumb` / `vn.local_image` /
     remote `image_url`).
  3. `null` — consumer renders a `<UserCircle>` lucide icon.

`<QuoteAvatar>` renders a `size × size` square when a character
portrait is available, and a taller `size × size*1.5` frame when
falling back to the VN cover so the 2:3 ratio is preserved. The SQL
queries (`listAllQuotes`, `getRandomLocalQuote`) plumb the VN cover
columns so consumers don't need a follow-up fetch; both
`/api/vn/[id]/quotes` and `/api/vndb/quote/random` enrich the nested
`vn` object on the response too.

### Series detail layout (`series_detail_section_layout_v1`)

`/series/[id]` mirrors the VN-detail layout pattern. Sections are
`hero` / `works` / `metadata` / `related` / `stats`, each wrapped in
a layout slot the user can drag-reorder, hide, or collapse. The
parser (`src/lib/series-detail-layout.ts`) follows the same shape as
`vn-detail-layout.ts` — drop-unknown / append-missing / dedupe — and
tolerates a v0 flat shape too. Persistence is via
`PATCH /api/settings` with key `series_detail_section_layout_v1`; the
route MERGES partial patches so the per-section menu and the drag-
reorder handler never clobber each other. Custom event:
`SERIES_DETAIL_LAYOUT_EVENT`.

### Shelf read-only display options (`shelf_view_prefs_v1`)

Separate concern from physical placement data. `shelf_slot` and
`shelf_display_slot` are NEVER touched by the display knobs.

`<ShelfReadOnlyControls>` renders a discreet slider trigger that
opens a popover with four controls: cell size (60-280 px), cover
scale (0.5-1.5), gap (0-24 px), fit mode (contain / cover). Values
apply via CSS variables (`--shelf-cell-px`, `--shelf-cover-scale`,
`--shelf-gap-px`) on a `.shelf-view-root` wrapper so cells reactively
resize without a re-render. Persistence is via `PATCH /api/settings`
with key `shelf_view_prefs_v1`. The validator clamps every numeric to
its documented range so a malicious PATCH can't store
`cellSizePx: 99999` and break the grid. Reset goes through PATCH
null → next GET reads the default.

### Schema page — EGS section

`/schema` renders both VNDB and EGS sections. The EGS section
(`<SchemaEgsSection>` + `lib/schema-egs.ts`) lists `egs_game`,
`vndb_cache` rows scoped to `cache_key LIKE 'egs:%'`, `vn_egs_link`,
`egs_vn_link`, plus a presence flag for `app_setting.egs_username`
(never the value). A "Stale-while-error" badge appears when any EGS
cache row carries the `staleWhileError` JSON flag.

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

### Card density — scoped per page

- Density is **per-scope**. `DENSITY_SCOPES` (in
  `src/lib/settings/client.tsx`) enumerates every surface that
  mounts a slider. Full list: `library`, `wishlist`, `search`,
  `recommendations`, `topRanked`, `upcoming`, `dumped`, `egs`,
  `staffWorks`, `producerWorks`, `characterWorks`, `seriesWorks`,
  `lists`, `vnSimilar`, `vnMedia`, `shelf`, `tagPage`.
  Persisted values live in `DisplaySettings.density: Record<DensityScope, number>`.
- Resolve order via `resolveCardDensity(scope, settings, urlOverride)`:
    1. URL override (`?density=N`, snapped to clamp range).
    2. Persisted per-scope value (`density[scope]`).
    3. Legacy global fallback (`cardDensityPx`).
  `cardDensityPx` is kept as the global default. On first read,
  a persisted payload with `cardDensityPx ≠ default` but no
  `density.library` entry promotes the legacy value into
  `density.library` so existing sessions don't visually jump.
- Settings → Display exposes **two** sections: a global
  "Default density" slider (writes `cardDensityPx`) and a
  "Per-page overrides" list with a Reset button per scope. A
  bulk "Reset all per-page" button clears every scope override
  at once; "Reset everything" also resets the global.
- Clamp range is `[120, 480]` via `clampCardDensity()`. Range
  widened from the original `[140, 320]` so the operator can
  genuinely get ~2 cards per row at the high end.
- Resolved value flows into a CSS variable `--card-density-px`
  on the surface root. `<CardDensitySlider scope="…">` is the
  canonical UI surface; mount one per page in the toolbar
  header. The slider writes `density[scope]` directly so the
  global default is never overwritten by a per-page tweak.
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
Desktop NavGroup menus portal to `document.body`, clamp horizontally, and flip
above the trigger when the natural menu height does not fit below. Internal
scrolling is reserved for menus taller than the usable viewport.

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
  - `/similar?vn=v90017` — same
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
  - Settings modal: eight top-level tabs (Display / Content /
    Library / Layout (vn-page) / Account / Integrations /
    Automation / Shortcuts). Home is not a top-level tab; it is the
    default inner sub-tab of the Layout tab (alongside VN, Character,
    Staff, Producer, Series). Includes the deep-link from /data's
    "Manage in Settings -> Integrations" button.
  - `/stock`: generic per-VN shop lookup plus AliceNet mirrored stock
    controls, all eight AliceNet filter tabs (All, Matched, VNDB, EGS only,
    Unmatched, No VNDB result, In collection, In wishlist), Download Stock,
    Find VNDB & EGS Matches, Reset, candidate chips, manual link dialog.
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

### Scroll containers — overflow patterns

Two patterns exist for horizontally-scrollable rows. Choose based on whether content
**always** overflows (table/editor) or **may or may not** overflow (timeline/strip):

| Surface type | Pattern |
|---|---|
| Always-overflow (producers table, compare grid, shelf editor) | CSS class `.scroll-fade-right` on the container — permanent right-edge fade |
| Variable-length (VaTimeline, ActivityHeatmap, RecentlyViewedStrip) | `<ScrollFadeRight>` component (`src/components/ScrollFadeRight.tsx`) — fade only when clipped |

`ScrollFadeRight` is a `'use client'` component. Pass `className` for non-overflow CSS
(e.g. `className="flex gap-1 pb-1"`). It supplies `relative` and `overflow-x-auto`
on its root div automatically.

Example usage in a server component:
```tsx
import { ScrollFadeRight } from '@/components/ScrollFadeRight';

// In JSX:
<ScrollFadeRight className="flex items-end gap-1 pb-1" role="img" aria-label="Timeline">
  {/* server-rendered children */}
</ScrollFadeRight>
```

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

### VNDB BBCode link normalization
- `src/lib/vndb-link-normalize.ts` exports `normalizeVndbHref(href)`.
  Called from `<VndbMarkup>` for every `[url=…]` and autolink target
  so VNDB-shaped references (`https://vndb.org/cNNN`, bare `cNNN`,
  relative `/cNNN`) rewrite to the canonical internal route
  (`/character/cNNN`, `/vn/vNNN`, `/release/rNNN`, `/producer/pNNN`,
  `/tag/gNNN`, `/trait/iNNN`, `/staff/sNNN`).
- Unknown id prefixes (`d`/doc, `u`/user, `t`/thread, `w`/review)
  keep their external URL; the helper only rewrites prefixes with a
  matching App Router route.
- Normalisation runs at RENDER time, not during ingest. The cache
  layer (`vndb-cache.ts`) stores raw VNDB payloads exactly as
  received so any future route-table change applies retroactively
  to every cached description without a cache rebuild.
- Test: `tests/vndb-link-normalize.test.ts`.

### Platform label mapping
- `src/lib/platform-display.ts` exports `platformLabel(code, dict)`
  which maps VNDB platform codes (`win`, `mac`, `lin`, `ios`, `and`,
  `web`, `swi`, `ps3`, …) to localised display labels. Duplicate
  keys collapse; unknown codes fall back to the raw uppercase form
  so a freshly-added VNDB code never silently breaks the page.
- Every card chip, search-filter chip, and release row uses this
  helper instead of rendering the raw code. Adding a new platform =
  add the code to the `PLATFORM_LABELS` map under all three locales.
- Tests: `tests/platform-display.test.ts`, `tests/platform-label.test.ts`.

### PortalPopover
- `src/components/PortalPopover.tsx` is the canonical primitive for
  any popover that needs to escape the parent's clipping or stacking
  context. Portals into `document.body`, measures the trigger, picks
  a placement, flips on viewport-collision, and re-measures on scroll
  / resize.
- Consumers: the shelf unplaced-pool info popover (escapes the
  card's `overflow: hidden`), the `<ListsPickerButton>` overlay on
  every `<VnCard>` (escapes the card's `z-index`), the saved-filter
  chip ⋮ menus on `/`.
- Anything that needs a card-anchored panel MUST use this primitive
  — mounting a panel inside the card breaks on viewport collision
  near the edges and on `overflow: hidden` ancestors. Test:
  `tests/portal-popover.test.ts`.

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

### Reset a disposable QA copy
```bash
mkdir -p .qa/data .qa/storage
cp data/collection.db .qa/data/collection.db
DB_PATH="$PWD/.qa/data/collection.db" STORAGE_ROOT="$PWD/.qa/storage" yarn dev
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
| `vn_stock_offer` / `vn_stock_provider_status` | Generic stock lookup | Per-VN shop snapshots from VNDB release extlinks, JAN/GTIN title search, EGS price pages, and known official retailer links. Providers include Sofmap, Suruga-ya, Eroge Price, Unoya, Melonbooks, Mandarake, WonderGOO, Trader, Animate, ebten, Getchu, Gamers, GAMECITY, Asakusa Mach, Amazon JP, AmiAmi, Otakarasouko, GEO, Joshin, Neowing, Yodobashi, and Bikkuri Takarajima. |
| `alicenet_stock` | AliceNet stock mirror | Second-hand shop inventory with full-sync delete, VNDB/EGS match columns, candidate remap JSON, search_title. |

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

## Single-user threat model

The app is single-user / self-hosted on `localhost:3000`. Mutating
routes (`POST` / `PATCH` / `DELETE`) gate via `requireLocalhostOrToken`,
which accepts loopback connections or a session token. **Read-only
collection GET routes deliberately stay un-gated** — they return
metadata the operator already owns, and the loopback gate would just
add ceremony.

Consequences:
- `GET /api/collection/[id]/*` returns `404` for a VN not in the
  collection and `200` for one that is. The HTTP status difference is
  intentional — collection presence is not a secret from the operator.
- Every such handler carries an explicit
  `// intentionally public — single-user self-hosted app …` comment so
  the next reader doesn't add `requireLocalhostOrToken` and break the
  library page.
- If you publish the app multi-user, every "intentionally public" GET
  needs review.

---

## Shared hooks

### `useDebouncedCallback(fn, delayMs)` — `src/lib/hooks.ts`

Replaces the inline `setTimeout(...)` + `debounceRef` boilerplate that
previously lived in 7 picker components (CompareVnPicker, LinkToVndbButton,
MapEgsToVndbButton, MapVnToEgsButton, TagPicker, SimilarSeedPicker,
VnSeedPicker). The hook:

- Returns a stable callback identity across renders (safe to drop in JSX).
- Keeps the latest `fn` reference via `useRef` so the timer never fires
  a stale closure.
- Clears the pending timer on unmount.

Usage:

```tsx
const debounced = useDebouncedCallback((q: string) => fetchHits(q), 250);
<input onChange={(e) => debounced(e.target.value)} />
```

When migrating an existing picker, drop the `debounceRef` + the cleanup
`useEffect` + the inline `setTimeout`, and let the hook own the lifecycle.

---

## Test fixture convention — no real IDs

Real VN / staff / tag / character / producer IDs from VNDB must NOT
appear in test files, fixture strings, or comments. The reasons:

- Avoids accidental copyright / licensing entanglement.
- Avoids tests breaking when VNDB renumbers or removes entries.
- Keeps grep-able placeholders consistent across the suite.

Use the synthetic placeholders below in tests, fixtures, and docs:

| Entity | Placeholder | Example |
|---|---|---|
| VN | `v90000`–`v99999` | `v90017`, `v95001` |
| Staff | `s90000`–`s99999` | `s95001` |
| Tag | `g90000`–`g99999` | `g95001` |
| Character | `c90000`–`c99999` | `c95001` |
| Producer | `p90000`–`p99999` | `p95001` |
| Release | `r90000`–`r99999` | `r95001` |
| EGS synthetic | `egs_<7-digit>` | `egs_9500001` |

Pick the lowest digit slot that doesn't clash with another test in the
same file. The high range (90000+) deliberately stays outside the live
VNDB id space so a typo can't accidentally hit a real record.

---

## Code hygiene (non-negotiable)

### Comments — zero by default

Default: write **no comments at all**. The only acceptable form is a single-line JSDoc
(`/** … */`) on an exported function or type when the WHY is genuinely non-obvious — a
hidden upstream constraint, a subtle invariant, a specific bug workaround. If removing
the comment wouldn't confuse a future reader, don't write it.

Never write:
- `// This function handles…` / `// We need to…` / `// Important:` — narrate nothing
- Multi-line `/** */` docblocks on test functions or internal helpers
- `/* non-fatal */` / `/* swallow */` / `/* skip */` / `/* intentionally empty */` or
  any variant inside a catch block
- `// TODO` / `// FIXME` stubs — implement it or omit it entirely
- Any reference to audit codes, ticket numbers, or external tracking ids

**Empty catch blocks** use `} catch {}` — no body, no comment, ever.

One structural exception: routes that are intentionally un-gated carry an
`// intentionally public — single-user self-hosted app …` single-liner so future
readers don't add an unnecessary gate. That specific form is sanctioned.

### AI slop — zero tolerance

- **Commit messages**: imperative subject line (≤ 72 chars), optional 1–2 lines of WHY.
  No bullet lists. No "Added:", "Implemented:", "Note:", no trailing `Co-Authored-By:`.
- **No real names**: never reference real VN titles, character names, studio names,
  or any other copyrighted material anywhere — source, comments, tests, commits, docs.
  Use synthetic placeholders (`v9xxxx`, "heroine A", "Studio X", `c9xxxx`).
- **No verbose narratives** in any text the repo carries. Keep everything terse.

### Error handling in loops

When retrying with multiple candidates, put `try/catch` **inside** the loop body, not
wrapping the whole loop. A single outer catch kills every remaining iteration on the
first failure.

```ts
for (const candidate of candidates) {
  try {
    const result = await fetch(candidate);
    if (result) { best = result; break; }
  } catch {}           // this candidate failed — try the next one
}
```

### Testing

- `yarn test` after **every** code change. All 2406 tests must pass before commit.
- Run test commands verbatim — never filter or redirect output (`| tail`, `| grep`,
  `> /tmp/out`). The user has flagged this repeatedly.
- Never use `/* istanbul ignore next */` or any coverage-disable directive. Reshape code
  or add genuine tests to achieve coverage.
- Tests must not leak timers or open handles. Use `vi.useFakeTimers()` for any code
  that schedules `setTimeout`.
- Do NOT refactor working production components just to make them easier to test.
  Write tests against the existing public surface or use Playwright.

### Feature completeness

A feature is not done until all surfaces that would logically show it have it: detail
page, library sort, card chip, filter param, DB sortMap. Never ship half a feature.

- Every async section renders a **skeleton** while loading. Empty-state copy appears
  only after the fetch resolves with zero results — never flash "No results" before data
  arrives.
- Every feature must work on mobile/tablet at full fidelity. Never use `hidden sm:inline`
  to strip a label or control. Wrap, scroll, or stack — never remove functionality.

### Scope discipline

Fix the stated bug. Do not refactor surrounding code. Do not add error handling for
states that cannot happen. Do not introduce abstractions beyond what the immediate task
requires. Three similar lines are better than a premature abstraction.

---

## When in doubt
- Run `yarn build`.
- Read the relevant i18n key — if it's missing in EN/JA, add it.
- Check that you used `<SafeImage>` for any new image.
- Check that filters / sort / new state lives in the URL, not in `useState`.
- Don't introduce a new dependency unless absolutely necessary; we've kept
  it deliberately tiny.
