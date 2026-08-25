# Round 14 full application audit - 2026-08-25

This is an independent audit of the current deployed application after Round
13. Earlier reports are evidence of prior work, not proof that the same
contracts still hold. A row remains `TODO` until the relevant source, tests,
database behavior, browser behavior, and production state have been checked.

Scope: all App Router pages and APIs; library, wishlist, search, VN detail,
shelves, compare, staff, releases, stock, shops, places, map, AliceNet,
settings, downloads, VNDB synchronization, PostgreSQL, loading/error states,
UI/UX, responsive behavior, Firefox/WebKit/Chromium interoperability,
accessibility, i18n, security, typing, performance, testing, documentation,
operations, providers, deployment, backup, and restore.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R14-TEST-001 | HIGH | Full coverage initially reported two untested fallback branches in a relation-group key even though each map group is structurally non-empty. Encode that invariant directly and test that replacing the terminal relation resets pagination; rerun the complete PostgreSQL-backed coverage suite until all four metrics are exactly 100%. | `src/components/RelationsSection.tsx`, `tests/RelationsSection.test.tsx` | DONE_WITH_DIFF |
| R14-UX-001 | HIGH | The VN loading cover pulsed as a translucent block over an overlapping translucent banner skeleton. Firefox can composite both animated opacities and make the banner appear as a brighter foreground rectangle. Keep the cover pulse but place it inside an opaque, correctly layered shell matching the final cover geometry. | `src/app/vn/[id]/loading.tsx`, route-loading tests | DONE_WITH_DIFF |
| R14-UX-002 | HIGH | Staff and seiyuu loading routes used a generic tall block or vertical cover grid that did not resemble the final search controls, profile, timeline, or horizontal VN/character credits. Mirror the actual responsive geometry so loading does not replace one page shape with another. | staff list/detail loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-003 | HIGH | Character, top-ranked, producer, and place loading routes used incorrect artwork ratios or unrelated generic card grids. Mirror each destination's real header, controls, card direction, density behavior, statistics, and actions so streamed transitions preserve the final responsive geometry. | character, top-ranked, producer, and place loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-004 | MEDIUM | Statistics flattened distinct summaries, goals, charts, and rankings into eight identical tiles, while Data replaced variable status, action, import, and maintenance surfaces with six identical rectangles. Preserve each page's actual information hierarchy and responsive column changes during loading. | statistics and data loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-005 | HIGH | EGS had two divergent fallbacks built from vertical cover cards, place detail omitted its seven counters and filtering workspace, and Stock omitted recent activity and batch tools. Share the EGS fallback and preserve the real horizontal cards, shop controls, stock history, and batch workspace while these routes stream. | EGS, place detail, and stock loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-006 | MEDIUM | Activity reduced three filters and two independently paginated logs to one generic block and one row list, while Brand overlap added thumbnails that do not exist in its two-column credit cards. Preserve both workflows' actual controls, hierarchy, and responsive row structure during navigation. | activity and brand-overlap loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-007 | MEDIUM | Dumped used vertical cover cards instead of its compact edition-progress rows, while Quotes used 2:3 thumbnails instead of square character avatars and citation text. Mirror their summaries, filters, progress, search, citations, and pagination without introducing unrelated geometry. | dumped and quotes loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-008 | HIGH | Year invented cover grids absent from the final review, Schema collapsed three data sources and a table browser into generic rows, and Steam used vertical VN cards instead of mapping workflows. Mirror the year heatmap/rankings, schema source panels/table, and Steam suggestion/link/search sections. | year, schema, and Steam loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-009 | HIGH | Recommendations omitted its five modes, explanation, flags, and seed controls; Upcoming used generic rows that disagreed with both density-aware horizontal card variants; Wishlist omitted its final title hierarchy; and the seiyuu loader ignored saved section order while its streamed external covers used a different fixed width. Mirror all final controls and card geometry, share the Upcoming fallback, and honor staff layout order and visibility during loading. | recommendations, upcoming, wishlist, and staff loading boundaries | DONE_WITH_DIFF |
| R14-UX-010 | HIGH | Route placeholders for every density-adjustable surface inherited only the global density, so a page-specific override changed the column count and artwork width when loading resolved. The seiyuu placeholder also used a variable-height chart unlike the fixed 24-pixel timeline, omitted the streamed external-credit section, compacted touch geometry by width alone, and understated the density toolbar. Scope all 22 affected placeholders to their resolved surface, mirror the seiyuu timeline/profile/streaming geometry, and enforce the complete route-to-scope inventory. | shared skeleton boundary; library, people, discovery, place, list, shelf, tag, EGS, upcoming, search, and wishlist loading surfaces | DONE_WITH_DIFF |
| R14-RES-001 | HIGH | Eight routes had dedicated loading UI but no segment-local error boundary, so failures discarded route context and fell through to root recovery. Add tested local recovery for labels, map, place list/detail, search, Steam, stock, and traits, then enforce both loading and error siblings for every page. | App Router route boundaries and route-boundary tests | DONE_WITH_DIFF |
| R14-UI-001 | HIGH | Re-audit all page layouts, navigation, dialogs, density controls, long lists, overflow, artwork controls, empty/error states, and workflow coherence at representative desktop, tablet, and mobile widths. Fix every reproducible inconsistency rather than relying on the Round 13 matrix. | all 40 pages and shared UI | TODO |
| R14-RESP-001 | HIGH | Run a new Firefox, WebKit, and Chromium responsive matrix, including loading transitions, navbar/category menus, shelves, VN artwork, map overlays, settings controls, and long localized strings. Check page overflow, local scrollers, focus reachability, stacking, and 44 px touch surfaces. | production browser matrix | TODO |
| R14-RESP-002 | HIGH | Seventy-nine route and component surfaces reduced 44-pixel controls at the 640-pixel width breakpoint without checking input capabilities, so landscape phones and tablets received desktop-sized links, tabs, filters, artwork tools, and destructive actions. Keep touch dimensions at every width and compact only when a fine pointer can hover; enforce that invariant across all TSX sources. | application-wide responsive controls | DONE_WITH_DIFF |
| R14-A11Y-001 | HIGH | Recheck landmarks, headings, names, labels, focus order, keyboard operation, dialogs, announcements, image alternatives, color-independent state, reduced motion, and target sizing across every route and major interaction. | application-wide | TODO |
| R14-A11Y-002 | HIGH | The mobile navigation trigger rendered at 44 by 32 pixels and the expanded quote refresh action rendered at 12 by 12 pixels, despite pseudo-element helpers that did not change their layout boxes. Give the menu a permanent 44-pixel box and the quote action a 44-pixel box whenever it is interactive while preserving its compact, inert collapsed state. | `src/components/MoreNavMenu.tsx`, `src/components/QuoteFooter.tsx` | DONE_WITH_DIFF |
| R14-A11Y-003 | HIGH | Sixteen dialog, popover, batch-progress, map-search, and quick-menu components exposed icon-only close actions whose actual layout boxes remained below 44 pixels, sometimes using the tighter pseudo-element helper that only reached about 28 pixels. Give every icon-only close action a real 44-by-44 box and enforce the complete close-button inventory structurally. | shared dialogs, artwork pickers, AliceNet link dialog, map, download, shelf, and quick-action panels | DONE_WITH_DIFF |
| R14-A11Y-004 | HIGH | Typed confirmations relied on native `autoFocus`, captured focus after that transfer, included disabled submit buttons in their Tab loop, and rebuilt the focus effect when an inline close callback changed. This could lose the trigger for restoration, break wrapping while validation was incomplete, or move focus during an unrelated app rerender. Capture the trigger before moving focus, focus the required input explicitly, exclude disabled controls, and keep close callbacks behind a current ref. | `src/components/ConfirmDialog.tsx` | DONE_WITH_DIFF |
| R14-I18N-001 | HIGH | Recheck French, English, and Japanese dictionary parity, hardcoded visible strings, date/time and number formatting, platform names, plural/range text, metadata, error messages, and layout resilience under longer translations. | i18n dictionaries and all rendered surfaces | TODO |
| R14-I18N-002 | HIGH | Character birthdays forced day/month order, VN activity start/finish dates exposed ISO storage values, status changes exposed internal status keys, and playtime used a hardcoded `min` suffix. Route all four through locale-aware formatters and test French, English, and Japanese ordering and units. | `src/lib/locale-number.ts`, character detail, VN activity timeline | DONE_WITH_DIFF |
| R14-I18N-003 | HIGH | EGS only decoded a hand-maintained entity subset and AliceNet did not decode HTML entities at ingestion, leaving encoded producer and title text in the shop UI, EGS metadata, search, and filters. Use a standards-based single-pass decoder for future ingestion and migrate historical SQLite and PostgreSQL values. | EGS and AliceNet parsers, SQLite bootstrap, PostgreSQL migration 0010 | DONE_WITH_DIFF |
| R14-I18N-004 | MEDIUM | The character browser's voice-language filter exposed raw VNDB language codes while equivalent filters elsewhere used localized language names. Route every option through the shared `Intl.DisplayNames` helper while preserving the submitted code. | character browser filter and runtime test | DONE_WITH_DIFF |
| R14-SEC-001 | CRITICAL | Re-audit authentication gates, mutation authorization, CSRF/origin handling, SSRF and URL allowlists, uploads and path traversal, request size limits, secret/error exposure, CSP and headers, proxy behavior, dependencies, and production TLS/reverse-proxy configuration. | all APIs, middleware, Next and production configuration | TODO |
| R14-SEC-002 | CRITICAL | Production Nginx capped every request at 50 MiB while the authenticated PostgreSQL logical restore endpoint supports archives up to 4 GiB and current database backups already exceed 200 MiB. Add an exact authenticated restore location with the matching cap, streaming request forwarding, trusted-proxy proof, and bounded timeouts while retaining the lower global limit. | `ops/nginx/vndb-backup-restore.conf`, production Nginx, PostgreSQL operations docs | DONE_WITH_DIFF |
| R14-SEC-003 | MEDIUM | Production correctly enforced Basic Auth at Nginx and exposed Next only on loopback, but omitted `VN_PUBLIC_READ_AUTH=upstream`, so the application classified its personal-data reads as open despite the deployed proxy contract. Declare the upstream authentication mode in the root-managed runtime environment and verify page, API, SSE, and direct-port behavior. | production runtime environment and security verification | DONE_WITH_DIFF |
| R14-FEAT-001 | HIGH | Exercise complete library, wishlist, search, filter/group/sort, collection mutation, compare, shelf, release/edition, lists, series, staff, downloads, backups, and settings workflows, including immediate state refresh and failure recovery. | core product workflows | TODO |
| R14-STOCK-001 | HIGH | Verify per-VN lookup, generic stock aggregation, cached/fresh semantics, aliases, provider diagnostics, background jobs, stale timestamps, place assignment, map integration, and every configured provider. Keep AliceNet mirror controls only on its linked shop detail page. | `/stock`, VN stock section, `/places`, `/map`, stock APIs | TODO |
| R14-STOCK-002 | HIGH | Provider maintenance inferred the last completed batch from progress rows that are intentionally deleted after one hour, so a successful older sync reverted to the misleading `no batch` state while provider statuses remained durable. Persist one bounded latest-completed summary per provider independently from progress history and use it for maintenance comparisons. | durable stock batch store, provider maintenance repository, SQLite and PostgreSQL schemas | DONE_WITH_DIFF |
| R14-ALICE-001 | HIGH | Exercise the AliceNet shop-only control surface, detached progress, stop/retry, fetch, matching, VNDB/EGS enrichment, pagination, errors, manual links, cached generic offers, and migration compatibility without reintroducing a navbar or standalone mirror page. | linked AliceNet `/places/[id]`, `/api/alicenet/*` | TODO |
| R14-VNDB-001 | HIGH | Verify local/VNDB status, rating, notes, wishlist, and label conflict behavior. Ensure preview/apply is field-specific, stale previews cannot overwrite newer changes, missing remote values do not silently erase local meaning, and every direction is explicit. | VN status panel, settings sync, VNDB APIs and sync library | TODO |
| R14-VNDB-002 | CRITICAL | Conflict resolution previously submitted only field names, so an old browser preview could apply values that had changed locally or on VNDB since it was rendered. Submit the exact local/remote snapshot for every selected field, revalidate it against fresh data, use an atomic compare-and-set for local pulls, and reload the panel on conflict. | VN status panel, VNDB status API, SQLite and PostgreSQL collection repositories | DONE_WITH_DIFF |
| R14-PERF-001 | HIGH | Recheck bounded queries, pagination/virtualization, tag indexes, repeated repository calls, client polling, background jobs, multi-tab behavior, images, DOM size, bundle boundaries, memory, database pool pressure, and slow provider isolation. | application and production runtime | TODO |
| R14-DATA-001 | CRITICAL | Validate PostgreSQL migrations, indexes, constraints, JSON quarantine, SQLite migration parity, current production data, transaction behavior, connection pooling, backup creation, restore verification, and operational documentation. | PostgreSQL repositories, migrations, production database | TODO |
| R14-TYPE-001 | HIGH | Re-scan production and test code for weakened types, unsafe casts, suppression directives, unvalidated external payloads, and exported contracts lacking useful documentation. | `src`, `tests`, `scripts` | TODO |
| R14-TEST-002 | HIGH | Run focused tests while fixing findings, then the complete unit, PostgreSQL, exact coverage, QA, interaction, sentinel, provider, browser, and production health gates. No ignored files, skipped new scenarios, or threshold workarounds. | all test and QA suites | TODO |
| R14-DOC-001 | MEDIUM | Reconcile README, FEATURES, CLAUDE, deployment and PostgreSQL docs, active TODO reports, route/provider claims, AliceNet naming, and final verification evidence with the shipped application. | project Markdown and operational docs | TODO |
| R14-OPS-001 | CRITICAL | Verify pushed and deployed SHA equality, release activation, health, PostgreSQL availability, service restarts, memory, journal errors, backups, restore readiness, and rollback artifacts after every feature deployment and at final closure. | production host and deployment tooling | TODO |
| R14-OPS-002 | CRITICAL | The release script sourced only the application environment for migrations, contradicting the documented least-privilege role split. DML-only migrations happened to work, but migration 0011 correctly failed on `CREATE TABLE`. Load the root-managed migrator environment only inside the migration subprocess and retain the application role for build, candidate health, and runtime. | release deployment script, production migration environment, PostgreSQL operations guide | DONE_WITH_DIFF |

## Evidence collected

- At the Round 14 baseline, production served commit `d4b356fd0675e59f17f89b6202e1b78d3dae3a5e`
  with PostgreSQL ready, pool maximum 10, and zero service restarts.
- The complete coverage suite passes 9,707 tests (three skipped historical
  cases) across 931 test files and reports exactly 100% statements, branches,
  functions, and lines after commit `d4b356fd`.
- The independent PostgreSQL suite passes all 93 integration scenarios.
- The production-dependency audit reports zero vulnerabilities across 296
  audited packages.
- Commit `57b48f7d` prevents Firefox from compositing the translucent VN cover
  pulse with the overlapping banner pulse. Forty-seven focused loading/image
  tests, typecheck, and production build pass; production activates the commit
  with PostgreSQL ready and zero service restarts.
- Every one of the 40 App Router pages now has both a route-matched loading
  skeleton and a segment-local error boundary. The shared recovery test covers
  retry, digest, logging, and route-aware return behavior, while a structural
  contract prevents future pages from omitting either boundary.
- Character birthdays, VN activity dates, activity status transitions, and
  minute durations now use the active locale rather than fixed display tokens.
  Forty-four focused i18n, page, and component tests pass together with the
  complete typecheck and production build.
- Production database archives exceed the previous reverse-proxy upload limit.
  The exact restore route now has a tested 4 GiB streaming allowance while
  every other route keeps the lower general cap and the restore remains behind
  Basic Auth plus the trusted-proxy proof.
- Production now explicitly declares its upstream read-authentication policy.
  HTTP redirects to HTTPS, unauthenticated HTTPS returns 401, authenticated
  pages, health checks, and the status stream return 200, and Next listens only
  on loopback with its public port unreachable. The certificate verifies, HSTS
  and the expected CSP/security headers are present, and 390 focused security
  scenarios plus the 297-package production dependency audit pass without a
  vulnerability finding.
- EGS and AliceNet HTML ingestion now share a standards-based, single-pass
  entity decoder. SQLite and PostgreSQL migrations clean historical title and
  producer fields without recursively decoding escaped text. The focused suite
  passes 188 scenarios, PostgreSQL passes all 94 integration scenarios, and
  the complete typecheck and production build pass.
- The voice-language filter now presents localized names while retaining VNDB
  codes as form values. The complete i18n-focused suite passes 84 scenarios,
  and a production matrix covers 144 FR/EN/JA renders across Chromium,
  Firefox, and WebKit at 1440 and 390 pixels. Every render has the requested
  document language, localized metadata, no unresolved translation token or
  raw status key, no fatal browser error, and no horizontal overflow.
- Provider maintenance no longer depends on one-hour progress retention. One
  durable latest-completed row per provider survives progress cleanup, rejects
  older jobs finishing late, and feeds the existing updated/missed/no-batch UI.
  Fifty-one focused behavior tests, 94 real PostgreSQL integration scenarios,
  the complete typecheck, and targeted 100/100/100/100 coverage pass.
- A production batch exercised one dynamically selected collection item against
  Sofmap and finished 1/1 without cancellation, interruption, or provider
  errors. The durable provider row remains available after the transient job,
  the maintenance API reports 416 status rows and a completed batch, and the
  UI reports that Sofmap was updated after that batch. Chromium, Firefox, and
  WebKit confirm the same state at 1440 and 390 pixels with HTTP 200, no browser
  errors, no fatal content, and no horizontal overflow.
- The production VN loading skeleton was rendered with production CSS in
  Firefox, WebKit, and Chromium at 1440 and 390 pixels. In all six cases the
  opaque 260 by 390 cover shell exactly contains its pulse, remains above the
  banner across the full 176-pixel overlap, and creates no horizontal overflow.
- Deployment migrations now run with the root-managed migrator environment in
  an isolated subprocess, while build, candidate validation, and the activated
  service retain the restricted application environment. The first deployment
  correctly exposed that the active, older release was still orchestrating its
  own replacement; bootstrapping the updated release script applied the new
  contract. Production now serves commit `cccc3ceb`, migrations 0001 through
  0011 are recorded, PostgreSQL is ready, and the service restart count remains
  zero.
- VNDB conflict actions now bind each selected field to the exact local and
  remote values shown in the preview. Malformed, duplicate, stale-local,
  stale-remote, removed-row, and compare-and-set race cases are rejected; the
  panel refreshes conflict data after a 409 response. Focused decoder, route,
  UI, SQLite, and PostgreSQL tests pass with exact branch coverage, together
  with typecheck and the production build.
- Staff loading now mirrors its complete search/filter/sort header and compact
  result cards. Seiyuu detail loading mirrors the variable profile header,
  scope selector, timeline, density-aware horizontal VN credits, and character
  thumbnails instead of painting unrelated vertical cover cards. It follows
  the saved section order and visibility, and its streamed extra-credit
  fallback uses the same density-aware cover width as the final card while
  exposing an accessible busy status. Structural render tests pin the
  responsive dimensions, saved order, visibility, and card counts.
- Character loading now uses the final 2:3 portrait and horizontal appearance
  rows; top-ranked loading preserves rank rows and its filter controls;
  producer loading includes the logo, aliases, tools, and both role sections;
  place loading presents its statistics, filters, and shop actions instead of
  unrelated VN covers. Focused route, runtime, and component suites pass 62
  scenarios, and the complete 9,758-test suite reports exactly 100% statements,
  branches, functions, and lines together with typecheck and the production
  build.
- Statistics loading now separates the personal summary, reading goal,
  histogram, and responsive ranking grid. Data loading mirrors its descriptive
  header, Activity action, four status cards, export/import controls,
  three-column maintenance surface, and tool groups. Focused route and page
  suites pass 18 scenarios, and the complete 9,760-test suite reports exactly
  100% statements, branches, functions, and lines together with the complete
  typecheck.
- EGS route and Suspense loading now use one context-independent fallback with
  sync tools and density-aware horizontal cards. Place detail loading mirrors
  the shop header, source tabs, seven counters, filters, and stock grid used by
  both AliceNet and ordinary branches. Stock loading retains its picker,
  recent activity, and batch workspace. Eighty-one focused EGS, place, stock,
  sentinel, and geometry scenarios pass, and the complete 9,763-test suite
  reports exactly 100% statements, branches, functions, and lines together
  with the complete typecheck.
- Activity loading now retains its search, kind, and entity controls plus both
  paginated journals. Brand-overlap loading mirrors the two producer pickers
  and paired credit columns without introducing unrelated cover thumbnails.
  Fifty-three focused route, activity, loading-sentinel, and geometry scenarios
  pass, and the complete 9,765-test suite reports exactly 100% statements,
  branches, functions, and lines together with the complete typecheck.
- Dumped loading now preserves its three-part summary, progress bar, five
  status filters, density control, and compact edition-progress cards. Quotes
  loading mirrors the search header, citation text, 28-pixel square character
  avatars, score, and pagination. Fifty-seven focused route, page,
  loading-sentinel, and geometry scenarios pass, and the complete 9,767-test
  suite reports exactly 100% statements, branches, functions, and lines with
  the complete typecheck.
- Year loading now mirrors navigation, three statistics, goal progress,
  activity heatmap, tags, and ranked titles without fake covers. Schema loading
  separates local, EGS, and VNDB data and preserves the four-column browser.
  Steam loading mirrors suggestions, current mappings, and unlinked-game search
  rows. One hundred five focused route, schema, Steam, sentinel, and geometry
  scenarios pass, and the complete 9,770-test suite reports exactly 100%
  statements, branches, functions, and lines together with the complete
  typecheck.
- Recommendations loading now retains all five modes, its explanation, option
  toggles, and seed control. Upcoming route and streamed loading share the same
  density-aware horizontal release geometry as both final variants. Wishlist
  retains its title and subtitle before the real cover grid. Together with the
  saved-layout-aware seiyuu correction, 167 focused scenarios pass; the full
  suite passes 9,774 tests and reports exactly 100% statements (44,699/44,699),
  branches (37,973/37,973), functions (9,095/9,095), and lines
  (38,163/38,163).
- At a 390 by 844 viewport, the mobile menu trigger now measures exactly 44 by
  44 pixels. The quote refresh action remains a compact inert 12-pixel icon
  while collapsed and measures 44 by 44 pixels as soon as the footer opens.
  The interaction leaves document width at 390 of 390 pixels. Seventy-eight
  focused navigation, quote, responsive-target, and portal scenarios pass.
  The full suite passes 9,774 tests with exactly 100% statements, branches,
  functions, and lines, together with the complete typecheck and production
  build.
- Touch-target compaction across 79 route and component surfaces now depends
  on both the desktop width and a fine pointer that can hover. Landscape
  phones, tablets, and coarse-pointer windows therefore retain their 44-pixel
  links, filters, tabs, artwork tools, and actions. A source-wide invariant
  rejects future width-only height or width resets, and 95 focused responsive,
  navigation, density, lightbox, and safe-area scenarios pass. The full suite
  passes 9,775 tests with exactly 100% statements, branches, functions, and
  lines, together with the complete typecheck.
- All 30 close buttons now expose a real touch-sized layout box, including the
  16 previously undersized icon actions in confirmations, artwork pickers,
  AliceNet matching, map search, downloads, shelf options, quick actions, and
  integration panels. A source-wide AST invariant pins both the inventory and
  sizing contract. Four hundred seventeen focused component, interaction, and
  responsive scenarios pass. The full suite passes 9,776 tests with exactly
  100% statements, branches, functions, and lines, together with the complete
  typecheck.
- Typed confirmations now capture their launcher before explicitly focusing
  the required input, exclude disabled controls from their Tab loop, keep focus
  stable across parent rerenders, and return it to the launcher after closing.
  Prompt and confirm Escape handling now reads the latest close callback
  without rebuilding the focus lifecycle. Seventeen focused runtime, server,
  portal, and root-composition scenarios pass. The full suite passes 9,776
  tests with exactly 100% statements, branches, functions, and lines, together
  with the complete typecheck.
- All 22 route-level placeholders for density-adjustable surfaces now inherit
  the exact page-specific density, including root Library, search, wishlist,
  people, discovery, lists, shelves, places, tags, EGS, and Upcoming. The
  seiyuu placeholder now uses the final fixed-height timeline columns, retains
  the streamed external-credit section, reserves the complete density toolbar,
  and preserves touch geometry on coarse pointers. Chromium and Firefox at
  390 pixels render the settled staff page without browser errors or horizontal
  overflow, every sourced image resolves, and no stale busy surface remains.
  The full suite passes 9,777 tests and reports exactly 100% statements
  (44,710/44,710), branches (37,979/37,979), functions (9,097/9,097), and lines
  (38,173/38,173).
