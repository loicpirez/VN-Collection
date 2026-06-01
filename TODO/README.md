# Full application audit - 2026-06-01

This directory contains the implementation backlog produced by a project-wide
audit of `vndb-collection-new`. Existing historical audit material remains in
place. The reports below contain 83 tracked tasks. Statuses must be updated only
after direct source inspection and fresh verification.

Each task uses the same five-column format:

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |

## Reports

| Category | Report | Tracked tasks |
| --- | --- | ---: |
| Security | [security-report-tasks.md](security-report-tasks.md) | 7 |
| Bugs | [bugs-report-tasks.md](bugs-report-tasks.md) | 8 |
| Features | [features-report-tasks.md](features-report-tasks.md) | 7 |
| Performance | [performance-report-tasks.md](performance-report-tasks.md) | 9 |
| UI / UX | [uiux-report-tasks.md](uiux-report-tasks.md) | 8 |
| Responsive | [responsive-report-tasks.md](responsive-report-tasks.md) | 8 |
| Accessibility | [accessibility-report-tasks.md](accessibility-report-tasks.md) | 7 |
| i18n | [i18n-report-tasks.md](i18n-report-tasks.md) | 7 |
| Typing | [typing-report-tasks.md](typing-report-tasks.md) | 7 |
| Testing | [testing-report-tasks.md](testing-report-tasks.md) | 8 |
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

## Working method

1. Triage critical and high findings first.
2. Implement one coherent wave at a time.
3. Run `yarn typecheck`, `yarn test`, and `yarn build` after each meaningful wave.
4. Update only the rows verified by the completed wave.
5. Keep incomplete findings visible.
