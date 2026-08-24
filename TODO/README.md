# Active TODO Index

This folder separates active audit work from historical reports.

## Active reports

| Report | Purpose | Task format |
| --- | --- | --- |
| `round8-full-app-audit-report-tasks.md` | Current app-wide audit covering UI, UX, responsive behavior, accessibility, security, i18n, performance, typing, testing, data, docs, stock, shops, maps, and feature completeness. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round9-postgresql-migration-report-tasks.md` | Complete PostgreSQL migration: async persistence architecture, 52-table schema, 263 DB functions, 369 consumers, real-data migration, backup/restore, operations, and parity validation. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |

## Historical reports

Older audit snapshots live in `TODO/OLD/`. They are retained for reference and should not be treated as the current source of truth unless an active report links back to them.

## Status values

| Status | Meaning |
| --- | --- |
| `TODO` | Verified issue or improvement still open. |
| `DONE` | Implemented and verified without a material contract difference. |
| `VERIFIED_EXISTING` | Source and tests confirm the desired behavior already exists. |
| `DONE_WITH_DIFF` | Fixed or documented by a code, test, or docs change in the active workstream. |
