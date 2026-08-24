# PostgreSQL operations

This document covers steady-state operation after a reviewed PostgreSQL
cutover. Use the migration runbook for rehearsal, initial copy, verification,
cutover, and rollback.

## Production baseline

The 2026-08-24/25 cutover established this verified baseline:

- PostgreSQL 16.15 listens on loopback only, requires SCRAM authentication,
  uses data-page checksums, and limits the server to 50 connections;
- separate migrator, application, and backup roles implement least privilege,
  while the web pool is capped at 10 connections;
- all nine ordered migrations are recorded and 57 application tables are
  present;
- the non-root systemd service reads a root-owned mode-0640 environment file,
  writes only to its data directory, and has no Linux capabilities;
- the application port is loopback-only and Nginx owns public HTTPS, HSTS, and
  Basic Auth;
- readiness reports `backend=postgres`, database availability, and bounded pool
  counters without exposing a connection string or SQL detail.

The systemd sandbox includes `NoNewPrivileges`, private temporary files and
devices, a read-only system surface, protected home/kernel/control groups,
restricted namespaces and realtime operations, invisible process details, and
an empty capability set. Re-run `systemd-analyze security vndb.service` after a
unit change and treat a material regression from the measured 2.9 exposure
score as a deployment review item, not as an automatic tuning target.

Install the reviewed unit from `ops/systemd/vndb.service`. Next's standalone
process exits with status 143 after the requested `SIGTERM`; the unit records
that one status as successful so a deliberate rolling restart does not create a
false failure alert. `Restart=on-failure` still applies to every unexpected exit
status. After changing the unit, run `systemctl daemon-reload`, restart once,
and verify both `Result=success` and `NRestarts=0`.

## Deployment contract

- Apply reviewed migrations with `yarn db:postgres:apply` as a separate
  pre-deployment job. Application startup validates versions but never changes
  schema.
- Supply `DATABASE_URL` through the deployment secret manager. Never bake it
  into an image, Compose file, health URL, log, or generated report.
- Use `DATABASE_SSL_MODE=verify-full` for remote production databases with a
  trusted certificate. `require` encrypts traffic but does not verify identity.
- Set pool size per application instance so the sum of all instances, migration
  jobs, workers, and operator sessions stays below the server connection limit.
- Keep `DATABASE_STATEMENT_TIMEOUT_MS` and `DATABASE_LOCK_TIMEOUT_MS` bounded.
  Increase them only from observed query plans, never as the first response to
  slow or blocked SQL.

The production image is multi-stage and digest-pinned. It runs as UID/GID 10001,
contains no `.env*` or local database, and writes only to `/app/data` for media
and any explicit SQLite rollback deployment. Mount that path as a dedicated
volume with ownership 10001:10001. Keep the root filesystem read-only where the
orchestrator permits it and grant no privileged mode, host network, Docker
socket, or host-path access.

## Health and readiness

The public-safe endpoint accepts two checks:

```text
GET /api/health?check=live
GET /api/health?check=ready
```

`live` confirms the Node process can answer HTTP and never queries configuration
or the database. Use it only to decide whether a stuck process should restart.

`ready` executes a minimal query against the selected backend. PostgreSQL also
passes through the exact schema-version gate and returns only bounded pool
counters. Use it to admit traffic. A failure returns HTTP 503 with
`database_unavailable`; it never returns connection strings, SQL, table names,
constraints, or driver messages.

Recommended probe behavior:

- liveness: 30-second interval, 5-second timeout, 3 failures after a 30-second
  startup grace period;
- readiness: 5-second interval, 3-second timeout, remove after 2 failures and
  require 2 successes before restoring traffic;
- deployment: do not admit traffic until startup instrumentation and readiness
  both pass.

The image healthcheck uses liveness. Configure readiness separately in the
orchestrator because Dockerfile `HEALTHCHECK` cannot represent both semantics.

## Graceful shutdown

On PostgreSQL startup, instrumentation installs idempotent one-shot `SIGTERM`
and `SIGINT` listeners. They begin closing the shared pool while Next.js retains
ownership of HTTP draining and process exit. Give each instance at least 30
seconds of termination grace, stop admitting requests first, and stop background
workers before web instances when possible.

During shutdown, monitor for the generic
`[postgres:shutdown] failed to close the connection pool` event. The log never
contains credentials or raw driver detail. Investigate it before forced restarts
become routine.

## Backup policy

At minimum:

1. Run a daily PostgreSQL custom-format logical backup with `pg_dump` from a
   restricted backup identity.
2. Back up `/app/data/storage` separately; database backups do not contain local
   media files.
3. Encrypt backups at rest, restrict read/delete permissions, and store a copy
   outside the database host.
4. Retain at least 7 daily and 4 weekly restore points, adjusted for collection
   update frequency and storage policy.
5. Validate every archive with `pg_restore --list`.
6. Perform a full restore into an isolated database at least weekly, apply the
   schema/version check, run migration verification where a retained SQLite
   baseline exists, and execute repository plus browser smoke.
7. Alert on missed, empty, unexpectedly small/large, unreadable, or expired
   backups.

Never test restore over the active production database.

### Installed production schedules

The production host has two persistent systemd timers:

- a daily custom-format PostgreSQL dump, scheduled from 03:35 UTC with a
  randomized delay and retained for 35 days;
- a weekly media-storage archive, scheduled from 04:30 UTC on Sunday with a
  randomized delay and retained for 35 days.

Both writers use a root-owned destination and restrictive umask. The database
job authenticates with the dedicated backup role, writes through a temporary
file, validates the completed archive with `pg_restore --list`, writes a
SHA-256 sidecar, and only then exposes the new restore point. The storage job
uses the same temporary-file, checksum, and atomic-publication pattern.

The cutover dump was restored into an isolated temporary database after all
nine migrations were applied. Counts for collection, VN, AliceNet, and schema
migrations matched production; all 57 public tables were present and no
constraint remained unvalidated. The temporary restore was removed only after
that proof passed. Keep at least one current encrypted copy outside the
database host; the on-host timers do not protect against total host loss.

### In-application logical backups

The authenticated Backup action on `/data` follows the configured backend. In
SQLite mode it downloads an online `.db` snapshot. In PostgreSQL mode it
downloads a versioned `.vncbackup` stream containing the exact application
table and column manifest, applied migration versions, per-table counts, and a
SHA-256 digest over every row record. PostgreSQL rows are read through bounded
server-side cursor batches under one repeatable-read transaction. Local media
under `/app/data/storage` is not included.

Uploading a `.vncbackup` requires typing `RESTORE` in the UI and the API checks
the same explicit confirmation header. The server bounds total bytes and record
size, validates the schema and migration set, computes the digest while
streaming into temporary staging tables, and only then replaces all application
tables in one transaction. It verifies every destination count and realigns
identity sequences before commit. Any parse, integrity, constraint, count, or
database failure rolls the transaction back and leaves the active data intact.

An in-application restore is intentionally destructive and is meant for an
operator-controlled single-user deployment. Keep scheduled `pg_dump` archives
as the independent disaster-recovery layer. Test those archives in an isolated
database; use the in-application restore only during an announced maintenance
window with application background jobs stopped.

## Distributed background-job ownership

AliceNet, global refresh, and bulk stock refresh acquire owner-bound rows in
`app_job_lock` before doing work. AliceNet and global refresh each have one
cluster-wide slot; stock refresh has two named slots, so the documented queue
capacity is shared by all web and worker instances instead of being multiplied
per process. Acquisition uses one atomic `INSERT ... ON CONFLICT ... WHERE`
statement. Renewal and release both require the same random owner token.

Workers renew before and after bounded phases. A failed renewal is treated as
lost ownership: no new phase starts, active stock requests are aborted, the job
is finalized as incomplete, and the failure remains visible in Downloads.
Release failures are contained and reported; the expiry timestamp recovers a
slot after process or network failure without allowing an old owner to delete a
new owner's lock. Monitor repeated lease loss as a database availability or
worker-duration incident rather than increasing the queue size.

## Monitoring

Collect these signals per instance and database:

- readiness status and latency;
- pool `total`, `idle`, `waiting`, and configured `max`;
- query duration, statement timeouts, lock timeouts, deadlocks, serialization
  retries, unique/foreign-key conflicts, and connection errors by stable code;
- PostgreSQL active connections, long transactions, blocked queries, database
  size, table/index growth, cache hit ratio, checkpoints, WAL volume, replica lag
  when applicable, and disk free space;
- AliceNet, stock, metadata, and download job duration/failure/cancellation;
- API 5xx/503 rate and page-level data-load failures, not just HTTP 200 counts.

Investigate immediately when pool waiters persist, total connections remain near
the maximum, readiness flaps, lock/statement timeouts repeat, a transaction stays
open unexpectedly, or background jobs stop advancing. Capture the responsible
query and `EXPLAIN (ANALYZE, BUFFERS)` in an isolated or safely sampled context
before adding indexes or increasing timeouts.

## JSON quarantine

`postgres_json_quarantine` is populated only by the SQLite migration tool. It is
not a runtime fallback and application queries must not read it. Monitor counts
by `table_name` and `column_name` without selecting `raw_value`. A nonzero count
after rehearsal or final copy blocks cutover. Restrict access to `raw_value`
because it preserves the exact historical cell content for operator-led repair.
PostgreSQL repositories must query normalized tables such as
`vn_developer_index`, `vn_publisher_index`, `vn_tag_index`,
`vn_language_index`, and `vn_platform_index` rather than casting JSON text.

## Search indexes

Migrations `0003_search_normalization` and `0004_text_search` install the shared
`app_search_normalize` NFKC/lower function and `pg_trgm` GIN indexes. VN title,
AliceNet inventory, collection notes, custom descriptions, and quotes must use
that function with escaped bound `LIKE` patterns. Do not replace it with an
English-only `tsvector` configuration because Japanese text is not segmented by
that configuration and the product contract is literal substring search.

After a significant data-size or PostgreSQL-version change, capture
`EXPLAIN (ANALYZE, BUFFERS)` for representative Latin, Japanese, full-width, and
literal wildcard queries. Investigate plans that stop selecting the expected
trigram index before changing timeouts or index policy.

## Incident response

1. Stop new background jobs and reduce traffic without terminating the only
   diagnostic connection.
2. Confirm whether the fault is application, pool, network/TLS, database
   availability, lock contention, capacity, or schema mismatch.
3. Preserve sanitized application logs, PostgreSQL logs, active/blocked query
   snapshots, pool counters, health output, deployment identity, and timing.
4. Do not rerun migrations, use `--replace`, restore a backup, or switch backend
   until the source of truth and potential write delta are understood.
5. Follow the migration runbook rollback rules. After PostgreSQL accepted writes,
   a blind switch to the old SQLite snapshot is data loss.
