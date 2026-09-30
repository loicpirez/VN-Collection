# VN Collection full application audit

Audit date: 2026-10-01

This report combines a source and repository review, a three-engine browser
inspection, responsive and stateful interaction checks, the complete automated
test suite, and a read-only inspection of the active production host and
PostgreSQL database. Secrets, environment files, authentication files, and the
archived `data.old` tree were not opened.

## Executive assessment

The application was healthy and fast, but ten gaps remained after the previous
release: full-download work was not durable, application token authentication
did not cover browser documents, backups were local-only, the script policy
allowed inline JavaScript, several locale and stateful responsive paths were
unfinished, one safe credit identity was not enforced, cache retention was
undefined, HTTP/2 was disabled, and the host required security maintenance.

This release closes the application and operational parts of that backlog. It
adds a persisted two-slot queue with leases and restart recovery, applies one
authentication boundary to documents, RSC, static assets, and APIs, replaces
script `unsafe-inline` with per-request nonces, completes plural and language
feedback, expands stateful browser coverage, enforces the verified staff-credit
identity, and provides tested automation for encrypted off-host backups,
restore drills, cache pruning, HTTP/2, and host maintenance.

## Production evidence before delivery

| Area | Observed state |
| --- | --- |
| Active release | Immutable release `6f3783dc810ef037b636d49e8d22cf5dbfa60f8e` |
| Services | `vndb`, PostgreSQL, and nginx active; application restart count zero |
| Runtime | Next.js 16.3.2 on Node.js 22.22.2 |
| Database | PostgreSQL 16.15, 58 tables, 153 indexes, zero invalid indexes and zero deadlocks |
| Network | Application and PostgreSQL bound to loopback; firewall default deny; only SSH, HTTP, and HTTPS exposed |
| HTTP security | HTTPS redirect, reverse-proxy Basic authentication, HSTS, CSP, frame restrictions, no-sniff, referrer policy, and permissions policy |
| Local backups | Daily PostgreSQL custom dumps and weekly storage archives with SHA-256 sidecars and 35-day retention |
| Capacity | Root filesystem 16 percent used with 349 GB free after immutable-release pruning |
| Maintenance | Kernel 6.8.0-117, reboot required, and approximately 50 package updates pending |

## Findings and actions

### Security and access control

| Severity | Finding | Action |
| --- | --- | --- |
| High | Token mode protected API routes while server-rendered HTML and RSC could read personal data directly. | The global proxy now challenges every application path when public-read authentication is enabled. Bearer and explicit token clients remain compatible, and browser Basic authentication uses the same constant-time token check. The production reverse-proxy boundary remains in place. |
| Medium | `script-src` allowed `unsafe-inline`. | CSP now uses an unpredictable per-request nonce, forwards it to the root layout for Next.js-generated scripts, and keeps `unsafe-eval` limited to development. Script `unsafe-inline` is absent. |
| Medium | The bootstrap URL scrubber had to operate without leaking its token into history. | The nonce-authorized scrubber still removes sensitive query parameters before hydration; the proxy and Basic browser flow remove the need to carry a token in routine navigation. |

### Durable full-download work

| Severity | Finding | Action |
| --- | --- | --- |
| High | One request could start hundreds of detached workflows with no persisted state, deduplication, lease, concurrency bound, or restart recovery. | SQLite and PostgreSQL now persist one row per VN. Enqueue is idempotent while work is active, two cluster-wide leases bound concurrency, item leases are renewed during long phases, each phase checkpoint and bounded error list is durable, expired work is reclaimed, startup wakes the worker, and shutdown stops new polling. |
| Medium | Users could not distinguish accepted work from process-local work. | The API returns queued counts, and the existing status surface reads durable queue rows including phase progress, errors, start, and finish times. |

### UI, UX, responsive behavior, accessibility, and i18n

| Severity | Finding | Action |
| --- | --- | --- |
| Medium | Count strings embedded fixed singular or plural wording. | Added localized `one` and `other` forms and locale-aware count formatting for affected Seiyuu, stock, place, producer, and import surfaces. |
| Medium | The language switcher exposed locale codes and gave weak transition feedback. | Added French, English, and Japanese autonyms, optimistic selection, disabled pending actions, and `aria-busy` semantics. |
| Medium | Conditional modals and error states were underrepresented in browser geometry checks. | Added deterministic QA routes and live interactions for the physical-bundle loaded state, mixed-stock tabs, VNDB import conflicts, the global error boundary, narrow detail navigation, and settings and recommendation states. |
| Low | Some data-heavy pages performed work before the visible branch needed it. | Producer detail rendering now reuses cached server data and avoids duplicate fetch work while preserving pagination and locale behavior. |

### Data integrity, cache, backup, and host operations

| Severity | Finding | Action |
| --- | --- | --- |
| Medium | Credit tables lacked formal primary keys. | Production data and indexes were audited. `(vn_id, sid, role)` is unique for `vn_staff_credit` and is promoted to the PostgreSQL primary key by a guarded migration. The voice-credit candidates are not unique, so no unsafe constraint is added; the evidence and future normalization path are documented. |
| Medium | The VNDB cache dominated database growth without a measured retention policy. | Added a bounded batch-prune command, dry-run and apply modes, a systemd service and timer, retention documentation, and tests. The policy retains recently used rows and prunes in small transactions. |
| High | Local backups shared the host failure domain. | Added encrypted rclone replication, strict configuration permissions, SHA-256 verification, a scheduled restore drill into an isolated temporary PostgreSQL database and storage directory, freshness checks, systemd services and timers, and a disaster-recovery runbook. |
| Medium | Public nginx negotiated HTTP/1.1 only. | Added an idempotent nginx configuration helper that validates configuration, reloads nginx, and verifies external HTTP/2 negotiation. |
| Medium | The host had pending security updates and required reboot. | Added a maintenance runbook with backup, download, controlled upgrade, reboot, and post-boot application/database/proxy verification gates. |

## Validation completed before release packaging

- TypeScript typecheck passed.
- The optimized Next.js standalone production build passed.
- Complete repository suite: 974 files and 10,122 tests passed.
- Instrumented suite with PostgreSQL integration: 976 files and 10,227 tests
  passed.
- Coverage is exactly 100 percent for 46,543 statements, 39,435 branches,
  9,526 functions, and 39,772 lines.
- Browser structural QA: 29 passed and 0 failed.
- Frontend regression sentinel: 32 passed and 0 failed.
- Isolated write-capable interaction QA: 33 passed and 0 failed across Chromium
  and WebKit behavior.
- Full responsive audit: 615 renders across 41 routes, five viewport classes,
  and Chromium, Firefox, and WebKit. Every document returned successfully with
  the correct locale and main landmark; no navigation, fatal-runtime, overflow,
  touch-target, clipping, escaping, or fixed-position geometry defect occurred.
- Changed-route i18n audit: 180 renders across French, English, Japanese, five
  viewports, and all three engines, with zero locale or geometry defects.
- The responsive runner reported media-only findings in the isolated snapshot:
  local files intentionally absent from `.qa/storage` returned 404, and some
  external `t.vndb.org` images were unavailable. These did not affect document
  rendering, layout, localization, or the clean 33-scenario interaction run.
- Repository operations scripts, systemd units, migrations, CSP, authentication,
  queue lifecycle, and stateful QA routes have dedicated regression tests.

## Deployment and production acceptance gates

The delivery is complete only after all of these live checks pass:

1. push the reviewed commit to `origin/main`;
2. create fresh local PostgreSQL and storage backups;
3. activate one immutable release and verify commit, symlink, process working
   directory, service health, database migrations, and authenticated HTML;
4. install the operational units, replicate encrypted backups off host, and
   complete a restore drill from the remote copy;
5. enable HTTP/2 and confirm authenticated and unauthenticated boundaries;
6. prune the cache in bounded mode and verify database/index health;
7. install operating-system updates, reboot, and repeat application, database,
   nginx, backup-timer, kernel, and HTTP/2 checks;
8. record the live evidence and final release hash in the personal wiki.

## Residual decisions

- Reverse-proxy Basic authentication remains the preferred production browser
  boundary. The application-wide token boundary is defense in depth and supports
  deployments where the proxy is changed later.
- Voice-credit data needs a normalized upstream identity before a primary key can
  be enforced safely. The audit deliberately avoids destructive deduplication or
  a synthetic uniqueness claim.
- Cache retention should be reviewed against actual hit rate and database growth
  after the first scheduled interval; the batch and age parameters are adjustable
  without a schema change.
