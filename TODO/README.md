# Full application audit - 2026-06-01

This directory contains the implementation backlog produced by a project-wide
audit of `vndb-collection-new`. Existing historical audit material remains in
place. The reports below contain 95 tracked tasks. Statuses must be updated only
after direct source inspection and fresh verification.

Each task uses the same five-column format:

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |

## Reports

| Category | Report | Tracked tasks |
| --- | --- | ---: |
| Security | [security-report-tasks.md](security-report-tasks.md) | 8 |
| Bugs | [bugs-report-tasks.md](bugs-report-tasks.md) | 12 |
| Features | [features-report-tasks.md](features-report-tasks.md) | 7 |
| Performance | [performance-report-tasks.md](performance-report-tasks.md) | 12 |
| UI / UX | [uiux-report-tasks.md](uiux-report-tasks.md) | 9 |
| Responsive | [responsive-report-tasks.md](responsive-report-tasks.md) | 8 |
| Accessibility | [accessibility-report-tasks.md](accessibility-report-tasks.md) | 7 |
| i18n | [i18n-report-tasks.md](i18n-report-tasks.md) | 8 |
| Typing | [typing-report-tasks.md](typing-report-tasks.md) | 8 |
| Testing | [testing-report-tasks.md](testing-report-tasks.md) | 9 |
| Documentation | [documentation-report-tasks.md](documentation-report-tasks.md) | 7 |

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

The AliceNet Kobe naming follow-up standardizes the visible brand across navigation,
dictionary text, docs, errors, and component labels. Route, API, SQLite, feature-gate,
and legacy proxy identifiers remain documented compatibility contracts.

The map-privacy follow-up blocks CARTO tiles and Nominatim geocoding by default behind
one local opt-in control shared by the map page and place modal. Browser QA at 390 px
confirmed blocked first paint, enabled shared state, immediate revocation, disabled
geocoding after revocation, and no horizontal overflow. Nominatim language preferences
now derive from the active locale.

Current status:

- `DONE_WITH_DIFF`: 77
- `VERIFIED_EXISTING`: 2
- `TODO`: 16

## Working method

1. Triage critical and high findings first.
2. Implement one coherent wave at a time.
3. Run `yarn typecheck`, `yarn test`, and `yarn build` after each meaningful wave.
4. Update only the rows verified by the completed wave.
5. Keep incomplete findings visible.
