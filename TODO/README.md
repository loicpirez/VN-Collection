# Full application audit - 2026-06-01

This directory contains the implementation backlog produced by a project-wide
audit of `vndb-collection-new`. Existing historical audit material remains in
place. The reports below contain 487 tracked tasks. Statuses must be updated only
after direct source inspection and fresh verification.

Each task uses the same five-column format:

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |

## Reports

| Category | Report | Tracked tasks |
| --- | --- | ---: |
| Security | [security-report-tasks.md](security-report-tasks.md) | 36 |
| Bugs | [bugs-report-tasks.md](bugs-report-tasks.md) | 121 |
| Features | [features-report-tasks.md](features-report-tasks.md) | 15 |
| Performance | [performance-report-tasks.md](performance-report-tasks.md) | 39 |
| UI / UX | [uiux-report-tasks.md](uiux-report-tasks.md) | 18 |
| Responsive | [responsive-report-tasks.md](responsive-report-tasks.md) | 41 |
| Accessibility | [accessibility-report-tasks.md](accessibility-report-tasks.md) | 57 |
| i18n | [i18n-report-tasks.md](i18n-report-tasks.md) | 43 |
| Typing | [typing-report-tasks.md](typing-report-tasks.md) | 68 |
| Testing | [testing-report-tasks.md](testing-report-tasks.md) | 20 |
| Documentation | [documentation-report-tasks.md](documentation-report-tasks.md) | 20 |
| Round 7 stock, shop, and map | [round7-stock-shop-map-report-tasks.md](round7-stock-shop-map-report-tasks.md) | 9 |

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `TODO` | Finding is open. |
| `IN_PROGRESS` | Implementation is active but not freshly verified. |
| `DONE_WITH_DIFF` | Source and tests were changed and fresh quality gates passed. |
| `VERIFIED_EXISTING` | Direct inspection and fresh quality gates proved the repository already satisfies the requirement. |
| `DEFERRED` | Scope is intentionally postponed with a documented reason. |

## Audit baseline evidence

The initial read-only audit ran `yarn typecheck`, `yarn test`, and `yarn build`.
It also inspected representative library, VN detail, shelf, map, places,
stock, settings, and mobile navigation surfaces. The task list is broader than
the initial command pass: a green build does not prove product coherence,
responsive behavior, security boundaries, or documentation accuracy.

## Fresh audit evidence - 2026-06-01

The post-fix audit inspected source and rendered behavior again. It counted
116 API route files, 41 page files, and 41 route loaders. The stock browser,
map, places, and place-detail routes now expose route-level loading skeletons.

Browser QA opened the library Filters drawer with a non-empty physical-location
facet and confirmed that it renders without a React child error or horizontal
overflow. It also exercised the VNDB Wishlist button through add and remove
states and confirmed that no upstream-service error appears.

The fresh scan added evidence-backed tasks for lazy facet loading, searchable
large filter facets, correlated place-count queries, unbounded SQLite
placeholder lists, persisted stock presentation labels, Leaflet private API
mutation, and the place-response contract regression test. It also corrected
stale file references introduced by earlier component renames.

Fresh gates passed:

- `yarn typecheck`
- `yarn test`: 2574 passed, 3 skipped
- `yarn build`
- `yarn qa`: 24 passed, 0 failed

The follow-up wave closed 18 additional tasks. Browser verification confirmed
one primary landmark on map and places, a labelled shelf fullscreen dialog with
clean close behavior, no horizontal overflow on those surfaces, and no browser
console errors.

The map follow-up found and fixed a browser-only module leaking through a static
helper import during SSR. Leaflet viewport persistence now lives in a safe helper
module, marker icons are served locally, and explicit icon configuration replaces
private prototype mutation.

The stock follow-up removed the owned-edition hard cap and bounded provider-offer
rendering with localized pagination. Mobile browser verification at 390 px confirmed
one primary landmark, no horizontal overflow, visible 44 px provider refresh targets,
and 44 px stock setup inputs.

The stock backend follow-up runs providers in deterministic four-shop waves with a
provider-level deadline. Batch refresh now caps concurrent background jobs, rejects
overflow explicitly, and aborts in-flight provider work when cancelled.

The collection query follow-up coalesces the home page's duplicate no-store collection
requests while preserving independent section controls. Producer and publisher ordering
now joins pre-aggregated names instead of executing scalar subqueries per result row.

The collection enrichment follow-up chunks place and aspect lookups into 500-VN queries
to stay below SQLite placeholder limits. VN detail price history now hydrates from the
server stock snapshot instead of issuing an immediate duplicate request.

The stock-price test follow-up extracts a typed request boundary and proves with delayed
responses that an aborted stale VN request cannot overwrite the active VN payload.

The character-route typing follow-up validates and normalizes local API rows before
client caching. Route suggestions now consume the adapter output directly without a
double cast.

The stock-extras typing follow-up validates `eroge_price` envelopes at the SQLite write
boundary, normalizes nested payloads through the canonical decoder, removes the raw
generic reader, and pins every UI consumer to the validated path.

The asset-access security follow-up treats mirrored and uploaded files as private media.
`/api/files/*` now requires localhost or an admin token before storage lookup and sends
private cache directives.

The stock-batch durability follow-up processes VNs in bounded two-item waves, persists
top-level progress snapshots, keeps cancelled counters truthful, and reports unfinished
jobs as interrupted after a server restart. The status popover distinguishes cancelled
work from completed work.

The GEO follow-up hardens online-store card parsing for current list markup, keeps
physical-branch confirmation disabled, and replaces stale diagnostics that implied the
entire provider parser was unfinished.

The collection pagination follow-up limits public library pages to 240 rows by default
and 500 rows at most, applies advanced predicates in SQLite before slicing, and adds
localized previous/next navigation. Compare and bulk-download workflows drain bounded
pages through one typed helper instead of requesting an oversized response.

The VN-detail UX follow-up adds a touch-safe horizontal section navigator on narrow
screens, starts secondary sections collapsed for new layouts, and moves provider tiles
behind a persisted stock-configuration disclosure. Browser verification at 390 px
confirmed no horizontal overflow and kept the stock summary and refresh action visible.

The architecture-documentation follow-up adds source-derived inventories for all 116 API
route files and all 50 bootstrap SQLite tables. A regression test now fails when route
methods, route files, or tables drift from `CLAUDE.md`; stale scoped-refresh and private
media descriptions were corrected at the same time.

The stock-provider capability follow-up introduces a typed lookup, result, and support
contract for every configured shop. Provider tiles now distinguish structured prices,
structured offers, search leads, cached inventory, JAN lookup, limited support, and
manual-link-only integrations. The canonical docs describe the same matrix.

The AliceNet naming follow-up standardizes navigation, dictionary text, docs, routes,
APIs, SQLite identifiers, feature gates, errors, and component labels. The bootstrap
migrates prior local identifiers forward while the real upstream hostname remains
isolated to fetch and allowlist code.

The map-privacy follow-up blocks CARTO tiles and Nominatim geocoding by default behind
one local opt-in control shared by the map page and place modal. Browser QA at 390 px
confirmed blocked first paint, enabled shared state, immediate revocation, disabled
geocoding after revocation, and no horizontal overflow. Nominatim language preferences
now derive from the active locale.

The responsive-density follow-up keeps density labels visible on narrow screens and
removes blanket horizontal clipping from the configurable page frame. Shelf overflow
remains owned by the shelf scroll frames. Browser QA at 390 px confirmed the shelf has
one local horizontal scroll boundary, visible density text, and no page overflow. The
same pass hardened provider-capability rendering against stale serialized snapshots
during development hot reload.

The stock-localization follow-up centralizes JPY formatting, uses the shared locale-aware
date helper for provider timestamps, and stores app-authored stock conditions, editions,
marketplace availability, and AliceNet availability as stable slugs. Existing
English rows retain render-time compatibility maps. Browser QA at 390 px also found and
fixed stock disclosure hydration mismatches caused by reading local storage during the
first client render; a fresh reload now has no console errors or horizontal overflow.

The download-status localization follow-up emits stable label and current-item codes for
all production background-job producers, persists those codes for durable stock jobs,
and translates them at render time while retaining legacy fallbacks. Durable snapshots
validate decoded codes and parameters before exposing them to the client.

The activity localization follow-up makes persisted event codes authoritative at render
time. The activity filter and system feed now resolve the full production event catalog
through locale dictionaries; legacy English labels remain searchable metadata only.

The persisted-data typing follow-up removes the proxy-agent double cast, validates every
display-setting cookie and local-storage field before hydration, and guards application-
owned SQLite and proxy-setting JSON payloads with concrete decoders. Corrupt rows now
fall back to bounded empty values instead of flowing into typed consumers.

The library-facet follow-up replaces long native advanced-filter selects with searchable
comboboxes for developers, publishers, series, tags, and places. Results are capped at
60 rendered options with a visible range count, while keyboard and touch selection keep
the full underlying facet list reachable without hidden truncation.

The repository's intentionally limited lint gate was re-verified: Next.js 16 removed
`next lint`, no formal linter is wired, and `CLAUDE.md` explicitly documents typecheck
plus tests as the current safety net.

The responsive-QA follow-up adds real narrow-browser assertions for tutorial placement,
tutorial action touch targets, VN-detail horizontal overflow, compact document height,
collapsed secondary sections, and the mobile section navigator's 44 px target floor.

The library-toolbar follow-up gives display customization one predictable surface:
card density, comfortable/dense mode, and home-section layout now sit together below
the sort cluster on mobile and in the desktop toolbar. Filter presets remain in Options.

The collection-card typing follow-up introduces separate database-card and public API
DTOs. Slim card queries no longer reconstruct or advertise omitted rich-detail fields,
and the client no longer carries a private-note fallback that its public response cannot
legitimately receive.

The stock-module boundary follow-up extracts the provider capability catalogue, bounded
title-query generation, and client stock-response DTOs into focused modules. Existing
server imports remain compatible through `stock.ts` re-exports while `StockPanel` stops
declaring a duplicate wire contract.

The second post-fix audit reopened four evidence-backed tasks: advanced-search request
validation, printable-label origin normalization, failed-image fallback rendering, and
canonical documentation drift after the stock-module and settings-tab refactors.

The navigation, artwork, dump-tracker, and stock-browser naming follow-up portals
desktop grouped menus through the document body with viewport clamping, adds a durable
dump-ignore preference with a recovery tab, keeps new dump controls touch-safe, and
anchors compact cover controls inside poster bounds. The stock browser is now
canonically named AliceNet across active routes, filenames, provider identifiers,
settings, tests, and docs. Only the real upstream hostname and first-open migration
inputs retain prior identifiers.

The live-server sanity pass also found and closed a strict-decoder regression on the
library route: VNDB relation summaries legitimately omit publisher arrays. The client
now normalizes that optional source field for rendering while rejecting malformed
arrays when present.

The collection-card boundary follow-up also preserves the durable dump-ignore flag
through strict client decoding instead of silently dropping it.

The QA-harness audit fixes route-fetch accounting so `yarn qa` can no longer print
failures from discarded subshells while exiting successfully, and it no longer reports
concatenated fallback status values such as `200000`. Staff-detail DOM probing now also
respects optional cached gender while retaining its source-level clickability contract.

The download-status SSE follow-up keeps initial snapshot delivery and proxy keep-alives,
while making teardown idempotent when a browser disconnect causes `enqueue()` to throw.
That path now releases both the interval and pub/sub listener immediately.

The hero-artwork audit closes the last permanent-shimmer path on VN banners: failed image
requests now transition from the loading skeleton to a stable no-image fallback and reset
cleanly when a replacement source is selected.

The wishlist scale follow-up adds URL-backed card pagination after filtering and sorting.
Grouped rendering now mounts at most 60 cards per page while bulk download keeps its
complete filtered scope.

The staff-detail scale follow-up applies a reusable localized paginator to local and
streamed credit grids. Prolific staff and seiyuu pages now mount at most 60 image-heavy
credit cards per grid while keeping every result reachable.

The shared detail-grid follow-up applies that same bounded rendering contract to dump
tracking, custom lists, series, and producer-role credits.

The place-stock scale follow-up paginates sorted shop inventory before grouping so a
large linked store no longer mounts its complete image-card inventory at once.

The Basic Auth robustness follow-up removes embedded URL credentials synchronously
before hydration so browser-side relative requests remain valid behind authenticated
reverse proxies.

The character-detail scale follow-up bounds same-name sibling images and VN appearance
covers with the shared localized paginator.

The physical-shop registry follow-up windows filtered cards, rows, and unassigned
branches with localized pagination controls.

The trait-detail follow-up replaces its first-page-only character gallery with VNDB
server paging and a complete chunked collection-only query.

The compact-detail and map-layer follow-up reduces mobile artwork overlays to one
intentional edit entry, adds hover/focus/tap disclosure for truncated platform lists,
flips desktop navbar menus before introducing internal scroll, makes the map privacy
notice independently collapsible, isolates Leaflet below modal layers, and gives
per-page density controls a stable non-overlapping settings grid.

The final boundary and lifecycle follow-up validates EGS cover candidates before
caching or rendering, rejects malformed collection filters before expensive
materialization, and aborts obsolete Steam reads and writes.

The final UI follow-up moves custom dialog layouts to the shared root portal layer,
normalizes decorative Lucide accessibility and presentation tokens, windows route
journals at 40 rows, and keeps one cover-picker owner mounted outside collapsible
menus. Browser QA caught and verified the resident picker fix directly.

Final fresh gates:

- `yarn typecheck`
- `yarn test`: 3343 passed, 3 skipped
- `yarn build`
- `yarn qa`: 24 passed, 0 failed
- `yarn sentinel`: 29 passed, 0 failed

## Fresh audit - 2026-06-02

A second full read-only audit ran one reviewer per field across the committed
tree (security, bugs, features, performance, UI/UX, responsive, accessibility,
i18n, typing, testing, documentation). It added 53 new evidence-backed findings
with exact file and line citations, continuing each category id sequence. Every
new finding was filed as `TODO` and has since been implemented (see Current status below).

Highlights:

- Security returned clean. The prior 36-item hardening still holds (SSRF hop
  validation, auth gates on mutating and data-exposing routes, bounded JSON,
  path traversal, XSS, safeHref, secret redaction, parameterized SQL).
- Bugs: EGS sync overwrites operator-entered start and finish dates when
  applying a playtime-only suggestion (BUGA-119, HIGH).
- Features: seven dead or half-wired paths, including reading-queue predicted
  time and drag reorder, saved-filter and list-item reorder endpoints with no
  caller, and a compare picker that silently drops not-yet-mirrored VNs.
- i18n: `languageDisplayName` is never passed the active locale, and
  `readApiError` surfaces verbatim English server errors in fr and ja toasts
  (I18NA-041 and I18NA-042, HIGH).
- Accessibility: the decorative-icon sweep added `aria-hidden` to several icons
  that still carried a state-conveying `aria-label`, muting that state
  (A11YA-052..057).
- Responsive: several popovers and the shared dialog have no height cap, so
  lower controls overflow the mobile viewport (RESPA-036..040).
- Testing: the CSV and ICS export logic and several bounded parsers have no
  tests, and a few existing tests use status allowlists or real timers.

The 53 findings were then implemented in one wave: 52 `DONE_WITH_DIFF` and one
`VERIFIED_EXISTING` (FEA-014, whose `producer-completion.ts` module was found to
have live callers in `brand-overlap`, `producer-full`, and `vndb-feed-cache-shape`,
so it was kept and only its stale doc reference was corrected). A latent strict
decoder regression that broke VNDB search (developers without a producer id) was
also fixed. Fresh gates passed: `yarn typecheck`, `yarn test` (3384 passed, 3
skipped), and `yarn build`.

Current status:

- `DONE_WITH_DIFF`: 481
- `VERIFIED_EXISTING`: 6
- `IN_PROGRESS`: 0
- `TODO`: 0

## Fresh audit - 2026-06-12

The stock, shop, and map audit rechecked the real QA SQLite snapshot under the
project directory, the generic stock page, the AliceNet mirror, the places
registry, and the map privacy boundary. It added nine evidence-backed rows in
`round7-stock-shop-map-report-tasks.md`.

Findings and fixes:

- `/stock` stays the generic per-VN stock lookup and keeps generic stock
  refreshes scoped to all providers by default. AliceNet mirror controls stay
  only on the linked AliceNet shop place page.
- AliceNet cached-offer stale badges now explain that the mirror must be synced
  from the AliceNet section instead of implying the per-VN provider refresh
  failed.
- `GET /api/alicenet` now has a bounded wishlist-enrichment budget, so a slow
  VNDB wishlist call cannot block the local stock snapshot.
- `/places` opens the unassigned-branch view automatically when there are no
  registered places but imported stock branches exist.
- Public-read route markers no longer leak as unsupported Next route exports,
  while the marker remains present for auditability.
- Browser QA at 390 px confirmed `/stock`, `/places`, and `/map` have no
  horizontal overflow. `/map` keeps external tiles disabled by default and the
  source still isolates Leaflet below the shared modal layer.

## Working method

1. Triage critical and high findings first.
2. Implement one coherent wave at a time.
3. Run `yarn typecheck`, `yarn test`, and `yarn build` after each meaningful wave.
4. Update only the rows verified by the completed wave.
5. Keep incomplete findings visible.
