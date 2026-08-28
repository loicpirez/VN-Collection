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
| R15-AUDIT-001 | CRITICAL | The fresh application-wide source, test, browser, database, provider, documentation, and production audit is complete. Every verified defect is recorded below with its implementation and evidence; protected or unavailable provider behavior is reported as a limitation instead of a fabricated success. | whole application | DONE |
| R15-RESP-001 | CRITICAL | The deterministic production matrix completed all 1,800 combinations across 40 routes, three browser engines, five viewport classes, and three locales. Chromium and Firefox completed 600 renders each with no finding. Ten WebKit renders were invalidated by SSL failures from an obsolete loopback tunnel rather than application behavior; every exact locale, viewport, and route combination was rerun against authenticated public HTTPS and completed with no finding. The final library-specific WebKit probe also sampled six virtual-scroll depths in a two-column iPhone grid with zero top-edge or bottom-edge card divergence and no horizontal overflow. | `scripts/responsive-audit.mjs`, all page routes, production | DONE |
| R15-RESP-002 | CRITICAL | The mobile library grid stretched each semantic list cell to its row height but Safari iOS could still paint the visual `VnCard` at its shorter intrinsic height. Removing the nested sizing wrapper made the real card root measurable but did not settle the physical-device contract. This investigation is superseded by the final cross-surface vertical-cell correction in `R15-RESP-007`. | `src/components/VnCard.tsx`, `src/components/LibraryClient.tsx`, card-grid call sites, responsive production audit | DONE_WITH_DIFF |
| R15-RESP-003 | CRITICAL | The library virtualizer assumed one fixed height for naturally variable card rows. Compact scrolling changed the document height by up to 81 pixels, and the remaining desktop path drifted by 245 pixels while recycling rows. Compact grids now keep the bounded API page in native CSS Grid flow. Wider ungrouped grids use React Virtuoso with each virtual item representing one complete CSS Grid row whose actual maximum height is observed after rendering. Every card keeps its intrinsic height and the next complete row starts after the tallest card in the preceding row. No card receives a fabricated global or row height. | `src/components/LibraryClient.tsx`, `package.json`, `scripts/browser-interactions.mjs`, production library | DONE_WITH_DIFF |
| R15-RESP-004 | CRITICAL | A measured masonry attempt preserved intrinsic card height but made the two columns advance independently. Complete item cards therefore started at different vertical positions, reproducing the physical iPhone regression. Masonry measurement and one-pixel implicit rows were removed. This rejected layout is retained as regression history; it is superseded by `R15-RESP-007`. | `src/components/VnCard.tsx`, `src/components/LibraryClient.tsx`, `scripts/browser-interactions.mjs`, item-card tests | DONE_WITH_DIFF |
| R15-RESP-005 | CRITICAL | Physical-phone review rejected the remaining unequal card borders after masonry removal: shared row starts alone still left the shorter complete card visibly offset from its partner. Library-only row stretching aligned both borders without a fixed height, but the cross-surface Safari sizing cause was not yet removed. The final implementation and evidence are recorded in `R15-RESP-007`. | `src/components/VnCard.tsx`, `src/components/LibraryClient.tsx`, `scripts/browser-interactions.mjs`, item-card tests | DONE_WITH_DIFF |
| R15-RESP-006 | HIGH | Voice-credit character names used a 44-pixel minimum height in normal text flow. On touch devices that empty line box separated the visible name from its original name and credit note, producing the reported excessive seiyuu spacing. The character row now owns the 44-pixel touch height while an absolute text-column link covers the same target; all visible text returns to natural line spacing and the thumbnail remains an independent 44-pixel link. | `src/app/staff/[id]/page.tsx`, staff detail runtime tests, mobile staff detail | DONE_WITH_DIFF |
| R15-RESP-007 | CRITICAL | Physical iPhone evidence showed that the defect concerned the entire item-card border, not only its controls or footer. The shared horizontal flex cell made the card grow on the width axis while Safari resolved `height: 100%` before the CSS Grid row had its final height. Every shared VN card surface now uses an explicit vertical flex cell, so `VnCard` grows on the row-height axis without a fixed, estimated, global, or minimum card height. The final authenticated iPhone Safari profile sampled 498 real two-card rows at six scroll depths: top-edge offset, bottom-edge offset, card-to-cell offset, and horizontal overflow were all zero. The same contract is used by library, wishlist, search, lists, series, relations, tags, and reorder grids. | `src/components/VnCard.tsx`, shared item-card grids, `scripts/browser-interactions.mjs`, item-card regressions, production | DONE_WITH_DIFF |
| R15-UIUX-001 | HIGH | Complete user workflows, information hierarchy, controls, loading and empty states, card alignment, fixed surfaces, dialogs, navigation, stock and shop integration, VN detail actions, and skeleton-to-content geometry were rechecked. The final interaction suite passed all 29 workflows, and the production route/workflow probes found no remaining browser error or misplaced AliceNet control. | all user-facing surfaces | DONE |
| R15-UIUX-002 | HIGH | The shared cover-card skeleton reserved only two short lines below the image while the resolved `VnCard` uses a two-line title, facts, combined playtime, source durations, and producers. It also used a 20 px grid gap before the loaded library, wishlist, and search grids switched to 12 px. The skeleton now mirrors the real information rhythm, fills its grid row, inherits each surface's resolved gap and density contract, and drives every internal surface from one color pulse so the cover and text do not brighten independently. | `src/components/Skeleton.tsx`, `src/components/LibraryClient.tsx`, `src/components/HomePageSkeleton.tsx`, `src/app/recommendations/loading.tsx`, `src/app/recommendations/page.tsx`, `src/app/globals.css`, cover-card loading surfaces | DONE_WITH_DIFF |
| R15-UIUX-003 | HIGH | The download-status surface used a static bottom offset sized only for the collapsed quote footer. Expanding the footer could make the two fixed surfaces overlap and intercept each other's controls. The footer now publishes its measured height through a root CSS property, and the status surface stays above that live height in both collapsed and expanded states. | `src/components/QuoteFooter.tsx`, `src/components/DownloadStatusBar.tsx`, interaction QA | DONE_WITH_DIFF |
| R15-ACCESS-001 | HIGH | Landmarks, accessible names, keyboard and touch operation, focus containment and return, disclosure semantics, color-independent states, reduced motion, 44-pixel touch targets, and overlay ordering were rechecked in source and compiled browsers. The final automated accessibility pass covered 40 routes at phone and desktop widths with zero finding across 80 renders. | application shell, components, all page routes | DONE |
| R15-ACCESS-002 | HIGH | The activity filter toolbar kept three flexible fields plus actions on one wrapping row without a mobile minimum for the kind and entity fields. At 390 pixels those two controls shrank to 43.4 pixels wide. It now uses an explicit responsive field grid that gives every filter a full mobile row and intentional wider breakpoints. | `src/app/activity/page.tsx` | DONE_WITH_DIFF |
| R15-ACCESS-003 | HIGH | WebKit rendered the VNDB release-list status select at 22 pixels high because the bespoke select style relied on `min-height`, which the native control did not honor consistently. The control now uses the shared input primitive with an explicit 44-pixel select height. | `src/components/VndbReleaseListPanel.tsx` | DONE_WITH_DIFF |
| R15-ACCESS-004 | HIGH | The map privacy action was visible before client hydration, so an immediate tap could look accepted while no React event listener existed. Consent, dismiss, and restore actions are now disabled until a hydration-ready marker is published; interaction QA waits for that contract and verifies the Leaflet surface and dialogs afterward. | `src/components/MapPrivacyControl.tsx`, map interaction QA | DONE_WITH_DIFF |
| R15-I18N-001 | HIGH | French, English, and Japanese dictionary parity, placeholders, platform names, dates, times, numbers, currencies, upstream errors, document language, and localized responsive overflow were rechecked. The final 1,800-render responsive matrix exercised all three locales on every audited route and viewport with zero finding. | i18n dictionaries, formatters, all UI surfaces | DONE |
| R15-I18N-002 | HIGH | The per-VN local/VNDB conflict resolver preserved ISO calendar dates correctly over the API but rendered start and finish differences as raw `YYYY-MM-DD` strings. Both comparison columns now use the active FR/EN/JA locale while synchronization snapshots remain unchanged ISO values. | `src/components/VndbStatusPanel.tsx`, VNDB status component regressions | DONE_WITH_DIFF |
| R15-SEC-001 | CRITICAL | API authorization policy, reverse-proxy trust, CSRF, SSRF and DNS pinning, input and body bounds, safe links, uploads, file paths, credential masking, error sanitization, headers, rate limits, and dependencies were rechecked. The dependency audit reports zero known production vulnerability; production publishes the required transport, content, frame, referrer, permissions, and strict session-cookie protections. | APIs, proxy, network clients, deployment configuration | DONE |
| R15-PERF-001 | HIGH | Bounded queries, indexes, pagination and virtualization, shared-request cancellation, hidden-tab behavior, image loading, polling and SSE lifecycles, background jobs, PostgreSQL pool pressure, provider isolation, browser memory, and production query plans were rechecked. The measured-row desktop virtualizer and native compact grid remain bounded and aligned; production stayed active with zero restart and no waiting PostgreSQL connection under the final concurrent browser matrix. | application runtime, repositories, jobs, production | DONE |
| R15-PERF-002 | HIGH | An expired release-detail cache blocked the streamed page while the throttled VNDB client exhausted primary retries and then mirror retries. On the audited workstation the route emitted its shell in about half a second but remained incomplete beyond 45 seconds, while the same production route with a fresh cache completed in 1.2 seconds. Release-by-id reads now serve a structurally valid expired row immediately and coalesce one background revalidation. Corrupt expired rows still wait for a validated upstream response, and cold misses, batch downloads, explicit synchronizations, cancellation, and the general cache policy are unchanged. | `src/lib/vndb-cache.ts`, `src/lib/vndb.ts`, release detail and API routes | DONE_WITH_DIFF |
| R15-TYPE-001 | HIGH | Strict external decoders, persisted JSON validation, unsafe casts, suppression directives, coverage exclusions, exported contracts, and backend parity were rechecked. Typecheck and production build pass, and the final source scan found no TypeScript or coverage suppression directive. | `src`, `tests`, `scripts` | DONE |
| R15-TYPE-002 | LOW | The legacy VN-page stability probe accessed Chromium's non-standard heap metric through a JSDoc `any` cast. It now reads the optional property through reflection and validates the object and numeric field before use. | `scripts/r5-204-vn-page-stability.mjs`, QA script regression | DONE_WITH_DIFF |
| R15-DATA-001 | CRITICAL | The live PostgreSQL database is healthy after the large VN update: all 11 manifest migrations are applied; readiness reports an available database and bounded pool; no index is invalid or unready; no constraint is unvalidated; the checked collection, owned-release, series, and place-link relations have no orphan; the seiyuu-credit uniqueness key has no duplicate group; and no active job lock or unfinished provider batch remains. All five linked shops derive freshness from stock written one day ago, so the former 11/12-day stale labels are no longer supported by current data. The latest 223 MB PostgreSQL dump and 1.48 GB storage archive pass their recorded SHA-256 checksums. The latest dump was restored into an isolated temporary database, reproduced all 11 migrations and the live principal row counts with zero invalid indexes, and the temporary database was removed afterward. | production PostgreSQL, backup timers, latest database and storage archives, isolated restore | DONE |
| R15-DATA-002 | HIGH | The VNDB vote editor multiplied by ten and rounded, so an unsupported value with two decimal places could silently change before upload. The client now distinguishes range from precision errors, accepts only exactly representable tenths from 1.0 through 10.0, and leaves the draft untouched until the user corrects it. | `src/components/VndbStatusPanel.tsx`, i18n dictionaries, VNDB status component regressions | DONE_WITH_DIFF |
| R15-PROVIDER-001 | HIGH | All 22 configured stock providers plus AliceNet were probed from the current workstation in Japan. Real response, redirect, challenge, encoding, current markup, parser output, and no-result behavior were distinguished per provider. Generic VN stock remains on VN pages and `/stock`; AliceNet operational controls remain only on its linked shop page. | stock providers, provider scripts, stock and place pages | DONE |
| R15-PROVIDER-002 | HIGH | Mandarake's retired order host redirects item and search URLs to the current generic homepage. The integration now classifies the provider as limited/protected, reports the redirect precisely, and preserves cached offers instead of replacing them with an empty refresh. | Mandarake stock refresh and provider capabilities | DONE_WITH_DIFF |
| R15-PROVIDER-003 | HIGH | Ebten's current stock label for unavailable products was not recognized and was emitted as in stock because a price existed. The shared availability classifier now recognizes the current unavailable wording while retaining the visible price. | stock availability parser, Ebten list parser | DONE_WITH_DIFF |
| R15-PROVIDER-004 | HIGH | Trader's former mobile catalogue redirects to a current desktop MakeShop catalogue, while the parser accepted only the retired smartphone markup. The parser now handles the redirected current list, stable product identity, price, availability, used condition, edition, and online location. | Trader list parser and live redirect | DONE_WITH_DIFF |
| R15-PROVIDER-005 | MEDIUM | Getchu current list entries may expose only list price and tax-inclusive list price when no promotional price exists. The parser now keeps promotional price priority and falls back to the tax-inclusive current value, then the regular list value. | Getchu list parser | DONE_WITH_DIFF |
| R15-PROVIDER-006 | MEDIUM | Amazon JP, Otakarasouko, GEO, Yodobashi, and Bikkuri Takarajima returned HTTP 200 but no parsed offer for the original sample JAN. Live title/ASCII searches proved that the current parsers still extract 26, 1, 16, 9, and 50 offers respectively; the original zero was a legitimate no-result lookup, not a parser failure. | generic stock parsers and live Japanese provider pages | VERIFIED_EXISTING |
| R15-TEST-001 | CRITICAL | Focused regressions, the complete ordinary suite, PostgreSQL integration suite, exact coverage, typecheck, cold production build, DOM QA, interaction QA, responsive audit, sentinel, provider checks, and isolated smoke gates all pass. Instrumented coverage is exactly 100 percent statements, branches, functions, and lines without ignore directives or threshold workarounds. | all test and QA suites | DONE |
| R15-DOC-001 | MEDIUM | The developer guide said all 2,406 tests must pass, while the current suite contains more than 10,000 scenarios. It now requires the complete current suite without embedding a count that immediately drifts. | `CLAUDE.md` | DONE_WITH_DIFF |
| R15-DOC-002 | LOW | The feature reference defined scaffolded and planned status symbols, but every feature used only the shipped marker. The unused states and decorative symbols were replaced with a plain shipped convention. | `FEATURES.md` | DONE_WITH_DIFF |
| R15-DOC-003 | LOW | General place-registry and PostgreSQL search fixtures contained historical Alice/Kobe and real studio wording outside migration compatibility tests. They now use neutral synthetic labels while legacy identifiers remain only where a migration contract requires them. | `tests/place-registry-page.test.ts`, `tests/postgres-search-parity.test.ts`, `tests/postgres-alicenet-repository.test.ts` | DONE_WITH_DIFF |
| R15-TEST-002 | LOW | The audit report suggested that the responsive harness appended the same non-200 HTTP issue twice. Current source emits it once; a cardinality regression now prevents the diagnostic from drifting back to duplicate output. | `scripts/responsive-audit.mjs`, `tests/qa-script-coverage.test.ts` | VERIFIED_EXISTING |
| R15-TEST-003 | MEDIUM | Firefox exposes the expected initial HTTP Basic challenge as a 401 response even when Playwright is configured for preemptive credentials, then completes the same navigation with 200. The audit now recovers only that exact navigation challenge after a verified 200 final response; final, API, and asset 401 responses remain blocking. | `scripts/responsive-audit.mjs`, `tests/qa-script-coverage.test.ts` | DONE_WITH_DIFF |
| R15-TEST-004 | HIGH | The interactive iPhone card check forced a two-column inline grid after navigation, so it could pass even if the public density preference or compiled Grid CSS regressed. It now opens the library through `density=140`, leaves the rendered styles untouched, measures the actual direct card borders at six scroll depths in Chromium and WebKit, rejects compact estimated-row virtualization, and rejects document-height drift while the user moves through the grid. | `scripts/browser-interactions.mjs`, `tests/qa-script-coverage.test.ts`, production library | DONE_WITH_DIFF |
| R15-TEST-005 | HIGH | Vitest workers accumulated generated test directories because process-exit cleanup is not guaranteed when workers are force-terminated. The audit found 93,902 abandoned directories consuming about 51 GB. Test setup now performs deterministic suite cleanup with an exit fallback; focused and complete coverage runs leave zero generated test directory behind. | `tests/setup.ts`, complete test and coverage gates | DONE_WITH_DIFF |
| R15-DOC-004 | MEDIUM | README, FEATURES, CLAUDE, operational guides, route and provider inventories, TODO status, test evidence, and production facts were reconciled against the final shipped implementation. All 52 tracked Markdown files pass the local-link audit. | project Markdown and operational docs | DONE |
| R15-DOC-005 | MEDIUM | The feature reference still described native restore, database backup, and the local schema browser as SQLite-only after PostgreSQL reached full production parity. Document the backend-specific `.db` and `.vncbackup` flows and the provider-neutral schema surface without rewriting the historical cutover record. | `FEATURES.md` | DONE_WITH_DIFF |
| R15-OPS-001 | CRITICAL | Every independent correction was committed, pushed, and deployed through the immutable release workflow. Local HEAD, `origin/main`, and the active release were identical at the operational verification point; the service was active with zero restart, readiness reported PostgreSQL available with no waiting connection, authenticated public routing passed, and the final item-card probe ran against that active release. | Git remote, release store, systemd, Nginx, production | DONE |

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
- The item-card investigation explicitly treated the whole bordered card as the
  measured surface. Earlier direct-grid and masonry attempts are retained in
  the task history because they did not satisfy the physical iPhone evidence.
  The root cause was the shared horizontal flex cell: its `flex: 1` child grew
  on the width axis while iOS Safari could resolve the child's percentage
  height before the Grid row was final. The shipped vertical flex cell makes
  the card grow on the row-height axis and introduces no fixed, estimated,
  global, or minimum card height.
- The final authenticated production probe uses Playwright's complete iPhone
  device descriptor, including mobile Safari user agent, touch, device scale,
  and viewport. It leaves the rendered Grid styles untouched and samples six
  scroll depths. Across 498 two-card rows, maximum top-edge divergence,
  bottom-edge divergence, card-to-cell top offset, and card-to-cell bottom
  offset were all 0 pixels. Every cell computed to `flex-direction: column`,
  every card computed to `flex: 1 1 0%`, the grid stayed at two columns, and
  horizontal overflow was 0 pixels.
- The same stretch-cell contract is present in library, wishlist, search,
  custom lists, series, relations, tags, sortable grids, and reorder grids.
  Focused source and runtime regressions cover every call site. The final
  interaction suite rechecks WebKit and Chromium compact rows plus measured
  desktop virtualization and passes 29 of 29 workflows.
- The final production responsive matrix completed 1,800 authenticated renders:
  40 routes, five viewport classes, three locales, and Chromium, Firefox, and
  WebKit. It reported zero card-edge, horizontal-overflow, clipped-control,
  touch-target, fixed-surface, or locale-layout finding.
- Exact instrumented coverage passes 959 files and 10,102 tests with
  45,666/45,666 statements, 38,766/38,766 branches, 9,344/9,344 functions, and
  39,023/39,023 lines. The final ordinary suite passes 958 files and 10,007
  tests; PostgreSQL integration passes 95 tests; typecheck and the cold
  production build pass; sentinel, DOM QA, and interaction QA each pass 29 of
  29 checks; the isolated route/API smoke passes 39 of 39 checks.
- `R15-RESP-006` was measured on a populated voice-credit page at 390 by 844
  pixels. WebKit and Chromium both render a 44-pixel character row, 44-pixel
  thumbnail link, and 44-pixel text-column link while the visible name and
  original-name lines remain 16.5 and 15 pixels high with zero extra gap and
  zero horizontal overflow.
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
- The final accessibility pass covered all 40 audited routes at phone and
  desktop widths. Across 80 production renders it found no duplicate ID,
  unnamed control, unlabeled field, missing image alternative, unnamed dialog,
  broken ARIA reference, unsafe tab index, unsafe external link, or missing
  main landmark.
- The quote footer publishes its measured height through
  `--quote-footer-height`; interaction QA proves that the download status stays
  clear of both collapsed and expanded footer states. Map privacy actions stay
  disabled until `data-map-privacy-ready=true`, after which consent opens the
  Leaflet surface and place dialogs remain above map panes.
- Current VN and staff skeleton fixtures were rendered with compiled
  application CSS in Chromium, Firefox, and WebKit at phone and desktop sizes.
  Cover ratios, visible placeholder counts, parent-owned pulse animation,
  non-animated child surfaces, and horizontal bounds all matched the resolved
  page geometry. No stale fixture result was accepted as current evidence.
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
- The production dependency audit reports zero known vulnerability across 298
  packages. Live responses publish HSTS, CSP, content-type, frame, referrer,
  and permissions protections; the session cookie is Secure, HttpOnly, and
  SameSite Strict. Under the concurrent responsive matrix the service remained
  active with zero restart, and the PostgreSQL pool reported no waiting client.
- All 52 tracked Markdown files pass the local-link audit. The source scan found
  no TypeScript suppression or coverage-ignore directive. Vitest now removes
  worker-owned temporary directories in suite cleanup as well as process-exit
  fallback; focused and complete runs leave zero `vndb-test-*` directory.
- The provider audit ran from the current workstation in Japan. Direct live
  parser checks succeeded for Eroge Price, Sofmap, Unoya, Melonbooks,
  WonderGOO, Trader, Animate, Ebten, Getchu, Gamers, Yahoo Shopping, Amazon JP,
  Otakarasouko, GEO, Yodobashi, and Bikkuri Takarajima. Surugaya and Joshin
  presented access protection and retain cached data; Mandarake redirects to a
  generic replacement homepage and is reported as limited. AmiAmi, GAMECITY,
  and Neowing remain explicit search leads rather than fabricated structured
  stock. AliceNet remains a shop-owned workflow rather than a global stock
  control surface.
- The final operational verification matched local HEAD, `origin/main`, and the
  active immutable release. Systemd reported the application active with zero
  restart; readiness reported PostgreSQL available with pool max 10, one idle
  connection, and zero waiting connection. The authenticated iPhone item-card
  probe was rerun after the release switch and retained all zero-offset results.
