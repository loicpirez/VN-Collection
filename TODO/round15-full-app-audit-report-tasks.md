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
| R15-RESP-002 | CRITICAL | The mobile library grid stretched each semantic list cell to its row height but left the visual `VnCard` at its intrinsic height. Cards with one fewer metadata line ended 18 pixels above their sibling even though the next row used the taller track, creating visibly broken borders and empty inter-row gaps. The card wrapper now uses Flex stretching and the card fills that one row only; browser QA measures visible card bottoms instead of the already-aligned wrapper cells. | `src/components/VnCard.tsx`, `src/components/LibraryClient.tsx`, responsive production audit | DONE_WITH_DIFF |
| R15-UIUX-001 | HIGH | Recheck complete user workflows, information hierarchy, controls, loading and empty states, card alignment, fixed surfaces, dialogs, navigation, stock and shop integration, VN detail actions, and skeleton-to-content geometry. Add each concrete defect as an independent row before changing behavior. | all user-facing surfaces | IN_PROGRESS |
| R15-ACCESS-001 | HIGH | Recheck landmarks, accessible names, keyboard and touch operation, focus containment and return, disclosure semantics, color-independent states, reduced motion, 44-pixel touch targets, and overlay ordering in source and compiled browsers. | application shell, components, all page routes | IN_PROGRESS |
| R15-ACCESS-002 | HIGH | The activity filter toolbar kept three flexible fields plus actions on one wrapping row without a mobile minimum for the kind and entity fields. At 390 pixels those two controls shrank to 43.4 pixels wide. It now uses an explicit responsive field grid that gives every filter a full mobile row and intentional wider breakpoints. | `src/app/activity/page.tsx` | DONE_WITH_DIFF |
| R15-ACCESS-003 | HIGH | WebKit rendered the VNDB release-list status select at 22 pixels high because the bespoke select style relied on `min-height`, which the native control did not honor consistently. The control now uses the shared input primitive with an explicit 44-pixel select height. | `src/components/VndbReleaseListPanel.tsx` | DONE_WITH_DIFF |
| R15-I18N-001 | HIGH | Recheck French, English, and Japanese dictionary parity, placeholders, hardcoded copy, platform names, dates, times, numbers, currencies, upstream errors, document language, and responsive overflow caused by localized strings. | i18n dictionaries, formatters, all UI surfaces | IN_PROGRESS |
| R15-SEC-001 | CRITICAL | Recheck API authorization policy, reverse-proxy trust, CSRF, SSRF and DNS pinning, input and body bounds, safe links, uploads, file paths, credential masking, error sanitization, headers, rate limits, and dependency vulnerabilities. | APIs, proxy, network clients, deployment configuration | IN_PROGRESS |
| R15-PERF-001 | HIGH | Recheck bounded queries, indexes, pagination and virtualization, shared-request cancellation, hidden-tab behavior, image loading, polling and SSE lifecycles, background jobs, PostgreSQL pool pressure, provider isolation, browser memory, and production query plans. | application runtime, repositories, jobs, production | IN_PROGRESS |
| R15-TYPE-001 | HIGH | Recheck strict external decoders, persisted JSON validation, unsafe casts, suppression directives, coverage exclusions, exported contracts, and backend parity. | `src`, `tests`, `scripts` | IN_PROGRESS |
| R15-DATA-001 | CRITICAL | Recheck the live PostgreSQL migration state, constraints, indexes, pool, integrity, stock freshness, collection and media counts, backup checksums, and isolated restore evidence after the recent large VN update. | production PostgreSQL and backup operations | TODO |
| R15-PROVIDER-001 | HIGH | Probe every configured stock provider from the current workstation in Japan, classify real response and parser behavior without guessing, preserve cached offers for protected providers, and verify generic stock plus AliceNet shop-only workflows. | stock providers, provider scripts, stock and place pages | TODO |
| R15-TEST-001 | CRITICAL | Run focused regressions during fixes, then the complete ordinary suite, PostgreSQL integration suite, exact coverage, typecheck, cold production build, QA, interactions, responsive audit, sentinel, provider checks, and production smoke gates. Completion requires exact 100 percent statements, branches, functions, and lines without ignores or threshold workarounds. | all test and QA suites | TODO |
| R15-DOC-001 | MEDIUM | The developer guide still says all 2,406 tests must pass, while the current suite contains more than 10,000 scenarios. Replace the drifting count with an evidence-safe rule tied to the complete current suite and exact coverage gate. | `CLAUDE.md` | TODO |
| R15-DOC-002 | LOW | The feature reference defines scaffolded and planned status symbols, but every feature uses only the shipped marker. Remove the unused legend states or accurately classify unfinished features so the catalogue does not imply undocumented work. | `FEATURES.md` | TODO |
| R15-DOC-003 | LOW | General place-registry and PostgreSQL search fixtures still contain historical Alice/Kobe and real studio wording outside the migration compatibility tests. Replace them with neutral synthetic labels while preserving legacy identifiers only where a migration contract requires them. | `tests/place-registry-page.test.ts`, `tests/postgres-search-parity.test.ts`, `tests/postgres-alicenet-repository.test.ts` | TODO |
| R15-TEST-002 | LOW | The responsive audit appends the same non-200 HTTP issue twice, making one failure look like two findings. Emit one deterministic diagnostic and add a source regression so audit evidence remains countable. | `scripts/responsive-audit.mjs`, QA script tests | TODO |
| R15-TEST-003 | MEDIUM | Firefox exposes the expected initial HTTP Basic challenge as a 401 response before Playwright retries with credentials, so the responsive audit reports one browser error for the first route in every Firefox context despite a successful final navigation. Send configured audit credentials preemptively and retain real 401 responses as failures. | `scripts/responsive-audit.mjs`, QA script tests | TODO |
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
- `R15-RESP-002` is deployed as commit `57766e0b`. A two-column WebKit mobile
  run sampled scroll positions from 0 through 12,000 pixels with virtualized
  rows and measured 0 pixels of top-edge and visible-bottom divergence at
  every sample. The production release, Git revision, active service, zero
  restart count, PostgreSQL readiness, and pool state were checked after the
  immutable release switch.
- `R15-ACCESS-002` passed six focused phone renders across Chromium and
  WebKit in French, English, and Japanese with no responsive findings.
  `R15-ACCESS-003` renders at exactly 44 pixels in WebKit using the compiled
  application styles, and its component regression pins the shared input
  contract.
- AliceNet branding remains current in production names. The canonical upstream
  host and append-only compatibility migrations necessarily retain historical
  strings; three unrelated fixtures still need neutralization under
  `R15-DOC-003`.
