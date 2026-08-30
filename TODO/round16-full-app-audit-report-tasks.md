# Round 16 full application audit - 2026-08-30

This report audits the current application after the local seiyuu index, the
reviewed local-library-to-VNDB import, and the producer-credit hydration fix.
It covers source contracts, user workflows, UI/UX, responsive behavior,
accessibility, French/English/Japanese localization, security, typing,
performance, SQLite/PostgreSQL parity, testing, documentation, deployment, and
the active production database. Round 15 remains the immediately preceding
full 40-route browser baseline; Round 16 independently checks all source and
test surfaces and adds the new route to the 41-route inventory, with a focused
90-render production matrix for the changed seiyuu and producer surfaces.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R16-AUDIT-001 | CRITICAL | The post-feature application-wide audit is complete. Verified regressions were fixed and deployed before closure; prior evidence was treated only as a baseline and not as proof for the new surfaces. | whole application | DONE |
| R16-FEATURE-001 | HIGH | The application lacked a dedicated local seiyuu browser despite having extensive voice-credit data. Ship a fully local, paginated index with collection scope, search, language and minimum-credit filters, rankings, representative roles, density controls, navigation, and FR/EN/JA copy. | `src/app/seiyuu`, voice-actor repositories, navigation and dictionaries | DONE_WITH_DIFF |
| R16-FEATURE-002 | CRITICAL | Locally owned mapped games and releases could not be reviewed and written to the authenticated VNDB account. Ship an explicit preview/select/confirm workflow with permission checks, remote-state revalidation, conflict reporting, bounded batches, progress, pagination, and clear ineligible synthetic-game reporting. | `src/components/VndbLocalImportPanel.tsx`, `src/app/api/vndb/import-local-library/route.ts`, VNDB import libraries | DONE_WITH_DIFF |
| R16-BUG-001 | CRITICAL | A producer page could render an authoritative zero when its association cache was missing because the page requested cache-only data. Use cache-first hydration, refresh missing or stale associations from VNDB, and retain a usable fallback only when both reads fail. | `src/components/ProducerVnsSections.tsx`, producer page tests | DONE_WITH_DIFF |
| R16-BUG-002 | CRITICAL | The new seiyuu PostgreSQL ranking wrapped the projected `primary_name` alias inside a function in `ORDER BY`; PostgreSQL resolved it as a missing column, so the initial shell loaded and React later entered the route error boundary. Order by the joined `n.va_name` expression and execute the repository contract against a real migrated PostgreSQL schema. | `src/lib/db/repositories/voice-actors.ts`, PostgreSQL unit and integration tests | DONE_WITH_DIFF |
| R16-UIUX-001 | HIGH | Seiyuu now exposes the local data as a task-focused index rather than duplicating the general staff browser. Filters preserve URL state, collection overlap is visible without color-only meaning, cards retain concise hierarchy, and empty, loading, filtered, and paginated states are explicit. | `src/app/seiyuu/page.tsx`, `src/app/seiyuu/loading.tsx`, `src/app/seiyuu/error.tsx` | DONE |
| R16-UIUX-002 | HIGH | The VNDB import avoids an unsafe one-click bulk write. Preview and apply are separate operations, individual rows are selectable, current remote state is shown, writes require confirmation, progress is determinate, and per-item failures remain visible. | VNDB import settings panel and API | DONE |
| R16-RESP-001 | HIGH | The responsive inventory still expected 40 pages and omitted the new seiyuu route. Add Seiyuu to the canonical 41-route matrix and to the fast production sentinel so future audits cannot silently skip it. | `scripts/responsive-audit.mjs`, `scripts/frontend-regression-sentinel.mjs`, QA script regression | DONE_WITH_DIFF |
| R16-RESP-002 | HIGH | Every seiyuu card title link measured only 24 pixels high on touch devices. Apply the shared 44-pixel tap-target contract, which automatically returns to intrinsic sizing on fine-pointer desktop layouts. The corrected page passes all 45 engine, viewport, and locale combinations with no overflow, clipping, fixed-surface, browser-error, or touch-target finding. | `src/app/seiyuu/page.tsx`, production responsive audit | DONE_WITH_DIFF |
| R16-ACCESS-001 | HIGH | The new workflows were checked for landmarks, labels, native form semantics, keyboard operation, progress semantics, color-independent state, focusable pagination, image alternatives, and 44-pixel touch targets. The only measured accessibility regression was the seiyuu title target recorded in R16-RESP-002. | Seiyuu and VNDB import surfaces | DONE |
| R16-I18N-001 | HIGH | New user-visible copy, filter state, errors, counts, language names, progress, and import outcomes are present in French, English, and Japanese with dictionary-key parity and locale-aware number rendering. The responsive matrix exercised all three locales. | dictionaries, Seiyuu, VNDB import | DONE |
| R16-SEC-001 | CRITICAL | The new import endpoint is protected by the shared localhost/token gate, accepts bounded decoded actions and snapshots, revalidates local and remote state before writes, and never trusts preview output as apply authority. The complete API policy suite retains the gate across all 125 route modules. | API routes, auth gate, VNDB import decoder and tests | DONE |
| R16-SEC-002 | HIGH | The production dependency audit reports no known vulnerability among 298 audited packages. Source scans found no TypeScript suppression or coverage-ignore directive, and no secret value was written to the report or command output. | dependencies, `src`, `tests`, `scripts` | DONE |
| R16-PERF-001 | HIGH | Seiyuu performs bounded server pagination at 48 rows, limits representative roles and aliases, uses indexed local credits, and reuses the shared lazy image component. VNDB import reads remote IDs in bounded pages and applies selected changes in bounded batches, with progress and cancellation-safe request boundaries. | voice-actor repository, VNDB import libraries and UI | DONE |
| R16-TYPE-001 | HIGH | New request/response and persisted-data boundaries use explicit decoders and concrete types; typecheck and the production build pass without weakening types or adding suppression directives. | changed source and tests | DONE |
| R16-DATA-001 | CRITICAL | The active PostgreSQL database reports 11 migrations, zero invalid or unready index, zero unvalidated constraint, zero active application lock, and zero duplicate voice-credit key. It contains 3,356 VN rows, 182 collection rows, and 21,648 voice-credit rows; readiness reports an available database and a bounded pool with no waiting connection. | production PostgreSQL and health endpoint | DONE |
| R16-TEST-001 | CRITICAL | Focused Seiyuu, producer, import, API-policy, i18n, typing, build, real PostgreSQL, responsive, sentinel, documentation, and exact instrumented coverage gates pass. Global coverage is exactly 100 percent statements, branches, functions, and lines without exclusions or threshold workarounds. | complete test and QA suites | DONE |
| R16-DOC-001 | MEDIUM | The active TODO index did not describe the post-feature audit and the responsive inventory count was stale. Record Round 16 as active, retain Round 15 as completed evidence, and keep all task IDs unique and status values valid. All 52 tracked Markdown files resolve their local links. | `TODO/README.md`, this report, audit tracker tests | DONE_WITH_DIFF |
| R16-OPS-001 | CRITICAL | Each functional correction was committed, pushed, and deployed as an immutable release. Production runs PostgreSQL, the service is active with zero restart, health is ready, and final local HEAD, remote main, active release, runtime route, and browser evidence are reconciled before closure. | Git remote, release store, systemd, production | DONE |

## Evidence collected

- The Seiyuu feature, reviewed VNDB import, and producer-credit fix were shipped
  as separate commits and immutable releases.
- The first production responsive run reproduced a server-component failure in
  every Seiyuu combination. Production logs identified PostgreSQL error 42703
  on `primary_name`; a real migrated-PostgreSQL integration test now executes
  the corrected ranking query.
- The second run had no server or browser error, but identified 48 undersized
  card-title targets per touch render. After the shared target correction, all
  45 Seiyuu combinations passed across Chromium, Firefox, WebKit, five viewport
  classes, and three locales. The 45 producer-detail combinations had already
  passed in the preceding run, for 90 changed-surface renders in total.
- The fast production sentinel passes 32 checks, including stable localized
  markers for both Seiyuu scopes.
- The real PostgreSQL suite applies the shipped migration manifest in isolated
  schemas and passes the voice-actor ranking query that failed in production.
- The active production database has 11 migrations, no invalid index, no
  unvalidated constraint, no active application lock, and no duplicate
  voice-credit key. Health reports PostgreSQL available with no waiting client.
- The production dependency audit inspected 298 packages and found zero known
  vulnerability. Source scans found no TypeScript or coverage suppression and
  the shared route-policy tests cover all API modules.
- All 52 tracked Markdown files pass the local-link audit.
- The ordinary suite passes 968 files and 10,076 tests. Exact instrumented
  coverage plus PostgreSQL integration passes 969 files and 10,172 tests with
  46,228/46,228 statements, 39,244/39,244 branches, 9,457/9,457 functions, and
  39,503/39,503 lines.
- Typecheck and the cold production build pass. The active immutable commit is
  reconciled after this report is committed and deployed.
