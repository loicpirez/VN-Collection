# SQLite recovery runbook

Use this procedure when `data/collection.db` fails an integrity check or the
application reports database corruption. The application must never replace a
database automatically from `.tmp`, a downloaded file, or another host.

This runbook restores the SQLite database only. `data/storage/` contains media
files and must be preserved separately.

## Safety rules

- Stop every application process that can open the database before changing files.
- Resolve the active path from the process configuration. The default is
  `data/collection.db`, but `DB_PATH` can point elsewhere.
- Never validate or restore an actively written copy made with plain `cp`. Use
  the in-app database backup export while the application is running, or stop
  the application before copying the file.
- Keep the original database, its `-wal` file, and its `-shm` file until the
  recovered application has passed verification.
- A file's location or name is not evidence that it is a valid backup. Validate
  every candidate immediately before restoration.

## 1. Stop writes and identify the files

Stop the Next.js process, service, container, and any maintenance script using
the database. Set explicit paths for the rest of the procedure:

```bash
export LIVE_DB="$PWD/data/collection.db"
export CANDIDATE_DB="/absolute/path/to/verified-backup.db"
export RECOVERY_ID="$(date -u +%Y%m%dT%H%M%SZ)"
```

Confirm that both variables are absolute paths and that the candidate is not
the live database:

```bash
test "${LIVE_DB#/}" != "$LIVE_DB"
test "${CANDIDATE_DB#/}" != "$CANDIDATE_DB"
test "$LIVE_DB" != "$CANDIDATE_DB"
test -f "$CANDIDATE_DB"
```

## 2. Preserve the current state

Create a recovery directory on the same trusted host. Preserve the database and
its journaling files without modifying them:

```bash
export RECOVERY_DIR="$(dirname "$LIVE_DB")/recovery-$RECOVERY_ID"
mkdir -m 700 "$RECOVERY_DIR"
cp -p -- "$LIVE_DB" "$RECOVERY_DIR/collection.db.before" 
test ! -f "$LIVE_DB-wal" || cp -p -- "$LIVE_DB-wal" "$RECOVERY_DIR/collection.db-wal.before"
test ! -f "$LIVE_DB-shm" || cp -p -- "$LIVE_DB-shm" "$RECOVERY_DIR/collection.db-shm.before"
```

Record hashes for audit and rollback comparison:

```bash
shasum -a 256 "$RECOVERY_DIR"/* "$CANDIDATE_DB"
```

## 3. Validate the candidate

Run all checks against the candidate, not the live database. `quick_check` and
`integrity_check` must each print exactly `ok`. `foreign_key_check` must print
nothing.

```bash
sqlite3 "$CANDIDATE_DB" 'PRAGMA quick_check;'
sqlite3 "$CANDIDATE_DB" 'PRAGMA integrity_check;'
sqlite3 "$CANDIDATE_DB" 'PRAGMA foreign_key_check;'
sqlite3 "$CANDIDATE_DB" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Reject the candidate if a check reports an error, if foreign-key rows are
printed, or if expected application tables are absent. Do not attempt an
in-place repair of the only copy.

## 4. Stage and atomically replace the database

Copy the candidate beside the live database, validate the staged copy again,
then rename files while the application remains stopped:

```bash
export STAGED_DB="$LIVE_DB.recovery-$RECOVERY_ID"
cp -p -- "$CANDIDATE_DB" "$STAGED_DB"
test "$(sqlite3 "$STAGED_DB" 'PRAGMA quick_check;')" = "ok"
test "$(sqlite3 "$STAGED_DB" 'PRAGMA integrity_check;')" = "ok"
test -z "$(sqlite3 "$STAGED_DB" 'PRAGMA foreign_key_check;')"
mv -- "$LIVE_DB" "$RECOVERY_DIR/collection.db.replaced"
test ! -f "$LIVE_DB-wal" || mv -- "$LIVE_DB-wal" "$RECOVERY_DIR/collection.db-wal.replaced"
test ! -f "$LIVE_DB-shm" || mv -- "$LIVE_DB-shm" "$RECOVERY_DIR/collection.db-shm.replaced"
mv -- "$STAGED_DB" "$LIVE_DB"
chmod 600 "$LIVE_DB"
```

The final `mv` is atomic when the staged file and live database are on the same
filesystem.

## 5. Verify before normal use

Start one application instance. Check the startup log for migration or database
errors, then verify these read flows before allowing writes:

1. Library loads and its item count is plausible.
2. A known VN detail page opens with collection and owned-edition data.
3. Wishlist, shelf, stock, AliceNet shop, places, and map pages load.
4. Settings and activity history load without malformed-response errors.
5. A fresh database backup export completes and passes `PRAGMA quick_check`.

After those reads pass, perform one reversible write, confirm it survives a
restart, then undo it. Keep the recovery directory until the restored database
has been used successfully and a new verified backup exists.

## 6. Roll back

If verification fails, stop the application again. Preserve the failed restored
database for diagnosis and put the untouched pre-recovery files back:

```bash
mv -- "$LIVE_DB" "$RECOVERY_DIR/collection.db.failed-recovery"
cp -p -- "$RECOVERY_DIR/collection.db.before" "$LIVE_DB"
test ! -f "$RECOVERY_DIR/collection.db-wal.before" || cp -p -- "$RECOVERY_DIR/collection.db-wal.before" "$LIVE_DB-wal"
test ! -f "$RECOVERY_DIR/collection.db-shm.before" || cp -p -- "$RECOVERY_DIR/collection.db-shm.before" "$LIVE_DB-shm"
```

Do not restart normal writes against a database that still fails integrity
checks. Preserve all evidence and recover from another independently verified
backup.
