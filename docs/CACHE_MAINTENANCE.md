# VNDB cache retention

## Measured production state on 2026-10-01

`vndb_cache` contains 63,532 rows and occupies 375 MB including indexes and TOAST data. Its cache bodies divide by expiry age as follows:

| Expiry age | Rows | Body bytes reported by PostgreSQL |
| --- | ---: | ---: |
| Fresh | 990 | 5.4 MB |
| Expired less than 1 day | 13 | 126 KB |
| Expired 1 to 7 days | 4,863 | 19 MB |
| Expired 7 to 30 days | 3,106 | 25 MB |
| Expired 30 to 90 days | 12,451 | 77 MB |
| Expired at least 90 days | 42,109 | 169 MB |

The table stores `fetched_at` and `expires_at`, but no last-access timestamp. Cache reads do not update an access field, so a true least-recently-used policy cannot be justified from production data. The bounded policy therefore retains all fresh rows and 30 days of expired rows for stale fallback, then deletes at most 5,000 of the oldest eligible rows per daily run. At the measured state, 54,560 rows and about 246 MB of body data qualify, so the initial cleanup takes at least eleven runs and cannot create a single large delete transaction.

Deletion releases space for reuse inside PostgreSQL. It does not immediately reduce the filesystem size of the relation. The job logs total rows, body bytes, relation bytes, estimated dead rows, deleted rows, and deleted body bytes. Review autovacuum after the initial cleanup. Use a scheduled maintenance window for `VACUUM FULL` only if filesystem reclamation is necessary, because it takes an exclusive table lock.

## Installation

```bash
sudo install -o root -g root -m 0755 \
  ops/maintenance/vndb-cache-prune \
  /usr/local/sbin/vndb-cache-prune
sudo install -o root -g root -m 0644 \
  ops/systemd/vndb-cache-prune.service \
  ops/systemd/vndb-cache-prune.timer \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start vndb-cache-prune.service
sudo systemctl enable --now vndb-cache-prune.timer
```

The service uses the application database identity from `/etc/vndb/vndb.env`, which already has the cache delete permission used by the application. It does not require migration credentials or a superuser. Its default run is before the daily PostgreSQL backup so expired bulk data ages out of new dumps.

## Monitoring

```bash
systemctl list-timers vndb-cache-prune.timer
systemctl status vndb-cache-prune.service --no-pager
journalctl -u vndb-cache-prune.service -n 30 --no-pager
sudo -u postgres psql -X -d vndb_collection -c \
  "SELECT n_live_tup,n_dead_tup,last_autovacuum,last_autoanalyze FROM pg_stat_user_tables WHERE relname='vndb_cache';"
```

Change `VNDB_CACHE_EXPIRED_RETENTION_DAYS` or `VNDB_CACHE_PRUNE_BATCH_SIZE` in the unit only after measuring stale-fallback requirements and transaction duration. Both values must be positive integers.
