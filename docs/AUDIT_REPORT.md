# VN Collection full application audit

Audit date: 2026-09-30

This report combines a source review, repository history review, three-locale
browser inspection, responsive checks, automated tests, and a read-only audit
of the active production service and PostgreSQL database. Secrets, environment
files, and authentication files were not opened.

## Executive assessment

The application is mature and generally healthy. The production origin is fast,
the service is stable, PostgreSQL is healthy, the reverse proxy protects the
personal collection, and the codebase has unusually broad automated coverage.
The audit did find one immediate operational risk, two high-impact workflow
defects, and several smaller accessibility, internationalization, and durability
gaps.

The release that contains this report fixes the immediate release-storage risk,
hardens database migration rollback compatibility, reconciles partially applied
VNDB imports, restores deep activity pagination, completes keyboard semantics
for mixed stock tabs, and increases physical-bundle touch targets.

## Production evidence

| Area | Observed state |
| --- | --- |
| Service | systemd service active since 2026-09-11, zero restarts, no warning-or-higher journal entries in the preceding seven days |
| Runtime | Next.js 16.3.2 on Node.js 22.22.2 before this delivery |
| Origin performance | warm home-page TTFB 30.8 to 41.7 ms, total 44.6 to 55.1 ms, gzip enabled |
| Database | PostgreSQL 16.15, 585 MB, checksums enabled, 58 tables, 153 indexes, zero invalid indexes, zero deadlocks |
| Network | application and PostgreSQL bound to loopback; firewall default deny; only SSH, HTTP, and HTTPS exposed |
| HTTP security | HTTPS redirect, Basic authentication, HSTS, CSP, frame restrictions, no-sniff, referrer and permissions policies |
| Backups | verified daily PostgreSQL custom dumps and weekly storage archives with SHA-256 sidecars and 35-day retention |
| Capacity before this delivery | root filesystem at 93 percent, 33 GB free, 290 full immutable releases averaging about 1.1 to 1.2 GB |

## Findings and actions

### Operations, security, and rollback safety

| Severity | Finding | Action in this release |
| --- | --- | --- |
| Critical | Successful releases were never pruned. The release store contained 290 full dependency and build trees and plausibly consumed more than 300 GB. | Added byte and inode preflight checks, strict release-path validation, protected active and rollback targets, configurable retention, and post-activation pruning. |
| Critical | The deployment script applied migrations before building the candidate. A build failure could advance the schema while leaving the old application active. | Build and package now complete before migration credentials are loaded or migrations run. |
| Critical | Older releases rejected every migration unknown to their own source tree, so application rollback could fail after an expand-only migration. | Schema readiness now accepts only a complete required prefix followed by a well-formed contiguous future suffix. Missing, malformed, duplicated, inserted, or gapped versions still fail closed. |
| High | Application token mode protects API routes but does not protect server-rendered HTML or RSC responses that query personal data directly. | Production reverse-proxy Basic authentication was verified as the actual boundary. Token mode remains unsuitable as the sole protection for a public browser deployment. |
| Medium | Production CSP still permits inline scripts. | Retained for compatibility in this release. Move the URL-scrubbing script to a hashed or nonce-authorized path before removing `unsafe-inline`. |
| Medium | The host has pending operating-system updates and requires a reboot. | Schedule a maintenance window after this application release. |

### UI, UX, responsive behavior, and accessibility

| Severity | Finding | Action in this release |
| --- | --- | --- |
| High | If a VNDB import succeeded in one batch and a later batch failed, the review UI kept confirmed writes selected and displayed stale candidates. | Added best-effort server reconciliation, conservative local fallback, applied and remaining counts, retryable selection preservation, abort safety, and localized feedback. |
| High | Mixed AliceNet and branch-stock controls declared tab semantics but kept both tabs in the Tab order and did not support Arrow, Home, or End keys. | Added roving `tabIndex`, Arrow, Home, and End activation with focus transfer, plus 44 px touch sizing. |
| High | Physical-bundle controls included 16, 36, and 40 px practical touch targets. | Enlarged the manager trigger, dialog close control, search field, paging buttons, checkbox labels, and anchor labels to the 44 px coarse-pointer contract while preserving compact fine-pointer layouts. |
| Medium | Route-level responsive checks did not mount every conditional modal and mixed-stock state. | Added focused component regressions and ran the changed routes across three locales, five viewport classes, and Chromium, Firefox, and WebKit. Stateful modal geometry should remain part of future interaction QA. |
| Low | Several count strings still use fixed English or French plural forms. | Kept as a follow-up. Introduce one/other dictionary forms or an `Intl.PluralRules` helper for Seiyuu, import, and offer counts. |
| Low | The language switcher exposes locale codes and gives limited pending feedback. | Kept as a follow-up. Add autonyms, optimistic selection, and an `aria-busy` state. |

### Features, data access, and speed

| Severity | Finding | Action in this release |
| --- | --- | --- |
| High | Full-download accepts up to 200 titles and starts as many as 600 detached workflows without a durable queue, lease, deduplication, or restart recovery. | Kept as a larger follow-up. Replace it with a persisted batch job and bounded leased workers. |
| Medium | Activity pages fetched every preceding row and sliced in memory. A repository cap made rows after 500 inaccessible. | Added bounded repository offsets for SQLite and PostgreSQL. Each page now fetches only 51 rows at its own stable offset. |
| Medium | Local backups are stored on the same filesystem as the application and database. | Keep local fast recovery, then add encrypted off-host replication and scheduled restore drills. |
| Medium | Public nginx currently negotiates HTTP/1.1. | Enable and verify HTTP/2 during a separate proxy configuration change. |
| Low | Two credit tables have no primary key and the cache table accounts for most database size. | Review composite uniqueness for credit rows and define cache retention from observed access patterns. |

## Validation contract

The release is acceptable only when all of the following evidence is green:

- complete Vitest suite;
- PostgreSQL integration coverage through the project container;
- exact 100 percent statements, branches, functions, and lines;
- TypeScript typecheck;
- optimized Next.js production build;
- browser structural QA and regression sentinel;
- isolated write-capable interaction QA in Chromium and WebKit;
- responsive inspection of changed surfaces in French, English, and Japanese;
- production backup freshness before deployment;
- immutable release activation with commit, symlink, process-directory, service,
  health, database, and authenticated browser verification after deployment.

Validation completed before release packaging:

- complete repository suite: 969 files and 10,085 tests passed;
- instrumented suite with PostgreSQL integration: 970 files and 10,181 tests
  passed;
- coverage: 100 percent statements, 100 percent branches, 100 percent
  functions, and 100 percent lines;
- typecheck and optimized Next.js build passed;
- browser structural QA: 29 passed, 0 failed;
- frontend regression sentinel: 32 passed, 0 failed;
- isolated write-capable interaction QA: 29 passed, 0 failed across Chromium
  and WebKit surfaces;
- responsive matrix: 180 renders across Chromium, Firefox, WebKit, French,
  English, Japanese, and five viewport classes. Every render had correct locale,
  zero horizontal overflow, zero clipped controls, zero undersized touch targets,
  and zero fatal errors. The script reported only expected HTTP 404 console
  entries for media intentionally absent from the isolated storage snapshot.

## Remaining prioritized backlog

1. Replace full-download fan-out with a durable leased job queue.
2. Add an application browser-session authentication mode if reverse-proxy
   authentication is ever removed.
3. Replicate encrypted backups off-host and automate restore drills.
4. Remove CSP `unsafe-inline` through nonces or hashes.
5. Complete count pluralization and language-switcher feedback.
6. Add stateful browser geometry checks for the physical-bundle dialog, mixed
   stock tabs, import conflicts, and the global error boundary.
7. Enable HTTP/2, patch and reboot the host, then remeasure authenticated
   traffic.
