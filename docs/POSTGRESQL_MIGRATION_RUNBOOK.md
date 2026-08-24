# PostgreSQL migration and rollback runbook

This runbook controls the SQLite-to-PostgreSQL cutover. It is intentionally
fail-closed: a successful schema command or row copy alone is not approval to
switch production traffic.

## Current constraints

- SQLite remains the default while application-wide repository parity is in
  progress. `DATABASE_BACKEND=sqlite-readonly` is the explicit compatibility
  mode for final source validation: it opens an existing file without creating
  directories, applying migrations, or permitting application writes.
- The migration reads SQLite in read-only mode and never edits the source file.
- The migration does not implement an online delta or dual writes. Final
  migration therefore requires a maintenance window with all application writes
  stopped.
- `--replace` truncates the PostgreSQL application tables before copying. Use it
  only on an isolated staging destination or after preserving a verified
  PostgreSQL backup.
- PostgreSQL writes made after cutover cannot currently be merged back into the
  SQLite source automatically. Complete validation before reopening writes.

## Operator inputs

Set these values in the operator shell or secret manager. Do not paste
credentials into tickets, logs, reports, or command history shared with others.

```bash
export SQLITE_SOURCE=/absolute/path/to/collection.db
export DATABASE_BACKEND=postgres
export DATABASE_URL='postgresql://user:password@host:5432/vndb_collection'
export MIGRATION_REPORT=/absolute/path/to/postgres-migration-verification.json
```

Record the application build identifier, migration file checksums, operator,
start time, source size, destination database, and backup locations in the
change record.

## 1. Preflight

1. Confirm the planned build passed typecheck, full tests, exact
   100/100/100/100 coverage, build, and browser QA.
2. Confirm every file in `db/postgres/migrations/` was reviewed and uses a
   sequential `0001_name.sql` filename with one outer `BEGIN`/`COMMIT` wrapper.
3. Confirm PostgreSQL version, free disk, connection limits, TLS policy,
   statement timeout, lock timeout, and backup retention meet the deployment
   requirements.
4. Confirm the destination is isolated from the current production app.
5. Stop scheduled imports, AliceNet jobs, stock refreshes, metadata downloads,
   and any other background writer before taking the final source snapshot.
6. Start any source-side verification instance with
   `DATABASE_BACKEND=sqlite-readonly`; readiness and read paths remain
   available, while SQLite `query_only` rejects every accidental write.

With application writes stopped, validate the source:

```bash
sqlite3 "$SQLITE_SOURCE" 'PRAGMA quick_check;'
sqlite3 "$SQLITE_SOURCE" 'PRAGMA foreign_key_check;'
```

`quick_check` must print exactly `ok`. `foreign_key_check` must print no rows.
Any other result is a no-go; follow the SQLite recovery runbook before
continuing.

## 2. Preserve rollback artifacts

Keep the application stopped while copying SQLite so the database, WAL, and SHM
cannot diverge. Preserve every existing member of the set:

```text
collection.db
collection.db-wal
collection.db-shm
```

Store the files under a timestamped, read-only backup directory and calculate a
SHA-256 checksum for each. Do not move or overwrite the original source.

If the PostgreSQL destination contains any prior data, preserve it before
`--replace`:

```bash
pg_dump --format=custom --file=/secure/backup/pre-cutover.dump "$DATABASE_URL"
pg_restore --list /secure/backup/pre-cutover.dump >/dev/null
```

The second command validates that the archive directory can be read; it does not
restore data.

## 3. Apply the reviewed PostgreSQL schema

Apply migrations only with the explicit runner:

```bash
yarn db:postgres:apply
```

The command takes a process-independent advisory lock, applies each pending file
inside a runner-owned transaction, records the version in `schema_migration`,
and rolls back the failed file. It must end with an exact applied/skipped version
summary. The application itself never applies schema changes during startup.

## 4. Copy the final SQLite snapshot

For a new empty destination:

```bash
yarn db:postgres:migrate \
  --sqlite "$SQLITE_SOURCE" \
  --postgres "$DATABASE_URL" \
  --batch-size 250
```

For a disposable destination that was already populated during rehearsal, add
`--replace` only after verifying the backup from step 2:

```bash
yarn db:postgres:migrate \
  --sqlite "$SQLITE_SOURCE" \
  --postgres "$DATABASE_URL" \
  --batch-size 250 \
  --replace
```

Accepted batch sizes are 1 through 1000. The tool further bounds each INSERT to
stay below PostgreSQL's bind-parameter limit. A table failure rolls back that
table and exits nonzero; because earlier tables may already be committed, treat
the destination as failed and recreate or replace it before retrying.

The copy validates every column listed in `POSTGRES_JSON_COLUMNS`. Valid JSON is
copied as `TEXT` to preserve existing application contracts. A non-empty
malformed value is stored as `NULL` in the domain table and preserved in
`postgres_json_quarantine` with its source table, column, SQLite `rowid`, scalar
kind, and raw value. The domain row and quarantine row share the same table
transaction. The command output reports `quarantinedValues` per table.

Count quarantined values without printing raw content:

```sql
SELECT table_name, column_name, COUNT(*) AS quarantined
FROM postgres_json_quarantine
GROUP BY table_name, column_name
ORDER BY table_name, column_name;
```

Any nonzero result blocks cutover until the operator identifies the source row,
repairs it in a working copy of the SQLite snapshot, repeats the migration into
a clean destination, and confirms that the quarantine is empty. Keep the
original SQLite snapshot immutable.

## 5. Verify independently

Run the independent verifier against the exact source snapshot:

```bash
yarn db:postgres:verify \
  --sqlite "$SQLITE_SOURCE" \
  --postgres "$DATABASE_URL" \
  --report "$MIGRATION_REPORT"
```

Approval requires all of the following:

- source SQLite integrity and foreign-key checks pass;
- every table row count matches;
- primary-key definitions, sets, and checksums match;
- every non-empty valid contractual JSON field is decodable and copied, and
  malformed values exactly match the quarantine counts;
- collection status, stock availability, tag spoiler, staff kind, shelf
  occupancy, and place-link aggregates match;
- the report has `ok: true` and is retained with the change record.

Then run repository write/read/cleanup smoke checks:

```bash
yarn db:postgres:smoke
```

The smoke command uses reserved synthetic identifiers and removes them in its
cleanup path. Any failed cleanup is a no-go until inspected.

## 6. Pre-cutover application validation

Start the candidate build on a private port against PostgreSQL. Do not route
public traffic yet:

```bash
PORT=3001 yarn start
```

The Next.js Node bootstrap must pass the exact `schema_migration` version check.
Validate at minimum:

- library load, filters, grouping, pagination, and collection writes;
- wishlist add/remove and bulk operations;
- VN detail, owned editions, release art, stock lookup, and comparison;
- shelf read-only rendering, edit drag/drop, clipping, and fade boundaries;
- stock summary, per-provider refresh, AliceNet shop controls and progress;
- shops, place details, map privacy opt-in, modal stacking, and geocoding;
- search, tags, staff, producers, dumped state, backup, and restore surfaces;
- background job progress, stop behavior, SSE/polling, and error recovery;
- desktop Chromium, desktop Safari/WebKit, and mobile responsive navigation.

Check server logs for schema mismatch, unhandled promise rejection, pool timeout,
statement timeout, deadlock, foreign-key, and unique-constraint errors. A page
returning HTTP 200 is not sufficient when its application data failed to load.

## 7. Cutover

Proceed only while writes are still disabled and every previous gate is green.

1. Keep the SQLite artifacts and PostgreSQL dump immutable.
2. Set the production backend to `postgres` with the reviewed URL, TLS mode,
   pool size, and timeouts.
3. Start exactly one candidate instance and wait for bootstrap readiness.
4. Run health, repository smoke, and the critical browser flows again.
5. Add remaining instances only after the first is healthy.
6. Re-enable public traffic while keeping mutating/background operations paused.
7. Perform a final read-only smoke, then deliberately re-enable writes and jobs.
8. Monitor connection saturation, latency, timeouts, deadlocks, error-code rates,
   job duration, and data growth throughout the rollback window.

## 8. Rollback triggers

Rollback before writes reopen when any of these occurs:

- migration/version, row-count, checksum, JSON, aggregate, or smoke mismatch;
- critical page or API data fails to load;
- collection, shelf, stock, map, wishlist, or background-job behavior differs;
- PostgreSQL connections saturate or time out under expected load;
- repeated deadlocks, serialization failures, or constraint failures appear;
- the operator cannot explain a data discrepancy with retained evidence.

After PostgreSQL writes reopen, stop writes immediately and assess the delta
before rollback. A blind switch to the old SQLite snapshot would discard those
writes and is prohibited.

## 9. Rollback procedure

When rollback is still lossless because PostgreSQL writes never reopened:

1. Stop all candidate instances and background workers.
2. Restore the preserved SQLite database/WAL/SHM set to a new staging path.
3. Re-run SQLite `quick_check` and `foreign_key_check` on that restored copy.
4. Set `DATABASE_BACKEND=sqlite-readonly` and `DB_PATH` to the verified restored
   copy, then run critical read-only smoke tests.
5. Deliberately switch to `DATABASE_BACKEND=sqlite`, restart one instance, and
   run the reversible-write smoke tests.
6. Restore public traffic, then background jobs.
7. Preserve the failed PostgreSQL database and logs for diagnosis; do not erase
   evidence or retry destructive migration commands against it.

If PostgreSQL accepted writes, export and reconcile the PostgreSQL delta under a
separate approved recovery plan before selecting either source of truth.

## 10. Closeout evidence

Attach the following to the change record:

- source and backup checksums;
- PostgreSQL dump validation output;
- migration result and independent JSON report;
- schema version query/result;
- repository smoke output;
- full test, coverage, build, and browser QA summaries;
- pre/post-cutover health and latency samples;
- decision, operator, timestamps, and rollback-window close time.
