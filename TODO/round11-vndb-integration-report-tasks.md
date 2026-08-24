# Round 11 VNDB user-data integration analysis - 2026-08-25

This report is the functional and technical contract for personal-data
synchronization between the local collection and the authenticated user's VNDB
ulist. It distinguishes the numeric rating (`vote`) from free-form personal
notes (`notes`), documents every direction of travel, and records the safeguards
that prevent a stale or partial upstream view from silently overwriting local
work.

The integration deliberately has two scopes. The VN page offers an explicit,
field-by-field resolver for one title and covers status, rating, start date,
finish date, and personal notes. Settings offers a bounded global status
comparison because VNDB's predefined-label queries can retrieve status sets in
five scans; extending that global operation to all per-entry fields would
require a large upstream fan-out and would weaken freshness and failure
semantics. No personal field is silently imported merely because a VNDB token
exists.

`DONE_WITH_DIFF` means the synchronization implementation or its regression
contract was changed in this workstream. `VERIFIED_EXISTING` means source and
tests confirm the stated behavior without another rewrite. Final all-project
coverage and production operational evidence remain tracked by the main Round
11 report rather than being duplicated as closed work here.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R11-VNDB-001 | CRITICAL | Local and VNDB personal data previously lacked one explicit conflict contract, making it possible for users to misunderstand which side would win. Treat neither system as an unconditional source of truth: compare normalized values and require a user-selected direction for each differing field. | `src/lib/vndb-user-data-sync.ts`, `src/components/VndbStatusPanel.tsx` | DONE_WITH_DIFF |
| R11-VNDB-002 | HIGH | Status is represented locally by one collection enum and remotely by predefined VNDB labels 1 through 5. Map `playing`, `completed`, `on_hold`, `dropped`, and `planning` deterministically, and display both values before applying a transition. | `src/lib/vndb-user-data-sync.ts`, `src/app/api/vn/[id]/vndb-status/route.ts` | DONE_WITH_DIFF |
| R11-VNDB-003 | HIGH | A VN can carry more than one predefined status label upstream. Resolve this invalid or transitional state deterministically as `completed`, then `dropped`, `on_hold`, `playing`, and `planning`, while leaving all non-status custom labels untouched. | `src/lib/vndb-user-data-sync.ts`, `src/lib/vndb-sync.ts` | DONE_WITH_DIFF |
| R11-VNDB-004 | HIGH | A local numeric rating and VNDB vote use the same integer 10-100 storage scale even though the UI presents a 1.0-10.0 score. Compare the stored values without floating-point conversion and let the user explicitly push, pull, or clear the rating. | `src/app/api/vn/[id]/vndb-status/route.ts`, `src/components/VndbStatusPanel.tsx` | DONE_WITH_DIFF |
| R11-VNDB-005 | HIGH | Start and finish dates can exist on only one side or differ. Preserve ISO `YYYY-MM-DD` values over the API, localize only their presentation, and make null a deliberate clear operation in either direction. | `src/app/api/vn/[id]/vndb-status/route.ts`, `src/components/VndbStatusPanel.tsx` | DONE_WITH_DIFF |
| R11-VNDB-006 | HIGH | Personal notes are not the same as the numeric rating and must be compared separately. Normalize only empty text to null, preserve non-empty content, and support explicit push, pull, and clear actions without logging note bodies. | `src/lib/vndb-user-data-sync.ts`, `src/app/api/vn/[id]/vndb-status/route.ts` | DONE_WITH_DIFF |
| R11-VNDB-007 | HIGH | The local notes field accepts up to 50,000 characters while VNDB accepts at most 10,000. Keep longer local notes intact and disable only the local-to-VNDB direction until the user shortens them; never truncate silently. | `src/lib/vndb-user-data-sync.ts`, `src/components/VndbStatusPanel.tsx` | DONE_WITH_DIFF |
| R11-VNDB-008 | HIGH | An absent VNDB status cannot safely mean “remove this title from the local collection.” Disable remote-to-local status resolution when no predefined status label exists; local collection deletion remains a separate explicit action. | `src/lib/vndb-user-data-sync.ts`, `src/components/VndbStatusPanel.tsx` | DONE_WITH_DIFF |
| R11-VNDB-009 | HIGH | Missing rating, date, or notes values are valid conflict operands. Pulling a remote null explicitly clears the corresponding local field, and pushing a local null explicitly clears the VNDB value. | `src/app/api/vn/[id]/vndb-status/route.ts`, route and resolver tests | DONE_WITH_DIFF |
| R11-VNDB-010 | CRITICAL | Conflict decisions must not rely on a cached ulist entry. A manual refresh bypasses the client request cache and the server VNDB cache; every mutation independently fetches a fresh entry before validating the requested fields. | `src/lib/vndb.ts`, `src/lib/vndb-status-client.ts`, `src/app/api/vn/[id]/vndb-status/route.ts` | DONE_WITH_DIFF |
| R11-VNDB-011 | CRITICAL | The values can change after the UI renders but before the user applies a choice. Reject selections whose fields no longer differ or whose direction is no longer legal with a conflict response, then require a fresh comparison instead of applying stale intent. | `src/app/api/vn/[id]/vndb-status/route.ts`, `src/components/VndbStatusPanel.tsx` | DONE_WITH_DIFF |
| R11-VNDB-012 | HIGH | A user needs both bulk convenience and field-level control on the VN page. Offer “use all local” and “use all VNDB” only for currently eligible fields, plus independent controls for every difference; keep controls touch-sized and responsive. | `src/components/VndbStatusPanel.tsx`, component tests | DONE_WITH_DIFF |
| R11-VNDB-013 | HIGH | The direct VNDB entry editor and the local collection editor are distinct surfaces. Saving the VNDB editor changes VNDB only and refreshes the comparison; saving local metadata changes local data only, except for the separate opt-in automatic status write-back setting. | `src/components/VndbStatusPanel.tsx`, `src/app/api/collection/[id]/route.ts` | VERIFIED_EXISTING |
| R11-VNDB-014 | HIGH | Automatic local status write-back must not be surprising. Keep `vndb_writeback` disabled by default, scope it to status only, preserve the completed-label guard, and isolate an upstream failure from the already-committed local edit. Ratings, dates, and notes always use the explicit resolver. | `src/lib/vndb-sync.ts`, `src/components/SettingsButton.tsx`, `src/app/api/collection/[id]/route.ts` | VERIFIED_EXISTING |
| R11-VNDB-015 | MEDIUM | Best-effort automatic write-back cannot provide transactionality across the local database and VNDB. Await its bounded attempt for observability but never roll back a valid local save because the remote service is unavailable; surface explicit VNDB editing through the resolver instead. | `src/lib/vndb-sync.ts`, `src/app/api/collection/[id]/route.ts` | VERIFIED_EXISTING |
| R11-VNDB-016 | HIGH | VNDB Wishlist is independent from local collection ownership/status. Toggling or removing the remote wishlist label must not add, delete, or mutate the local collection row, and a global status pull must skip remote titles absent locally. | `src/components/VndbStatusPanel.tsx`, `src/lib/vndb-sync.ts` | VERIFIED_EXISTING |
| R11-VNDB-017 | CRITICAL | A global pull that immediately writes every discovered difference gives no review or rollback boundary. Split the operation into a read-only preview and an explicit apply step with checkboxes, select-all/clear controls, confirmation, and 25-item pagination. | `src/components/SettingsButton.tsx`, `src/app/api/vndb/pull-statuses/route.ts` | DONE_WITH_DIFF |
| R11-VNDB-018 | CRITICAL | A failure in any one of the five predefined-label scans makes the global status snapshot incomplete. Treat the complete scan as one validity boundary: report failed labels, return zero writes, retain local data, and never call a partial response “fresh.” | `src/lib/vndb-sync.ts`, global pull tests | DONE_WITH_DIFF |
| R11-VNDB-019 | CRITICAL | An apply request can be based on an old preview. Re-fetch all five label sets, recompute proposals, require every selected `from` and `to` pair to still match, and classify changed or missing proposals as conflicts. | `src/lib/vndb-sync.ts`, `src/app/api/vndb/pull-statuses/route.ts` | DONE_WITH_DIFF |
| R11-VNDB-020 | CRITICAL | Local state can change concurrently after the refreshed upstream snapshot. Use compare-and-set persistence for both SQLite and PostgreSQL; PostgreSQL locks the row in a transaction and writes only when the current status still equals the preview's `from` value. | `src/lib/db.ts`, `src/lib/db/repositories/collection-core.ts` | DONE_WITH_DIFF |
| R11-VNDB-021 | HIGH | Global synchronization is intentionally status-only. The label endpoints provide the five status sets efficiently, whereas ratings, dates, and notes require per-entry detail reads and much higher upstream load; keep those personal fields in the fresh per-VN resolver rather than hiding a large fan-out behind one button. | `src/lib/vndb-sync.ts`, `src/components/SettingsButton.tsx` | DONE_WITH_DIFF |
| R11-VNDB-022 | HIGH | Progress should represent real work. The global scan reports determinate progress over the five labels, finishes its job in every return/error path, and the UI reports preview count, selected count, applied count, conflicts, skipped local absences, and incomplete snapshots separately. | `src/lib/vndb-sync.ts`, `src/components/SettingsButton.tsx`, download-status job tests | DONE_WITH_DIFF |
| R11-VNDB-023 | HIGH | Sync endpoints process authenticated personal data and mutations. Require the application write gate, validate bounded duplicate-free field/selection arrays and VN identifiers, sanitize upstream/internal errors, and record only counts and field names rather than token or personal content. | `src/app/api/vn/[id]/vndb-status/route.ts`, `src/app/api/vndb/pull-statuses/route.ts`, API policy tests | DONE_WITH_DIFF |
| R11-VNDB-024 | MEDIUM | Activity logging is secondary evidence and must not turn a successful synchronization into an apparent failure. Log direction and selected field names or aggregate counts, isolate logger errors, and never include raw notes, ratings, tokens, or upstream bodies. | VNDB synchronization API routes | DONE_WITH_DIFF |
| R11-VNDB-025 | MEDIUM | VNDB label scans are paginated remote reads rather than an upstream database transaction. A label set may theoretically change between pages; deterministic precedence, full five-label failure invalidation, apply-time re-fetch, and local compare-and-set limit the consequence, but the integration cannot manufacture an atomic VNDB snapshot. | `src/lib/vndb-sync.ts` | VERIFIED_EXISTING |
| R11-VNDB-026 | MEDIUM | The per-VN resolver intentionally does not offer a one-click global rating/date/notes import because that would create large upstream traffic and a difficult review surface. Keep per-title decisions visible; revisit only with an upstream bulk-detail contract, resumable jobs, bounded preview storage, and explicit rate-limit UX. | VNDB integration architecture | VERIFIED_EXISTING |
| R11-VNDB-027 | HIGH | Focused resolver, route, client decoder/cache, component, SQLite, PostgreSQL, auth, activity, and global-sync tests pass, and both feature revisions build and are deployed on PostgreSQL. These focused runs are not a substitute for the final exact all-project coverage gate tracked by `R11-TEST-001`. | `tests`, production releases `2900eb41` and `4beb016d` | DONE |

## Source-of-truth matrix

| Personal field | Local representation | VNDB representation | Per-VN directions | Global behavior |
| --- | --- | --- | --- | --- |
| Status | `collection.status` enum | Predefined labels 1-5 | Explicit local to VNDB or VNDB to local; remote null cannot delete local membership | Preview and selectively apply VNDB to local for titles already in the collection |
| Numeric rating | `user_rating`, integer 10-100 or null | `vote`, integer 10-100 or null | Explicit push, pull, or clear | Not scanned globally |
| Start date | `started_date`, ISO date or null | `started`, ISO date or null | Explicit push, pull, or clear | Not scanned globally |
| Finish date | `finished_date`, ISO date or null | `finished`, ISO date or null | Explicit push, pull, or clear | Not scanned globally |
| Personal notes | `notes`, up to 50,000 characters | `notes`, up to 10,000 characters | Explicit push, pull, or clear; overlong local notes cannot be pushed | Not scanned globally |

## Operational interpretation

- A difference is information, not an automatic error and not permission to
  overwrite either side. The VN page presents the two values and asks which one
  to keep for each field.
- Editing VNDB directly does not mutate the local collection. Editing the local
  collection does not mutate VNDB personal fields. The sole opt-in exception is
  automatic status write-back, which is disabled by default and isolated from
  local-save success.
- Global comparison imports no new collection titles and deletes none. It only
  proposes status transitions for titles that already have a local collection
  row.
- A complete global preview is disposable evidence. Apply always obtains a new
  complete upstream view and uses local compare-and-set writes; stale decisions
  become visible conflicts.
- Successful focused tests and deployed builds establish feature evidence, but
  final completion still requires the post-audit full suite, exact
  `100 / 100 / 100 / 100` coverage, PostgreSQL checks, and production browser
  verification recorded in the main Round 11 and Round 12 reports.
