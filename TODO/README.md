# Active TODO Index

This folder separates active audit work from historical reports.

## Active reports

| Report | Purpose | Task format |
| --- | --- | --- |
| `round8-full-app-audit-report-tasks.md` | Current app-wide audit covering UI, UX, responsive behavior, accessibility, security, i18n, performance, typing, testing, data, docs, stock, shops, maps, and feature completeness. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round9-postgresql-migration-report-tasks.md` | Complete PostgreSQL migration: async persistence architecture, 52-table schema, 263 DB functions, 369 consumers, real-data migration, backup/restore, operations, and parity validation. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round10-final-full-app-audit-report-tasks.md` | Final cross-check of UI/UX, functionality, responsive behavior, accessibility, i18n, security, performance, typing, tests, documentation, production data, and deployment readiness. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round11-skeleton-and-full-app-audit-report-tasks.md` | Loading-skeleton coherence pass plus a repeated app-wide audit of UI/UX, functionality, responsive behavior, accessibility, i18n, security, performance, typing, tests, documentation, production data, and deployment evidence. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round11-vndb-integration-report-tasks.md` | Personal-data synchronization contract covering local/VNDB conflict resolution, per-field choices, safe global status preview/apply, concurrency, privacy, and known upstream limits. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round12-full-app-audit-report-tasks.md` | Repeated whole-app source, runtime, database, browser, security, UI/UX, responsive, accessibility, i18n, performance, provider, testing, and operations audit, with every verified gap tracked through implementation and deployment. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round13-full-app-audit-report-tasks.md` | Fresh post-deployment audit of all 40 pages and 123 API routes, strengthened production browser semantics, operations, security, data, and full quality gates. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |
| `round14-full-app-audit-report-tasks.md` | Independent cross-browser and source audit of every product, data, security, accessibility, i18n, performance, provider, PostgreSQL, testing, documentation, and production contract after Round 13. | `ID`, `Severity`, `Finding and implementation direction`, `Location`, `Status` |

## Historical reports

Older audit snapshots live in `TODO/OLD/`. They are retained for reference and should not be treated as the current source of truth unless an active report links back to them.

## Status values

| Status | Meaning |
| --- | --- |
| `TODO` | Verified issue or improvement still open. |
| `DONE` | Implemented and verified without a material contract difference. |
| `VERIFIED_EXISTING` | Source and tests confirm the desired behavior already exists. |
| `DONE_WITH_DIFF` | Fixed or documented by a code, test, or docs change in the active workstream. |
