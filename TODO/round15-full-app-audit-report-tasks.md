# Round 15 full application audit - 2026-08-28

This is an independent audit of the current deployed application after Round
14 and the VNDB release-list synchronization feature. Earlier reports remain
implementation history, not proof that the same contracts still hold. A row
stays open until its source, tests, browser behavior, database behavior, and
production state have been checked where applicable.

Scope: every App Router page and API; library, wishlist, search, VN detail,
releases, shelves, compare, staff, stock, shops, places, map, AliceNet,
settings, downloads, VNDB and EGS integration, SQLite and PostgreSQL, loading
and error states, UI/UX, responsive behavior, Chromium, Firefox and WebKit,
accessibility, i18n, security, typing, performance, testing, documentation,
provider behavior, operations, backup, restore, and immutable deployment.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R15-AUDIT-001 | CRITICAL | Run a fresh application-wide source, test, browser, database, provider, documentation, and production audit. Record every verified problem below, implement each fix independently, and retain unknowns as open work instead of reusing Round 14 evidence. | whole application | IN_PROGRESS |
| R15-RESP-001 | CRITICAL | Complete the deterministic 1,800-render production matrix across all 40 page routes, three browser engines, five viewport classes, and three locales. Investigate every HTTP, runtime, overflow, card-row, quote-footer, clipping, image-recovery, touch-target, and localization finding and rerun affected combinations after each fix. | `scripts/responsive-audit.mjs`, all page routes, production | IN_PROGRESS |
| R15-RESP-002 | CRITICAL | The mobile library grid stretched each semantic list cell to its row height but Safari iOS could still paint the visual `VnCard` at its shorter intrinsic height. The earlier corrections removed percentage-height sizing and strengthened wrappers, but the physical-phone evidence showed that the remaining nested Grid-to-Flex sizing chain was still not reliable. In the normal library view, `VnCard` is now the semantic list item and the direct CSS Grid child, so the grid track stretches the actual painted border. Row height remains content-driven by the richest card in that row; there is no fixed global card height. Select mode retains its semantic interaction wrapper. The same automatic-size contract remains applied to custom sorting, reorderable lists, series, paginated lists, relations, and placeholder cards. Browser QA identifies the real card root and measures its border through multiple scroll positions, preventing a cover-only or wrapper-only false pass. | `src/components/VnCard.tsx`, `src/components/LibraryClient.tsx`, `src/components/SortableGrid.tsx`, `src/components/ListReorderGrid.tsx`, `scripts/browser-interactions.mjs`, card-grid call sites, responsive production audit | DONE_WITH_DIFF |
| R15-UIUX-001 | HIGH | Recheck complete user workflows, information hierarchy, controls, loading and empty states, card alignment, fixed surfaces, dialogs, navigation, stock and shop integration, VN detail actions, and skeleton-to-content geometry. Add each concrete defect as an independent row before changing behavior. | all user-facing surfaces | IN_PROGRESS |
| R15-ACCESS-001 | HIGH | Recheck landmarks, accessible names, keyboard and touch operation, focus containment and return, disclosure semantics, color-independent states, reduced motion, 44-pixel touch targets, and overlay ordering in source and compiled browsers. | application shell, components, all page routes | IN_PROGRESS |
| R15-ACCESS-002 | HIGH | The activity filter toolbar kept three flexible fields plus actions on one wrapping row without a mobile minimum for the kind and entity fields. At 390 pixels those two controls shrank to 43.4 pixels wide. It now uses an explicit responsive field grid that gives every filter a full mobile row and intentional wider breakpoints. | `src/app/activity/page.tsx` | DONE_WITH_DIFF |
| R15-ACCESS-003 | HIGH | WebKit rendered the VNDB release-list status select at 22 pixels high because the bespoke select style relied on `min-height`, which the native control did not honor consistently. The control now uses the shared input primitive with an explicit 44-pixel select height. | `src/components/VndbReleaseListPanel.tsx` | DONE_WITH_DIFF |
| R15-I18N-001 | HIGH | Recheck French, English, and Japanese dictionary parity, placeholders, hardcoded copy, platform names, dates, times, numbers, currencies, upstream errors, document language, and responsive overflow caused by localized strings. | i18n dictionaries, formatters, all UI surfaces | IN_PROGRESS |
| R15-SEC-001 | CRITICAL | Recheck API authorization policy, reverse-proxy trust, CSRF, SSRF and DNS pinning, input and body bounds, safe links, uploads, file paths, credential masking, error sanitization, headers, rate limits, and dependency vulnerabilities. | APIs, proxy, network clients, deployment configuration | IN_PROGRESS |
| R15-PERF-001 | HIGH | Recheck bounded queries, indexes, pagination and virtualization, shared-request cancellation, hidden-tab behavior, image loading, polling and SSE lifecycles, background jobs, PostgreSQL pool pressure, provider isolation, browser memory, and production query plans. | application runtime, repositories, jobs, production | IN_PROGRESS |
| R15-PERF-002 | HIGH | An expired release-detail cache blocked the streamed page while the throttled VNDB client exhausted primary retries and then mirror retries. On the audited workstation the route emitted its shell in about half a second but remained incomplete beyond 45 seconds, while the same production route with a fresh cache completed in 1.2 seconds. Release-by-id reads now serve a structurally valid expired row immediately and coalesce one background revalidation. Corrupt expired rows still wait for a validated upstream response, and cold misses, batch downloads, explicit synchronizations, cancellation, and the general cache policy are unchanged. | `src/lib/vndb-cache.ts`, `src/lib/vndb.ts`, release detail and API routes | DONE_WITH_DIFF |
| R15-TYPE-001 | HIGH | Recheck strict external decoders, persisted JSON validation, unsafe casts, suppression directives, coverage exclusions, exported contracts, and backend parity. | `src`, `tests`, `scripts` | IN_PROGRESS |
| R15-DATA-001 | CRITICAL | The live PostgreSQL database is healthy after the large VN update: all 11 manifest migrations are applied; readiness reports an available database and bounded pool; no index is invalid or unready; no constraint is unvalidated; the checked collection, owned-release, series, and place-link relations have no orphan; the seiyuu-credit uniqueness key has no duplicate group; and no active job lock or unfinished provider batch remains. All five linked shops derive freshness from stock written one day ago, so the former 11/12-day stale labels are no longer supported by current data. The latest 223 MB PostgreSQL dump and 1.48 GB storage archive pass their recorded SHA-256 checksums. The latest dump was restored into an isolated temporary database, reproduced all 11 migrations and the live principal row counts with zero invalid indexes, and the temporary database was removed afterward. | production PostgreSQL, backup timers, latest database and storage archives, isolated restore | DONE |
| R15-PROVIDER-001 | HIGH | Probe every configured stock provider from the current workstation in Japan, classify real response and parser behavior without guessing, preserve cached offers for protected providers, and verify generic stock plus AliceNet shop-only workflows. | stock providers, provider scripts, stock and place pages | TODO |
| R15-TEST-001 | CRITICAL | Run focused regressions during fixes, then the complete ordinary suite, PostgreSQL integration suite, exact coverage, typecheck, cold production build, QA, interactions, responsive audit, sentinel, provider checks, and production smoke gates. Completion requires exact 100 percent statements, branches, functions, and lines without ignores or threshold workarounds. | all test and QA suites | TODO |
| R15-DOC-001 | MEDIUM | The developer guide said all 2,406 tests must pass, while the current suite contains more than 10,000 scenarios. It now requires the complete current suite without embedding a count that immediately drifts. | `CLAUDE.md` | DONE_WITH_DIFF |
| R15-DOC-002 | LOW | The feature reference defined scaffolded and planned status symbols, but every feature used only the shipped marker. The unused states and decorative symbols were replaced with a plain shipped convention. | `FEATURES.md` | DONE_WITH_DIFF |
| R15-DOC-003 | LOW | General place-registry and PostgreSQL search fixtures contained historical Alice/Kobe and real studio wording outside migration compatibility tests. They now use neutral synthetic labels while legacy identifiers remain only where a migration contract requires them. | `tests/place-registry-page.test.ts`, `tests/postgres-search-parity.test.ts`, `tests/postgres-alicenet-repository.test.ts` | DONE_WITH_DIFF |
| R15-TEST-002 | LOW | The audit report suggested that the responsive harness appended the same non-200 HTTP issue twice. Current source emits it once; a cardinality regression now prevents the diagnostic from drifting back to duplicate output. | `scripts/responsive-audit.mjs`, `tests/qa-script-coverage.test.ts` | VERIFIED_EXISTING |
| R15-TEST-003 | MEDIUM | Firefox exposes the expected initial HTTP Basic challenge as a 401 response even when Playwright is configured for preemptive credentials, then completes the same navigation with 200. The audit now recovers only that exact navigation challenge after a verified 200 final response; final, API, and asset 401 responses remain blocking. | `scripts/responsive-audit.mjs`, `tests/qa-script-coverage.test.ts` | DONE_WITH_DIFF |
| R15-DOC-004 | MEDIUM | Reconcile README, FEATURES, CLAUDE, operational guides, route and provider inventories, TODO status, test evidence, and production facts against the final shipped implementation. | project Markdown and operational docs | TODO |
| R15-OPS-001 | CRITICAL | Commit, push, and deploy each independent correction through the immutable release workflow, then prove local, remote, and production revision identity, active service health, zero unexpected restarts, clean journals, loopback listeners, authenticated routing, rollback retention, and current application behavior. | Git remote, release store, systemd, Nginx, production | IN_PROGRESS |

## Evidence collected

- The Round 15 production responsive matrix is running against the immutable
  deployed release across 1,800 route, engine, viewport, and locale
  combinations. Its result remains open until all renders complete and every
  reported combination is investigated.
- The working tree started clean apart from ignored runtime directories
  `.tmp/` and `data/`. No runtime directory is eligible for staging.
- A fresh source scan found no production or test TypeScript `any` escape,
  TypeScript suppression, or coverage-ignore directive.
- Native image elements remain confined to the three audited image owners:
  `SafeImage`, `LoadingImage`, and `HeroBanner`.
- `R15-RESP-002` is deployed through commits `71daf11e`, `ca4b6488`, and
  `57eaba83`. The final correction makes the normal `VnCard` the direct Grid
  item and the browser probes identify that exact root. WebKit mobile sampled
  73 positions through the production virtualized library with 0 pixels of
  top-edge and visible-bottom divergence; the exact physical-phone regression
  pair was also reproduced in production with both borders resolving to
  `810.140625px`. A 45-render production matrix across Chromium, Firefox, and
  WebKit, five viewport classes, and FR/EN/JA reported zero findings, zero
  horizontal overflow, zero small touch targets, and zero clipped controls.
  Separate
  production checks compared 415 custom-sort rows, 150 wishlist rows, and 10
  series rows with the same 0-pixel result. The production database currently
  contains no custom list items, so the equivalent list wrapper is source and
  regression-test verified without claiming a live populated-list result.
  Production revision identity, active service, zero restarts, PostgreSQL
  readiness, and pool state were checked after both immutable release switches.
- `R15-PERF-002` was reproduced against an expired release cache: the streamed
  response remained incomplete after 45 seconds. With the same cache row
  deliberately expired after the fix, the complete page returned HTTP 200 in
  0.91 seconds. Two concurrent stale readers share one detached revalidation,
  and focused cache, decoder, mapping, page, and API tests cover valid,
  coalesced, corrupt, fresh, cold, and upstream-failure paths.
- `R15-ACCESS-002` passed six focused phone renders across Chromium and
  WebKit in French, English, and Japanese with no responsive findings.
  `R15-ACCESS-003` renders at exactly 44 pixels in WebKit using the compiled
  application styles, and its component regression pins the shared input
  contract.
- `R15-DATA-001` verified the live 518 MB PostgreSQL database after the large
  update: 11/11 migrations applied, no invalid index, no unvalidated
  constraint, no checked ownership/place orphan, no duplicate seiyuu-credit
  key, no live job lock, and no unfinished provider batch. The five linked
  shops all resolve to stock written one day ago. The latest 223 MB database
  dump and 1.48 GB storage archive pass SHA-256 verification. Restoring the
  latest dump into a disposable database reproduced 11 migrations, 3,335 VN,
  167 collection rows, 98 owned releases, 6,788 offers, and 1,412 AliceNet
  rows with zero invalid index; the disposable database count returned to
  zero after cleanup.
- The first production matrix exposed 15 expected Firefox Basic challenge
  responses as browser errors. `R15-TEST-003` sends audit credentials
  preemptively and recovers only a challenged navigation that subsequently
  returns 200; `R15-TEST-002` pins exactly one HTTP navigation diagnostic in
  source.
- The drifting test count and unused feature-status legend were removed.
  General registry and PostgreSQL search fixtures now use neutral synthetic
  names; seven focused documentation, branding, search, and repository suites
  passed 25 tests.
- AliceNet branding remains current in production names. The canonical upstream
  host and append-only compatibility migrations necessarily retain historical
  strings; unrelated general fixtures were neutralized under `R15-DOC-003`.
