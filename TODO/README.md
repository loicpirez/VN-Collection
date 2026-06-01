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
- `yarn test`: 2562 passed, 3 skipped
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

Current status:

- `DONE_WITH_DIFF`: 42
- `VERIFIED_EXISTING`: 2
- `TODO`: 51

## Working method

1. Triage critical and high findings first.
2. Implement one coherent wave at a time.
3. Run `yarn typecheck`, `yarn test`, and `yarn build` after each meaningful wave.
4. Update only the rows verified by the completed wave.
5. Keep incomplete findings visible.
