# Active TODO Index

This folder separates active audit work from historical reports.

## Active reports

- `round15-full-app-audit-report-tasks.md` - current independent application,
  responsive, provider, database, and production audit.

## Completed reports

Rounds 8 through 14 are completed evidence sets retained in this folder because
the current audit may link to their implementation history:

- `round8-full-app-audit-report-tasks.md`
- `round9-postgresql-migration-report-tasks.md`
- `round10-final-full-app-audit-report-tasks.md`
- `round11-skeleton-and-full-app-audit-report-tasks.md`
- `round11-vndb-integration-report-tasks.md`
- `round12-full-app-audit-report-tasks.md`
- `round13-full-app-audit-report-tasks.md`
- `round14-full-app-audit-report-tasks.md`

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
