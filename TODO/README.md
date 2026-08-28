# Active TODO Index

This folder separates active audit work from historical reports.

## Active reports

| Report | Purpose | Task format |
| --- | --- | --- |
| `round14-full-app-audit-report-tasks.md` | Responsive regression correction and pending immutable production activation evidence. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |

## Completed reports

Rounds 8 through 13 are completed evidence sets retained in this folder because
the current audit links to their implementation and production verification:

- `round8-full-app-audit-report-tasks.md`
- `round9-postgresql-migration-report-tasks.md`
- `round10-final-full-app-audit-report-tasks.md`
- `round11-skeleton-and-full-app-audit-report-tasks.md`
- `round11-vndb-integration-report-tasks.md`
- `round12-full-app-audit-report-tasks.md`
- `round13-full-app-audit-report-tasks.md`

## Historical reports

Older audit snapshots live in `TODO/OLD/`. They are retained for reference and should not be treated as the current source of truth unless an active report links back to them.

## Status values

| Status | Meaning |
| --- | --- |
| `TODO` | Verified issue or improvement still open. |
| `IN_PROGRESS` | Verified work is active, but one or more required evidence gates remain. |
| `DONE` | Implemented and verified without a material contract difference. |
| `VERIFIED_EXISTING` | Source and tests confirm the desired behavior already exists. |
| `DONE_WITH_DIFF` | Fixed or documented by a code, test, or docs change in the active workstream. |
