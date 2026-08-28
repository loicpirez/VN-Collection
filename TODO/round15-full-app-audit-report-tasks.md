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
| R15-RESP-001 | CRITICAL | The deterministic production matrix completed all 1,800 combinations across 40 routes, three browser engines, five viewport classes, and three locales. Chromium and Firefox completed 600 renders each with no finding. Ten WebKit renders were invalidated by SSL failures from an obsolete loopback tunnel rather than application behavior; every exact locale, viewport, and route combination was rerun against authenticated public HTTPS and completed with no finding. The final library-specific WebKit probe also sampled six virtual-scroll depths in a two-column iPhone grid with zero top-edge or bottom-edge card divergence and no horizontal overflow. | `scripts/responsive-audit.mjs`, all page routes, production | DONE |
| R15-RESP-002 | CRITICAL | The mobile library grid stretched each semantic list cell to its row height but Safari iOS could still paint the visual `VnCard` at its shorter intrinsic height. The earlier corrections removed percentage-height sizing and strengthened wrappers, but the physical-phone evidence showed that the remaining nested Grid-to-Flex sizing chain was still not reliable. In the normal library view, `VnCard` is now the semantic list item and the direct CSS Grid child, so the grid track stretches the actual painted border. Row height remains content-driven by the richest card in that row; there is no fixed global card height. Select mode retains its semantic interaction wrapper. The same automatic-size contract remains applied to custom sorting, reorderable lists, series, paginated lists, relations, and placeholder cards. Browser QA identifies the real card root and measures its border through multiple scroll positions, preventing a cover-only or wrapper-only false pass. | `src/components/VnCard.tsx`, `src/components/LibraryClient.tsx`, `src/components/SortableGrid.tsx`, `src/components/ListReorderGrid.tsx`, `scripts/browser-interactions.mjs`, card-grid call sites, responsive production audit | DONE_WITH_DIFF |
| R15-RESP-003 | CRITICAL | The library virtualizer assumed one fixed height for naturally variable card rows. Compact scrolling changed the document height by up to 81 pixels, and the remaining desktop path drifted by 245 pixels while recycling rows. Compact grids now keep the bounded API page in native CSS Grid flow. Wider ungrouped grids use React Virtuoso with each virtual item representing one complete CSS Grid row whose actual height is observed after rendering. The cards retain natural content height, cards in one row stretch to the richest card, and no card receives a fabricated global height. Production WebKit measurements over six scroll depths hold the 390-pixel view at a constant 35,296-pixel document with 167 mounted cards and 0-pixel top and bottom divergence. The 1,440-pixel view mounts only the measured row window and also keeps every row at 0-pixel divergence. | `src/components/LibraryClient.tsx`, `package.json`, `scripts/browser-interactions.mjs`, production library | DONE_WITH_DIFF |
| R15-RESP-004 | CRITICAL | The row-alignment correction stopped overlap but still made every short iPhone card inherit the richest card's row height. That changed the position of complete cards and introduced visible dead space, contrary to the natural compact card design. The ungrouped mobile library now uses a measured masonry grid: one shared `ResizeObserver` records each real card height, a one-pixel implicit grid places the next card in the first available column, and the configured 12/16-pixel gap is reserved outside the card instead of stretching its border. Desktop keeps complete-row Virtuoso measurement; grouped and custom-order views retain their existing contracts. Local WebKit and Chromium checks render all 167 cards in two columns with zero overlap, zero wrapper stretch, and observed gaps of 12 to 12.75 pixels while scrolling. | `src/components/LibraryClient.tsx`, `scripts/browser-interactions.mjs`, item-card tests | DONE_WITH_DIFF |
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
| R15-PROVIDER-001 | HIGH | All 22 configured stock providers plus AliceNet were probed from the current workstation in Japan. Real response, redirect, challenge, encoding, current markup, parser output, and no-result behavior were distinguished per provider. Generic VN stock remains on VN pages and `/stock`; AliceNet operational controls remain only on its linked shop page. | stock providers, provider scripts, stock and place pages | DONE |
| R15-PROVIDER-002 | HIGH | Mandarake's retired order host redirects item and search URLs to the current generic homepage. The integration now classifies the provider as limited/protected, reports the redirect precisely, and preserves cached offers instead of replacing them with an empty refresh. | Mandarake stock refresh and provider capabilities | DONE_WITH_DIFF |
| R15-PROVIDER-003 | HIGH | Ebten's current stock label for unavailable products was not recognized and was emitted as in stock because a price existed. The shared availability classifier now recognizes the current unavailable wording while retaining the visible price. | stock availability parser, Ebten list parser | DONE_WITH_DIFF |
| R15-PROVIDER-004 | HIGH | Trader's former mobile catalogue redirects to a current desktop MakeShop catalogue, while the parser accepted only the retired smartphone markup. The parser now handles the redirected current list, stable product identity, price, availability, used condition, edition, and online location. | Trader list parser and live redirect | DONE_WITH_DIFF |
| R15-PROVIDER-005 | MEDIUM | Getchu current list entries may expose only list price and tax-inclusive list price when no promotional price exists. The parser now keeps promotional price priority and falls back to the tax-inclusive current value, then the regular list value. | Getchu list parser | DONE_WITH_DIFF |
| R15-PROVIDER-006 | MEDIUM | Amazon JP, Otakarasouko, GEO, Yodobashi, and Bikkuri Takarajima returned HTTP 200 but no parsed offer for the original sample JAN. Live title/ASCII searches proved that the current parsers still extract 26, 1, 16, 9, and 50 offers respectively; the original zero was a legitimate no-result lookup, not a parser failure. | generic stock parsers and live Japanese provider pages | VERIFIED_EXISTING |
| R15-TEST-001 | CRITICAL | Run focused regressions during fixes, then the complete ordinary suite, PostgreSQL integration suite, exact coverage, typecheck, cold production build, QA, interactions, responsive audit, sentinel, provider checks, and production smoke gates. Completion requires exact 100 percent statements, branches, functions, and lines without ignores or threshold workarounds. | all test and QA suites | IN_PROGRESS |
| R15-DOC-001 | MEDIUM | The developer guide said all 2,406 tests must pass, while the current suite contains more than 10,000 scenarios. It now requires the complete current suite without embedding a count that immediately drifts. | `CLAUDE.md` | DONE_WITH_DIFF |
| R15-DOC-002 | LOW | The feature reference defined scaffolded and planned status symbols, but every feature used only the shipped marker. The unused states and decorative symbols were replaced with a plain shipped convention. | `FEATURES.md` | DONE_WITH_DIFF |
| R15-DOC-003 | LOW | General place-registry and PostgreSQL search fixtures contained historical Alice/Kobe and real studio wording outside migration compatibility tests. They now use neutral synthetic labels while legacy identifiers remain only where a migration contract requires them. | `tests/place-registry-page.test.ts`, `tests/postgres-search-parity.test.ts`, `tests/postgres-alicenet-repository.test.ts` | DONE_WITH_DIFF |
| R15-TEST-002 | LOW | The audit report suggested that the responsive harness appended the same non-200 HTTP issue twice. Current source emits it once; a cardinality regression now prevents the diagnostic from drifting back to duplicate output. | `scripts/responsive-audit.mjs`, `tests/qa-script-coverage.test.ts` | VERIFIED_EXISTING |
| R15-TEST-003 | MEDIUM | Firefox exposes the expected initial HTTP Basic challenge as a 401 response even when Playwright is configured for preemptive credentials, then completes the same navigation with 200. The audit now recovers only that exact navigation challenge after a verified 200 final response; final, API, and asset 401 responses remain blocking. | `scripts/responsive-audit.mjs`, `tests/qa-script-coverage.test.ts` | DONE_WITH_DIFF |
| R15-TEST-004 | HIGH | The interactive iPhone card check forced a two-column inline grid after navigation, so it could pass even if the public density preference or compiled Grid CSS regressed. It now opens the library through `density=140`, leaves the rendered styles untouched, measures the actual direct card borders at six scroll depths in Chromium and WebKit, rejects compact estimated-row virtualization, and rejects document-height drift while the user moves through the grid. | `scripts/browser-interactions.mjs`, `tests/qa-script-coverage.test.ts`, production library | DONE_WITH_DIFF |
| R15-DOC-004 | MEDIUM | Reconcile README, FEATURES, CLAUDE, operational guides, route and provider inventories, TODO status, test evidence, and production facts against the final shipped implementation. | project Markdown and operational docs | TODO |
| R15-DOC-005 | MEDIUM | The feature reference still described native restore, database backup, and the local schema browser as SQLite-only after PostgreSQL reached full production parity. Document the backend-specific `.db` and `.vncbackup` flows and the provider-neutral schema surface without rewriting the historical cutover record. | `FEATURES.md` | DONE_WITH_DIFF |
| R15-OPS-001 | CRITICAL | Commit, push, and deploy each independent correction through the immutable release workflow, then prove local, remote, and production revision identity, active service health, zero unexpected restarts, clean journals, loopback listeners, authenticated routing, rollback retention, and current application behavior. | Git remote, release store, systemd, Nginx, production | IN_PROGRESS |

## Evidence collected

- The Round 15 production responsive matrix completed all 1,800 route, engine,
  viewport, and locale combinations. Chromium and Firefox each completed 600
  renders with no finding. Ten WebKit renders were invalid because an obsolete
  loopback tunnel rewrote asset URLs to HTTPS on a plain HTTP listener. Every
  affected combination was rerun directly against authenticated public HTTPS:
  all ten completed with no finding.
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
- The final item-card contract is present in the active release
  `e44a63fb34c8ec96be85451bd140d17ea6b2481a`. WebKit and Chromium at 390 pixels report two
  columns, a 390-pixel document, and zero card top or visible-bottom divergence.
  A separate production probe using the public `density=140` preference sampled
  0, 25, 50, 75, and 100 percent of the
  virtualized grid; every visible two-card row remained aligned to zero pixels,
  without rewriting a grid style from the test. The physical screenshot at
  12:33 predates the structural card corrections committed between 12:49 and
  14:15 on the same day and is retained as regression evidence, not as evidence
  of the active release.
- A deeper compact-grid trace found that the active release still changed the
  document height from 36,123 to 36,202 pixels as virtual windows with
  different natural row heights replaced one another. The corrected mobile
  path keeps all 167 items from the bounded API page in native Grid flow while
  retaining lazy image loading. Across six WebKit scroll depths, the local
  compiled result held a constant 35,318-pixel document height, rendered all
  167 semantic card items, and kept every paired top and bottom edge at a
  zero-pixel offset. A separate 1,440 by 1,000 WebKit trace found the former
  fixed-height desktop virtualizer changing the document height by 245 pixels.
  The replacement virtualizes complete measured CSS Grid rows. In production
  release `0aac01657d76bf52f9702854f27c3ac31c065a26`, six mobile samples retained
  all 167 cards, a constant 35,296-pixel document, and 0-pixel row divergence.
  Six desktop samples mounted 55 to 104 of 167 cards, reduced total-height
  correction to 45 pixels as real rows were learned, and retained 0-pixel top
  and bottom divergence throughout. PostgreSQL readiness, exact revision
  identity, active service state, and zero restarts were verified after the
  immutable release switch.
- A post-deployment card-surface matrix completed 198 authenticated production
  renders across 11 card-heavy routes, Chromium, Firefox, WebKit, phone and
  desktop viewports, and French, English, and Japanese. It reported zero
  horizontal overflow, clipped control, undersized touch target, fixed overlay
  escape, card top offset, or card bottom offset.
- The complete instrumented suite currently passes 959 files and 10,097 tests
  at exactly 100 percent statements, branches, functions, and lines. The final
  ordinary, PostgreSQL, build, and operational gates remain open until the
  remaining audit corrections are complete.
- `R15-RESP-004` replaces only the compact ungrouped row layout. WebKit and
  Chromium at 390 by 844 pixels both mounted all 167 semantic cards in two
  measured columns. The shortest observed inter-card gap was 12 pixels, the
  largest was 12.75 pixels due to fractional device-pixel rounding, no card
  wrapper differed from its natural card height, and the card-specific
  interaction checks passed in both engines. Desktop measured-row
  virtualization remained green. The unrelated local Leaflet check timed out
  waiting for its external map container; 28 other interaction scenarios
  passed and the map result is not used as card evidence.
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
- The provider audit ran from the current workstation in Japan. Direct live
  parser checks succeeded for Eroge Price, Sofmap, Unoya, Melonbooks,
  WonderGOO, Trader, Animate, Ebten, Getchu, Gamers, Yahoo Shopping, Amazon JP,
  Otakarasouko, GEO, Yodobashi, and Bikkuri Takarajima. Surugaya and Joshin
  presented access protection and retain cached data; Mandarake redirects to a
  generic replacement homepage and is reported as limited. AmiAmi, GAMECITY,
  and Neowing remain explicit search leads rather than fabricated structured
  stock. AliceNet remains a shop-owned workflow rather than a global stock
  control surface.
