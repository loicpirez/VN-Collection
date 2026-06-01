# Documentation audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| DOCA-001 | HIGH | The API inventory in `CLAUDE.md` does not enumerate every route file, including newer stock, place, display, and recovery surfaces. Regenerate the route table from the filesystem and document all real endpoints. | `CLAUDE.md`, `src/app/api/**/route.ts` | TODO |
| DOCA-002 | HIGH | Refresh-scope documentation describes a request shape that no longer matches the implemented method and body contract. Update docs from the route implementation and add a contract test. | `CLAUDE.md`, `src/app/api/refresh/**` | TODO |
| DOCA-003 | HIGH | Schema documentation is stale relative to the SQLite bootstrap tables and indexes. Reconcile the schema overview with direct inspection of `db.ts`. | `CLAUDE.md`, `src/lib/db.ts` | TODO |
| DOCA-004 | MEDIUM | Stock provider documentation does not clearly distinguish exact structured providers, search-only links, diagnostics, and unfinished capabilities. Document the capability matrix from code. | `README.md`, `FEATURES.md`, `CLAUDE.md`, `src/lib/stock-providers.ts` | TODO |
| DOCA-005 | MEDIUM | Tutorial documentation and comments still describe a smaller tour than the current registry. Align docs, labels, and tests with the actual step set. | `TUTORIAL.md`, `src/components/TutorialOverlay.tsx`, `src/lib/tutorial.ts` | TODO |
| DOCA-006 | MEDIUM | Historical task snapshots and the active audit backlog are not clearly separated. Keep historical files intact and point active work to this `TODO/README.md`. | `TODO/`, `README.md` | TODO |
| DOCA-007 | LOW | AliceSoft Kobe naming is mixed across UI, docs, code identifiers, and old terminology. Select one canonical user-facing label and document migration compatibility where it is intentionally retained. | `README.md`, `FEATURES.md`, `CLAUDE.md`, `src/app/alicesoft_kobe/**` | TODO |
