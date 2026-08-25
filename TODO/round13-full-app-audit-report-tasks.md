# Round 13 full application audit - 2026-08-25

This audit starts from the deployed production state after Round 12. Previous
green reports are historical evidence, not substitutes for fresh inspection.
The scope covers all 40 application pages, 123 API routes, loading and error
boundaries, PostgreSQL, navigation, collection workflows, shelves, VN detail,
stock and shops, AliceNet, maps and places, settings, i18n, accessibility,
responsive behavior, security, performance, typing, tests, operations, and
deployment integrity.

A row remains `TODO` until the finding is fixed or independently disproved by
direct source and runtime evidence. `DONE_WITH_DIFF` records a Round 13 change;
`VERIFIED_EXISTING` records a fresh verification of an existing contract.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R13-TEST-001 | HIGH | The Round 12 production matrix covered 39 of the 40 App Router pages and omitted the dynamic list-detail page. Discover a real list id, include `/lists/[id]`, and rerun mobile and desktop WebKit plus Chromium for 160 isolated renders with strengthened accessibility, loading, security-header, image, error, and responsive checks. | production browser matrix, `src/app/lists/[id]/page.tsx` | DONE_WITH_DIFF |
| R13-OPS-001 | MEDIUM | Production logged Next.js `destination stream closed early` errors during deliberate RSC navigation cancellation. Establish whether normal Safari workflows reproduce them, distinguish harmless client disconnects from application faults, and avoid suppressing unrelated server errors. | production journal, RSC navigation lifecycle | VERIFIED_EXISTING |
| R13-PERF-001 | HIGH | The VNDB collection and all-release tabs render up to 200 upcoming cards in one document; production reaches roughly 9,000 DOM nodes and repeats cover/membership work for rows outside the initial viewport. Paginate these two tabs with stable URL state, localized range feedback, and bounded per-page repository lookups while preserving month grouping. | `src/app/upcoming/page.tsx`, upcoming runtime tests | DONE_WITH_DIFF |
| R13-PERF-002 | HIGH | A production VN detail with extensive release and translation metadata renders about 9,100 DOM nodes on both engines and viewport classes. Attribute the node cost by section, then paginate or progressively disclose the dominant repeated surface without hiding data or breaking deep links. | `src/app/vn/[id]/page.tsx`, VN detail sections, production VN detail | DONE_WITH_DIFF |
| R13-PERF-003 | MEDIUM | The tags browser renders about 7,200 DOM nodes before interaction in all four production configurations. Preserve indexed search and hierarchy navigation while bounding the initially mounted tree through progressive expansion or virtualization. | `src/components/TagsBrowser.tsx`, production `/tags` | DONE_WITH_DIFF |
| R13-RESP-001 | HIGH | Production mobile measurement finds release-producer metadata links at about 13 px high and anniversary cards at 40 px. Keep the compact desktop presentation but provide the repository-required 44 px touch target on coarse/narrow layouts. | `src/app/upcoming/page.tsx`, `src/components/AnniversaryFeedView.tsx` | DONE_WITH_DIFF |
| R13-RESP-002 | HIGH | A long romanized title in the all-releases feed expands its compact card past the 390 px viewport in both WebKit and Chromium. Allow the title flex item to shrink and wrap long tokens while retaining the two-line card hierarchy. | `src/components/UpcomingCard.tsx`, production `/upcoming?tab=all` | DONE_WITH_DIFF |
| R13-A11Y-001 | HIGH | The 390 px production matrix still measures interactive controls below the repository's 44 px touch-surface minimum across upcoming titles, recommendations, compare metadata, quotes, statistics, Steam, stock, places, schema/data tools, and entity detail pages. Separate inline-reading links from controls, then enlarge every true control without turning dense metadata into oversized cards. | shared chips and action controls across audited mobile routes | DONE_WITH_DIFF |
| R13-A11Y-002 | HIGH | WebKit ignores `min-height` and padding on native select controls while preserving the same declarations in CSSOM, leaving production place filters at 20 px even though Chromium renders 44 px. Give the shared select primitive an explicit 44 px used height, verify both engines, and retain intrinsic sizing for other input types. | `src/app/globals.css`, all `.input` select controls | DONE_WITH_DIFF |
| R13-A11Y-003 | HIGH | Mobile compare and staff cards expose their cover links without an accessible name while the image skeleton is active because the image alternative is not yet mounted. Name the link from the already available VN title so loading state never removes the control's identity. | `src/app/compare/page.tsx`, `src/app/staff/[id]/page.tsx` | DONE_WITH_DIFF |
| R13-A11Y-004 | HIGH | The system-activity entity links and data-page collection link are isolated actions below 44 px, while each Steam manual-link search field only gives the text glyph line a hit target inside a visually 44 px wrapper. Enlarge the links and make each input fill its complete visual control without increasing fine-pointer desktop rows. | `src/app/activity/page.tsx`, `src/app/data/page.tsx`, `src/app/steam/page.tsx` | DONE_WITH_DIFF |
| R13-A11Y-005 | HIGH | The vertical year chart compresses linked columns below 44 px on mobile, and the cache disclosure plus authenticated-account link remain under-height. Give linked bars a 44 px minimum column with local horizontal scrolling, and enlarge the two isolated controls while preserving chart semantics and desktop density. | `src/components/charts/BarChart.tsx`, `src/components/CachePanel.tsx`, `src/app/stats/page.tsx` | DONE_WITH_DIFF |
| R13-SEC-001 | HIGH | Every production document has HSTS, MIME sniffing, referrer, frame, and permissions protections but no Content Security Policy. Build an application-compatible enforced policy for Next.js scripts, local APIs, VNDB/local images, map tiles, geocoding, and user-configured artwork; prove that it blocks unrelated origins without breaking all 40 routes. | `next.config.mjs`, browser security headers, security tests | DONE_WITH_DIFF |

## Evidence collected

- At the audit baseline, local `main`, `origin/main`, the production release
  symlink, and the running process resolved to commit
  `935dc67ffaca6c808230721f93e1b466b1800b09`.
- Production readiness reports PostgreSQL available, pool maximum 10, no
  waiting clients, no unexpected service restart, and no configured memory cap.
- Source inventory contains 40 page files, 40 loading boundaries, 32 explicit
  route error boundaries plus the root boundary, and 123 API route files.
- Production verification after commits `23d8b31f`, `e9b8cc93`, and `1e00dfaf`
  bounds each VNDB release page at 60 cards and roughly 2,300 DOM nodes,
  preserves URL pagination, provides 44 px mobile producer and anniversary
  targets, and eliminates the long-title horizontal overflow in WebKit and
  Chromium while retaining compact desktop targets.
- The post-CSP production matrix covers all 40 routes, including a temporary
  real `/lists/[id]`, in mobile and desktop WebKit plus Chromium. All 160
  documents return HTTP 200 with one main landmark, one H1, valid localized
  metadata, no horizontal overflow, no visible broken image, no missing image
  alternative, and no fatal runtime text.
- Commit `20282b7a` adds an enforced CSP to all 160 documents. The observed
  policy has restrictive script, object, frame, base, and form directives,
  explicit same-origin/Nominatim connections, and HTTPS image support; the
  matrix reports no CSP violation or non-cancelled failed request.
- Production attribution identified releases and relation cards as 6,049 of
  the roughly 9,100 VN-detail nodes, while 500 local tag cards accounted for
  almost the complete tags page. Commits `17c019fa` and `8c923c70` paginate
  relation groups and releases at 12 rows and tag categories at 40 rows. All
  rows remain reachable through localized, keyboard-operable navigation;
  WebKit and Chromium now measure about 4,938 nodes on the same VN and 2,018
  on `/tags`.
- Commit `e57db0dc` gives shared select controls an explicit 44 px used height,
  enlarges producer-scope tabs on touch layouts, and completes both dimensions
  of short upcoming producer links. Production WebKit and Chromium both now
  measure those three surfaces at 44 px; desktop fine-pointer compaction remains
  available for the link and tab controls.
- Commit `88f3c1b1` enlarges the remaining shared touch surfaces found in the
  first matrix pass: tag clearing, stock filters, place actions, schema tools,
  maintenance identifiers, quotes, upcoming titles, and statistics rows. Direct
  production measurements in mobile WebKit and Chromium confirm 44 px effective
  targets without horizontal overflow.
- Commits `dc9a6735` and `620e04ef` complete the entity-detail pass across VN,
  compare, character, staff, release, and AliceNet shop views. A 12-render
  production check over both engines returns HTTP 200 throughout, no browser
  errors, no responsive overflow, and no sub-44 px control except a sentence-
  embedded synopsis link covered by the inline-text target-size exception.
- Production currently serves commit `1b08a7df18945ee5b4c1713f7f989b71d351f852`
  with PostgreSQL ready, pool maximum 10, and zero unexpected service restarts.
- Commits `79d0bfca`, `bcaf2ac4`, and `539f13fd` name loading cover links,
  enlarge utility controls, and make the statistics chart locally scrollable
  with 44 px columns. Production WebKit and Chromium measure all corrected
  surfaces at 44 px and retain a 390 px document width.
- The final accessibility matrix covers all 40 routes, including `/lists/5`,
  across mobile and desktop WebKit and Chromium. All 160 isolated renders return
  HTTP 200 with zero findings: no unnamed action or field, small true control,
  horizontal page overflow, offscreen focusable outside an intentional local
  scroller, browser error, failed non-cancelled request, broken visible image,
  missing image alternative, invalid document landmark, or fatal runtime text.
  All five enforced security headers are present on every response.
- The RSC journal warning is attributable to cancelled link prefetches: each
  warning window contains Nginx `499` responses for `?_rsc` requests from the
  short-lived audit pages. A stable eight-tab WebKit run covering VN, compare,
  release, staff, place, and library pages, plus rapid client navigation, yields
  HTTP 200 throughout and no matching server warning. The process remains active
  with zero restarts, roughly 164 MiB peak memory, no memory cap, and a ready
  PostgreSQL pool; no error suppression or memory increase is warranted.
