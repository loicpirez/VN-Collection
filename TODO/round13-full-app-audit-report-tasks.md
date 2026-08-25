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
| R13-TEST-001 | HIGH | The Round 12 production matrix covered 39 of the 40 App Router pages and omitted the dynamic list-detail page. Discover a real list id, include `/lists/[id]`, and rerun mobile and desktop WebKit plus Chromium for 160 isolated renders with strengthened accessibility, loading, security-header, image, error, and responsive checks. | production browser matrix, `src/app/lists/[id]/page.tsx` | TODO |
| R13-OPS-001 | MEDIUM | Production logged Next.js `destination stream closed early` errors during deliberate RSC navigation cancellation. Establish whether normal Safari workflows reproduce them, distinguish harmless client disconnects from application faults, and avoid suppressing unrelated server errors. | production journal, RSC navigation lifecycle | TODO |
| R13-PERF-001 | HIGH | The VNDB collection and all-release tabs render up to 200 upcoming cards in one document; production reaches roughly 9,000 DOM nodes and repeats cover/membership work for rows outside the initial viewport. Paginate these two tabs with stable URL state, localized range feedback, and bounded per-page repository lookups while preserving month grouping. | `src/app/upcoming/page.tsx`, upcoming runtime tests | TODO |
| R13-RESP-001 | HIGH | Production mobile measurement finds release-producer metadata links at about 13 px high and anniversary cards at 40 px. Keep the compact desktop presentation but provide the repository-required 44 px touch target on coarse/narrow layouts. | `src/app/upcoming/page.tsx`, `src/components/AnniversaryFeedView.tsx` | TODO |
| R13-SEC-001 | HIGH | Every production document has HSTS, MIME sniffing, referrer, frame, and permissions protections but no Content Security Policy. Build an application-compatible enforced policy for Next.js scripts, local APIs, VNDB/local images, map tiles, geocoding, and user-configured artwork; prove that it blocks unrelated origins without breaking all 40 routes. | `next.config.mjs`, browser security headers, security tests | TODO |

## Evidence collected

- Local `main`, `origin/main`, the production release symlink, and the running
  process all resolve to commit `935dc67ffaca6c808230721f93e1b466b1800b09`.
- Production readiness reports PostgreSQL available, pool maximum 10, no
  waiting clients, no unexpected service restart, and no configured memory cap.
- Source inventory contains 40 page files, 40 loading boundaries, 32 explicit
  route error boundaries plus the root boundary, and 123 API route files.
