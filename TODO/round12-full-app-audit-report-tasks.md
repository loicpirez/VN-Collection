# Round 12 full application audit - 2026-08-25

This is a new source, runtime, database, and production-browser audit of the
whole application. It is not a stock-only review. The inspected scope includes
all 40 pages and loading boundaries, 123 API routes, shared navigation and
settings, detail/edit workflows, personal VNDB synchronization, collection
filters, shelves, images, downloads, stock/providers, shops, maps, backup and
restore, PostgreSQL repositories, i18n, accessibility, responsive behavior,
security, performance, typing, tests, documentation, and deployment operations.

The final live matrix visited 39 real-data routes in mobile and desktop WebKit
plus mobile and desktop Chromium, for 156 route renders. Every route returned
HTTP 200 with no fatal page text, visible broken image, duplicate DOM id, or
document-level horizontal overflow. Three reported small
nodes are reviewed exceptions: one inline producer link in prose and two
20-pixel checkbox glyphs enclosed by 44-pixel labels. Production database and
journal inspection found issues that source-only mocks did not: the PostgreSQL
cache-statistics query fails on an ordered alias, AliceNet's server-side source
request receives HTTP 503, and the data-management UI still describes native
backup behavior as SQLite-only.

The report is intentionally live. A row remains `TODO` until the fix and its
focused evidence are committed and deployed. `DONE_WITH_DIFF` records a Round
12 implementation. `VERIFIED_EXISTING` means source plus runtime/test evidence
already satisfy the desired contract. Exact all-project coverage and final
production/provider checks are never inferred from focused tests.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R12-DATA-001 | CRITICAL | PostgreSQL cache statistics grouped by a derived `path` alias and then collated that alias in `ORDER BY`; PostgreSQL resolved the collated expression as a missing input column. The query now orders a typed subquery, with both SQL-shape coverage and a real isolated-schema PostgreSQL assertion over grouped fresh/stale rows. | `src/lib/db/repositories/cache.ts`, PostgreSQL integration suite, `/api/vndb/cache`, `/schema` | DONE_WITH_DIFF |
| R12-UIUX-001 | HIGH | Data management now exposes the active backend, uses provider-neutral backup copy, limits the picker to JSON plus that backend's native format, and rejects incompatible native files before confirmation or upload. PostgreSQL advertises only `.vncbackup`; SQLite advertises `.db`, `.sqlite`, and `.sqlite3`. | `src/app/data/page.tsx`, `src/components/ImportPanel.tsx`, `src/components/DropImport.tsx`, i18n dictionaries | DONE_WITH_DIFF |
| R12-ACCESS-001 | HIGH | Every root and route-specific error boundary now exposes one `role="alert"`; the render matrix imports all 32 boundaries and asserts the alert, recovery action, optional digest, and logging behavior. Route crashes no longer rely on visual styling to be announced. | `src/app/**/error.tsx`, accessibility tests | DONE_WITH_DIFF |
| R12-SEC-001 | CRITICAL | Forwarded requests are no longer eligible for the direct-loopback shortcut unless they exactly match Next.js's complete loopback-only synthesized metadata. Public, mixed-chain, malformed, HTTPS, standard `Forwarded`, and client-proof variants require an enabled constant-time proxy proof. Production Nginx overwrites that proof after Basic Auth from a root-only snippet. | `src/lib/auth-gate.ts`, `src/lib/trusted-proxy.ts`, Nginx and production environment | DONE_WITH_DIFF |
| R12-SEC-002 | HIGH | Origin fallback now derives forwarded host and protocol only after the same proxy proof succeeds. Tests cover spoofed/missing/wrong proofs, public clients, an internal loopback application URL, same-origin public Origin, malformed forwarding, direct loopback, and cross-origin denial. | `src/lib/csrf.ts`, proxy/auth tests | DONE_WITH_DIFF |
| R12-FUNC-001 | HIGH | AliceNet 429 and 5xx failures now receive stable diagnostic codes, localized actionable messages, and phase identifiers. The AliceNet shop progress panel and global download popover render up to three detailed failures with a bounded remainder count instead of exposing only `Error` or a raw server message. | `src/lib/alicenet-api-error.ts`, `src/app/api/alicenet/run/route.ts`, `src/components/AliceNetClient.tsx`, `src/components/DownloadStatusBar.tsx` | DONE_WITH_DIFF |
| R12-FUNC-002 | HIGH | Every AliceNet phase now publishes localized current work, records phase failure explicitly, preserves partial counts, and finalizes without forcing progress to 100 percent when any phase fails. A failed zero-item job stops animating, uses failure styling, remains dismissible, and leaves `alicenet_last_fetch` at the previous successful snapshot. | AliceNet run route, download-status contract, AliceNet client | DONE_WITH_DIFF |
| R12-DATA-002 | HIGH | Shop freshness describes the latest linked branch-stock snapshot, not a generic global provider run or place metadata. Production Sofmap branches resolve to their 24 August offers; a new successful AliceNet source run processed all 1,412 rows and advanced its success timestamp on 25 August. Failed runs remain covered as non-updating. | place repository, production `vn_stock_offer` and `alicenet_stock`, place cards | VERIFIED_EXISTING |
| R12-FUNC-003 | CRITICAL | AliceNet catalogue controls belong only to the linked AliceNet shop detail, generic discovery belongs to `/stock`, and per-title availability belongs to the VN page. Source and production route inspection confirm no AliceNet operation controls leaked into `/stock`, `/places`, global navigation, or unrelated VN actions. | `src/components/PlaceDetailClient.tsx`, `src/components/AliceNetClient.tsx`, `src/components/StockLookupClient.tsx`, `src/components/StockPanel.tsx` | VERIFIED_EXISTING |
| R12-FUNC-004 | HIGH | Each VN detail must retain its provider stock/price section and manual source/alias tools. The current `/vn/[id]` composition and API inventory include the stock panel plus source, alias, and Eroge Price routes; the Round 12 browser pass confirms the detail route renders without a fatal boundary. | VN detail layout, `src/app/api/vn/[id]/stock/**` | VERIFIED_EXISTING |
| R12-FUNC-005 | HIGH | Local and VNDB personal values must not overwrite silently. The fresh per-VN resolver covers status, numeric rating, dates, and personal notes; global status sync is preview/select/apply with full-snapshot and compare-and-set protection. The detailed source-of-truth matrix lives in the dedicated VNDB report. | `TODO/round11-vndb-integration-report-tasks.md`, VNDB sync modules | DONE_WITH_DIFF |
| R12-FUNC-006 | HIGH | Library filtering, grouped sorting, multi-filter combinations, tag access, pagination, virtualized dense grids, and saved filters remain wired through bounded server query contracts. The structural pagination/virtualization suite passes and the production library route renders with real data. | `src/components/LibraryClient.tsx`, collection-list repositories, pagination tests | VERIFIED_EXISTING |
| R12-FUNC-007 | HIGH | Shelf rendering must prioritize owned-release artwork, keep edit/info controls clickable, support physical bundles, and clip divider/fade visuals at the physical shelf viewport. Existing source and regression contracts preserve those behaviors; browser revalidation remains part of the final interaction gate. | shelf components and repositories | VERIFIED_EXISTING |
| R12-FUNC-008 | HIGH | Map privacy dismissal, modal layering, place editing, branch assignment, and map navigation remain present. The mobile production pass found no map overflow or layer-induced fatal state; full click/z-index interaction coverage remains in the final gate. | map/place components and tests | VERIFIED_EXISTING |
| R12-UIUX-002 | HIGH | All 40 route-level loading boundaries use animated shape-preserving skeletons, shared image components reserve dimensions and stop shimmering after decode, and the VN lightbox reserves its media frame. The 369-test cross-cutting pass found no loading/image contract regression. | route loading files, shared image/media components | VERIFIED_EXISTING |
| R12-UIUX-003 | MEDIUM | All 32 route boundaries now use one shared recovery presentation while retaining their route-specific console label and return destination. Home destinations use the Home icon and localized Home label; parent-list destinations use Arrow Left and a localized Back label. The full boundary matrix verifies alert semantics, digest presence/absence, reset, exact log prefix, and exact link target. | `src/components/RouteErrorView.tsx`, `src/app/**/error.tsx`, boundary render matrix | DONE_WITH_DIFF |
| R12-RESP-001 | HIGH | A 39-route real-data WebKit audit at 390 by 844 found no body/document horizontal overflow. Menus, settings, map, shelf, stock, large detail pages, grids, and tables remain bounded; repeat desktop WebKit and Chromium plus the interaction suite after fixes. | production application and browser audit | DONE |
| R12-RESP-002 | MEDIUM | The only automated sub-44 reports are an inline producer link and checkbox glyphs whose enclosing labels provide the actual touch area. Keep the scanner distinction and do not inflate inline prose into button styling. | upcoming, characters, staff | VERIFIED_EXISTING |
| R12-ACCESS-002 | HIGH | Dialogs, popovers, settings tabs, menus, skip navigation, media overlays, and map layering pass the 369-test accessibility/security/responsive structural set. Final browser keyboard and focus-containment checks remain required after Round 12 changes. | shared overlays/navigation and accessibility tests | VERIFIED_EXISTING |
| R12-I18N-001 | HIGH | French, English, and Japanese dictionary keys/placeholders are in parity, platform labels and shared date/time formatting remain localized, and hardcoded-label/toFixed guards pass. Backend-specific SQLite wording is the active exception tracked by `R12-UIUX-001`. | i18n dictionaries and locale tests | VERIFIED_EXISTING |
| R12-I18N-002 | MEDIUM | VNDB token storage and statistics copy now describe the application database in French, English, and Japanese instead of claiming SQLite storage on PostgreSQL. Secret values remain masked by the existing API contract. | integration settings dictionaries | DONE_WITH_DIFF |
| R12-PERF-001 | HIGH | Large lists remain bounded by server pagination or virtualization, including library, wishlist, AliceNet, places, tags, staff, overlap, and stock queues. Permanent virtualization and normalized tag-index contracts pass focused tests. | server pagination, virtual grid, normalized indexes | VERIFIED_EXISTING |
| R12-PERF-002 | MEDIUM | Production full-document responses are gzip-compressed and measured at about 62 KiB for library, 86 KiB for upcoming/schema, and 133 KiB for a data-rich VN page from Japan. Record these as a baseline; avoid moving the 524 KiB three-locale dictionary wholesale into one client bundle, and investigate namespace splitting only with before/after hydration measurements. | root i18n provider, production responses | VERIFIED_EXISTING |
| R12-PERF-003 | HIGH | Opening many VN tabs kept one download-status transport alive per hidden tab, while each polling or SSE consumer independently loaded durable jobs and enriched entity names. Hidden tabs now close polling, pending requests, and SSE without touching the server-owned job; visibility restores an immediate current snapshot. Concurrent polling and stream consumers coalesce one database/enrichment build. A stock batch regression advances from 1/10 to 7/10 while hidden and resumes at 7/10 without a cancellation request. Build and the complete 9,689-test suite pass at exact 100/100/100/100. | `src/components/DownloadStatusBar.tsx`, `src/lib/download-status-payload.ts`, download-status routes and tests | DONE_WITH_DIFF |
| R12-TYPE-001 | HIGH | Strict TypeScript passes with no production `any`, ignore directive, coverage suppression, or unsafe double cast found in source. Preserve explicit decoders at JSON, database, and browser-storage boundaries. | `tsconfig.json`, source and decoder tests | DONE |
| R12-SEC-003 | CRITICAL | The final dependency audit reports zero vulnerabilities across 585 packages. The `url.parse` deprecation warning originates in the Yarn 1 audit client and is not an application dependency advisory. | `package.json`, `yarn.lock` | DONE |
| R12-SEC-004 | HIGH | API policy, auth, CSRF, SSRF, bounded-body, URL allowlist, safe-link, and error-sanitization tests pass. The reverse-proxy runtime gap is closed with fail-closed forwarding detection and proof-gated public Origin resolution; the final whole-suite security rerun remains under `R12-TEST-002`. | API and security modules/tests | DONE_WITH_DIFF |
| R12-TEST-001 | CRITICAL | The complete final coverage gate passes 9,690 tests at exactly 100 percent statements, branches, functions, and lines, with no exclusions, threshold changes, ignored files, or assertion-only hacks. | `yarn test:cov`, coverage configuration, all tests | DONE_WITH_DIFF |
| R12-TEST-002 | HIGH | The full suite, 93-scenario PostgreSQL integration run, production build, browser QA, regression sentinel, Chromium/WebKit interactions, dependency audit, and 156-render production route tour all pass on the final application code. Timing failures were investigated rather than accepted as isolated reruns. | package scripts, browser scripts, production | DONE_WITH_DIFF |
| R12-TEST-003 | HIGH | The first complete coverage attempt exposed 83 failures across six older API suites because their request factories combined a loopback URL with incomplete client-forwarding metadata. Those requests correctly became forbidden after proxy hardening. A shared test factory now emits the complete Next.js direct-loopback header shape while preserving deterministic rate-limit buckets; all 97 affected route scenarios pass without weakening production authorization. | `tests/helpers/loopback-forwarding.ts`, API route suites, trusted-proxy contract | DONE_WITH_DIFF |
| R12-OPS-001 | CRITICAL | Production application code is on immutable release `ec2dccd3`, PostgreSQL readiness is green with pool max 10, nine migrations are current, systemd is active, and restart count is zero. The application role is non-superuser, database and application listeners are loopback-only, collection indexes are present, both backup timers and all checksums pass, and the latest dump restores successfully into a disposable database with 9 migrations, 3,317 VN, 167 collection rows, 8,058 offers, and 1,412 AliceNet rows. | production PostgreSQL, systemd, Nginx, backup operations | DONE_WITH_DIFF |
| R12-OPS-002 | MEDIUM | Safari access logs show the standard one unauthenticated 401 challenge immediately followed by one authenticated 200, not two failed authentications. Keep favicon/apple-icon requests outside Basic Auth and recheck after trusted-proxy changes; do not attribute a second password prompt without a second challenge in evidence. | production Nginx access log and icon snippet | VERIFIED_EXISTING |
| R12-OPS-003 | HIGH | The release command now discovers the systemd WorkingDirectory, ExecStart, environment file, and existing immutable release store instead of assuming a path. It refuses mismatches, validates the candidate against database-aware readiness, atomically switches the exact service symlink, verifies the running process directory and commit, and restores the previous release if activation fails. | `ops/deploy-release.sh`, systemd unit, production release paths | DONE_WITH_DIFF |
| R12-PROVIDER-001 | HIGH | All 23 configured providers, Amazon, and every supplied direct example were called from the current workstation in Japan, not the production server. Twenty-one providers returned live HTTP 200 pages; Suruga-ya returned its declared Cloudflare challenge and Joshin returned its provider-specific blocked response. Live parser checks confirm Sofmap, Hgame1, Melonbooks, WonderGOO, Eroge Price, and AliceNet structures; expired Mandarake and empty Trader examples remain bounded. Production was checked only for persisted freshness and UI ownership. | local Japan network, stock provider matrix, production UI | DONE_WITH_DIFF |
| R12-PROVIDER-002 | HIGH | A live WonderGOO benefit page puts the generic shop name in the first `h1` and the actual product in document metadata. The parser previously selected `WonderGOO`, which weakened title classification and could discard a valid VN offer. Prefer `og:title`, then the document title, before the generic heading; retain the declared store-locator-only availability semantics. | `src/lib/stock.ts`, stock provider parser tests | DONE_WITH_DIFF |
| R12-DOC-001 | MEDIUM | Data-management implementation narration and SQLite-only drag/restore wording are removed. Exported contracts retain concise semantic documentation, while JSX no longer explains framework choices, page ownership, or component placement to the operator. | data-management components and touched exported contracts | DONE_WITH_DIFF |

## Evidence collected so far

- Strict typecheck passed.
- A 29-file cross-cutting suite passed 369 tests covering API policy, auth,
  CSRF, SSRF, error sanitization, accessibility, responsive geometry, i18n,
  loading/image behavior, pagination, virtualization, map privacy, and layers.
- The dependency audit found zero vulnerabilities in 585 packages.
- The final browser matrix covered 39 production routes in four WebKit and
  Chromium viewport combinations, for 156 renders with no horizontal overflow,
  fatal render, duplicate id, visible broken image, console error, or failed
  request.
- Production route timing from Japan returned HTTP 200 for 16 representative
  pages; measured full-response sizes and latency are recorded above.
- PostgreSQL inspection confirms 8,058 provider offers updated through 24
  August and 1,412 AliceNet rows updated on 25 August local time. Five place
  cards render without a stale badge after client loading completes.
- A local production-mode Next.js runtime accepts direct loopback access to the
  sensitive settings route while rejecting forged public forwarding metadata;
  the dedicated proxy helper has exact 100 percent branch coverage.
- AliceNet error classification, job lifecycle, snapshot decoding, shop-panel
  rendering, and global progress rendering pass focused exact 100 percent
  coverage, including a zero-item HTTP 503 and a completed cancellation.
- The deployed AliceNet recovery run completed all 1,412 stock rows without an
  error and advanced the last-success timestamp while preserving the row count.
- The first full coverage attempt passed 9,583 tests and exposed 83 stale
  request-fixture failures; the corrected six-suite set now passes all 97
  scenarios against the hardened proxy contract.
- Multi-tab production analysis reproduced 30 concurrent WebKit VN pages with
  no process restart, but confirmed that every tab retained its own progress
  transport and snapshot reconstruction. The focused lifecycle, coalescing,
  route, and authorization set passes 158 tests after the bounded fix. The
  final feature run passes 9,690 tests with 44,502 statements, 37,818 branches,
  9,015 functions, and 37,995 lines all covered exactly.
- All PostgreSQL and storage backup checksums pass. The newest PostgreSQL dump
  was restored into a disposable database, queried for expected row counts,
  and removed cleanly.
- All 23 configured providers and every supplied direct example were called
  from this Japanese workstation. The live parser pass exposed and fixed the
  WonderGOO generic-heading priority without changing its availability model.
