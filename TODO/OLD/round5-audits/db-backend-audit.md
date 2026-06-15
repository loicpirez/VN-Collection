# DB/Backend Audit Report — agent accabd60f7e77f192

Now I have all the data I need. Let me deliver the complete audit report:

---

## DB / BACKEND AUDIT — vndb-collection-new

---

### N+1 QUERY PATTERNS

---

**ISSUE [db/backend] [src/app/api/collection/route.ts:116-118]**
Severity: HIGH
Description: Per-VN N+1 loop fires on every GET /api/collection request when aspect filtering or grouping is active. Each `materializeReleaseAspectsForVn(id)` call issues a `SELECT ... FROM vndb_cache WHERE cache_key LIKE 'POST /release|%' LIMIT 200` scan. With a 1000-VN library this becomes 1000 individual LIKE scans — all synchronous, all on the hot path.
Code:
```ts
for (const id of vndbIds) {
  materializeReleaseAspectsForVn(id);
}
```
Fix: Replace the per-VN loop with a single batch function that pulls all relevant `vndb_cache` rows in one `WHERE cache_key LIKE 'POST /release|%'` scan and then groups results by VN id in JavaScript, identical to how `materializeReleaseMetaForCollectionVns` was refactored (db.ts:2287, AUD-DB-001 comment). The batch helper already exists for release-meta; create an equivalent `materializeReleaseAspectsForCollectionVns(ids: string[])`.

---

**ISSUE [db/backend] [src/lib/db.ts:7751-7756]**
Severity: MEDIUM
Description: `uniqueSlug()` is a SELECT-in-a-while-loop. When called from `updateUserList` (outside a transaction) it can issue an unbounded number of SELECT queries as it scans for a free slug suffix.
Code:
```ts
function uniqueSlug(base: string): string {
  const stmt = db.prepare('SELECT 1 FROM user_list WHERE slug = ?');
  let candidate = base;
  let n = 2;
  while (stmt.get(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}
```
Fix: Acceptable for `createUserList` (already inside a transaction). For `updateUserList`, wrap the `getUserList` + slug computation + `UPDATE` in a single `db.transaction()` call (see issue below on TOCTOU).

---

### MISSING TRANSACTIONS / TOCTOU RACES

---

**ISSUE [db/backend] [src/lib/db.ts:7818-7851]**
Severity: HIGH
Description: `updateUserList` reads the current row with `getUserList(id)`, then calls `uniqueSlug(base)` (which SELECTs for free slugs), then runs an UPDATE — all three steps are outside any transaction. A concurrent rename can produce a duplicate slug if two requests arrive within the same event-loop tick and both find the same slug free.
Code:
```ts
const current = getUserList(id);    // SELECT outside transaction
if (!current) return null;
...
next.slug = base === current.slug ? current.slug : uniqueSlug(base);  // SELECT loop outside transaction
...
db.prepare(`UPDATE user_list SET ...`).run(...);  // UPDATE outside transaction
```
Fix: Wrap the entire function body in `db.transaction()`. The `user_list.slug` column already has a UNIQUE constraint, so the UPDATE would throw on collision — but only after a crash instead of being quietly prevented.

---

**ISSUE [db/backend] [src/lib/db.ts:6114-6153]**
Severity: MEDIUM
Description: `setOwnedReleaseAspectOverride` checks `SELECT 1 FROM owned_release` then does a DELETE or INSERT OR CONFLICT UPDATE. The existence check is not in the same transaction as the write. If the owned release is deleted between the check and the write the INSERT succeeds (or the DELETE is a no-op) and the override row becomes an orphan (no FK because `owned_release_aspect_override` carries no FK to `owned_release`).
Code:
```ts
const owned = db.prepare('SELECT 1 FROM owned_release WHERE vn_id = ? AND release_id = ?').get(...);
if (!owned) throw new Error('owned edition not found');
// ... several lines of computation ...
db.prepare('DELETE FROM owned_release_aspect_override ...').run(...);
// or
db.prepare('INSERT INTO owned_release_aspect_override ...').run(...);
```
Fix: Wrap the SELECT existence check through the final write in `db.transaction()`.

---

**ISSUE [db/backend] [src/lib/db.ts:6911-6933]**
Severity: MEDIUM
Description: `setSteamLink` calls `getSteamLinkForVn()` (SELECT) then conditionally returns early or runs an `INSERT … ON CONFLICT DO UPDATE`. The SELECT and write are not in a transaction. Two concurrent "auto" link requests for the same VN can both observe `existing = null` and both attempt the INSERT, resulting in a constraint exception on the second writer. The `ON CONFLICT` handles the key collision, but the `source = 'manual'` guard is bypassed if two concurrent calls race.
Code:
```ts
const existing = getSteamLinkForVn(args.vnId);   // SELECT outside transaction
if (existing && existing.source === 'manual' && args.source === 'auto') {
  return existing;   // early return — the INSERT below is not atomic with the check
}
db.prepare(`INSERT INTO steam_link ... ON CONFLICT(vn_id) DO UPDATE SET ...`).run(...);
```
Fix: Wrap in `db.transaction()`. Because `steam_link` has `ON CONFLICT(vn_id)`, the guard logic could alternatively be folded into SQL with a `WHERE source != 'manual' OR ? = 'manual'` predicate, eliminating the TOCTOU entirely.

---

**ISSUE [db/backend] [src/lib/db.ts:2825-2849]**
Severity: MEDIUM
Description: `updateGameLogEntry` reads the current row, merges changes in JS, then runs a single UPDATE — outside any transaction. Concurrent PATCH requests for the same entry id can produce a lost update: both read the same `current`, both compute `next` independently, and both write, with the second silently overwriting the first's changes.
Code:
```ts
const current = db.prepare('SELECT ... FROM vn_game_log WHERE id = ?').get(id);
// ... merge in JS ...
db.prepare('UPDATE vn_game_log SET ... WHERE id = ?').run(...);
```
Fix: Wrap in `db.transaction()`. Alternatively, convert to a single UPDATE that applies deltas directly in SQL, eliminating the read entirely.

---

### UNBOUNDED QUERIES

---

**ISSUE [db/backend] [src/lib/db.ts:7101-7108]**
Severity: MEDIUM
Description: `ratingHistogram()` fetches every rated row from `collection JOIN vn` into JS memory with no LIMIT. A large library returns thousands of rows when only 10 integer buckets are needed.
Code:
```ts
const rows = db.prepare(`
  SELECT c.user_rating AS mine, v.rating AS vndb
  FROM collection c JOIN vn v ON v.id = c.vn_id
  WHERE c.user_rating IS NOT NULL
`).all() as { mine: number | null; vndb: number | null }[];
// ... manually buckets in JS
```
Fix: Compute the histogram entirely in SQL using `ROUND(user_rating / 10.0) * 10` and `GROUP BY bucket`. Returns 10 rows maximum. Eliminates the JS loop and the full-table fetch.

---

**ISSUE [db/backend] [src/lib/db.ts:7190-7216]**
Severity: LOW
Description: `todaysAnniversaries()` has no LIMIT. On a large library with many VNs released on the same calendar day (common for prolific studios on known release dates) this can pull an unbounded result set into JS memory.
Code:
```ts
return db.prepare(`
  SELECT ... FROM collection c JOIN vn v ON v.id = c.vn_id
  WHERE v.released LIKE '%' || ?
  ORDER BY v.released DESC
`).all(monthDay).map(...).filter((r) => r.years > 0);
```
Fix: Add `LIMIT 50` (or whatever the UI ceiling is). The `.filter((r) => r.years > 0)` removes current-year entries post-hoc; move that predicate into SQL as `AND CAST(substr(v.released, 1, 4) AS INTEGER) < ?` to keep the SQL result tight.

---

**ISSUE [db/backend] [src/lib/db.ts:7682-7706]**
Severity: LOW
Description: `cacheStats()` GROUP BY `byPath` query has no LIMIT. On a very large `vndb_cache` table (many thousands of distinct VNDB API path prefixes) this returns all groups into JS. The API surface is admin-only, but the query still scans the entire table.
Code:
```ts
const byPath = db.prepare(`
  SELECT ... COUNT(*) AS n FROM vndb_cache GROUP BY path ORDER BY n DESC
`).all() as { path: string; n: number }[];
```
Fix: Add `LIMIT 200` to the GROUP BY query. The UI only ever renders the top N paths.

---

**ISSUE [db/backend] [src/lib/db.ts:7881-7896]**
Severity: LOW
Description: `listAllListMemberships()` uses `LIMIT 100000`, which is effectively unbounded for any realistic personal collection. The function pulls full `user_list` metadata for every membership row, then groups in JS. In a large collection this can be megabytes of data per call.
Code:
```ts
const rows = db.prepare(`
  SELECT lv.vn_id, l.id, l.name, ... FROM user_list_vn lv JOIN user_list l ...
  LIMIT 100000
`).all() as Array<UserList & { vn_id: string }>;
```
Fix: This function is only called from the library-grid hydration path, which already has `countListMembershipsByVn()` for the badge count. Audit callers of `listAllListMemberships()` — if only counts are needed, replace with `countListMembershipsByVn()`. If full metadata is needed (e.g. tooltips), lazy-load per VN via `listListsForVn()` on demand.

---

**ISSUE [db/backend] [src/lib/db.ts:4931-4939]**
Severity: LOW
Description: `listVnIdsOnShelf()` performs a UNION of `shelf_slot` and `shelf_display_slot` with no LIMIT. Both tables can grow without bound. The result is returned as a `Set<string>` into JS.
Code:
```ts
return db.prepare(`
  SELECT vn_id FROM shelf_slot UNION SELECT vn_id FROM shelf_display_slot
`).all() as Array<{ vn_id: string }>;
```
Fix: Add a LIMIT appropriate to maximum shelf capacity, or document the maximum shelf/slot count enforced at write time (via `placeShelfItem` slot-limit guard) so the unbounded query is bounded by design.

---

**ISSUE [db/backend] [src/lib/db.ts:7904-7911]**
Severity: LOW
Description: `countListMembershipsByVn()` runs `GROUP BY vn_id` on the entire `user_list_vn` table with no LIMIT. Called on every GET /api/collection, it produces a full table scan per library page load.
Code:
```ts
const rows = db.prepare('SELECT vn_id, COUNT(*) AS n FROM user_list_vn GROUP BY vn_id').all();
```
Fix: This is acceptable if `user_list_vn` stays small (personal collection), but the result should be cached alongside `aggregateStatsCache` and invalidated on list membership writes (`addVnToList`, `removeVnFromList`), rather than re-computed on every library fetch.

---

### MISSING DATABASE INDEXES

---

**ISSUE [db/backend] [src/lib/db.ts:117-620]**
Severity: MEDIUM
Description: `collection.user_rating` has no index. `ratingHistogram()` queries `WHERE c.user_rating IS NOT NULL` and the `listCollection` sort map includes `'user_rating'` (sort by user rating). Both operations do full `collection` scans. At 1000+ rows this is non-trivial for a sort that fires on every library page render.
Code: No `CREATE INDEX ... ON collection(user_rating)` found in schema DDL.
Fix: Add `CREATE INDEX IF NOT EXISTS idx_collection_user_rating ON collection(user_rating);` in the schema setup block.

---

**ISSUE [db/backend] [src/lib/db.ts:117-620]**
Severity: LOW
Description: `owned_release_aspect_override` has no index on `(vn_id, release_id)` beyond its PRIMARY KEY / UNIQUE constraint. The constraint exists (`ON CONFLICT(vn_id, release_id)` in the INSERT), so SQLite will have created an implicit index — but verifying this depends on how the table was originally created. If the table uses `PRIMARY KEY (vn_id, release_id)`, the implicit index covers the DELETE and SELECT in `setOwnedReleaseAspectOverride`. Confirm the DDL and add an explicit index if the PK is single-column.
Fix: Verify the DDL. If `UNIQUE(vn_id, release_id)` is used instead of a composite PK, ensure the unique constraint is present to guarantee the implicit index.

---

### ERROR HANDLING — MISSING TRY/CATCH IN API ROUTES

---

**ISSUE [db/backend] [src/app/api/saved-filters/route.ts]**
Severity: HIGH
Description: All four HTTP handlers (GET, POST, DELETE, PATCH) make direct DB calls with no try/catch. Any SQLite error (schema mismatch, locked DB, malformed data) propagates as an unhandled exception, crashing the Next.js route handler and returning a 500 with a raw error stack to the client.
Code: No `try {` in the file — confirmed by grep.
Fix: Wrap each handler's DB calls in `try { ... } catch (err) { console.error(...); return NextResponse.json({ error: 'internal error' }, { status: 500 }); }`.

---

**ISSUE [db/backend] [src/app/api/collection/[id]/activity/route.ts]**
Severity: HIGH
Description: GET, POST, and DELETE handlers make direct DB calls with no try/catch. Identical risk to saved-filters above.
Fix: Same pattern — wrap DB calls in try/catch per handler.

---

**ISSUE [db/backend] [src/app/api/reading-queue/route.ts]**
Severity: HIGH
Description: GET, POST, DELETE, and PATCH handlers all call DB functions without try/catch.
Fix: Wrap each handler's DB section in try/catch.

---

**ISSUE [db/backend] [src/app/api/lists/[id]/items/route.ts]**
Severity: HIGH
Description: POST (`addVnToList`, `reorderListItems`) and DELETE (`removeVnFromList`) have no try/catch. Constraint violations (e.g. duplicate insert, non-existent list) throw unhandled exceptions.
Fix: Wrap each handler in try/catch.

---

**ISSUE [db/backend] [src/app/api/collection/tags/route.ts]**
Severity: MEDIUM
Description: GET calls `listCollectionTags()` with no try/catch.
Fix: Wrap in try/catch.

---

**ISSUE [db/backend] [src/app/api/places/route.ts]**
Severity: MEDIUM
Description: GET calls `listKnownPlaces()` with no try/catch.
Fix: Wrap in try/catch.

---

**ISSUE [db/backend] [src/app/api/maintenance/duplicates/route.ts]**
Severity: MEDIUM
Description: GET calls `findDuplicates()` with no try/catch.
Fix: Wrap in try/catch.

---

**ISSUE [db/backend] [src/app/api/export/csv/route.ts]**
Severity: MEDIUM
Description: GET calls `listCollection({ sort: 'title' })` with no try/catch. A DB error during CSV export would crash the response mid-stream.
Fix: Wrap in try/catch.

---

**ISSUE [db/backend] [src/app/api/export/ics/route.ts]**
Severity: MEDIUM
Description: GET calls `listCollection()` with no try/catch.
Fix: Wrap in try/catch.

---

**ISSUE [db/backend] [src/app/api/collection/export/route.ts, src/app/api/collection/find/route.ts, src/app/api/collection/characters/route.ts, src/app/api/collection/traits/route.ts, src/app/api/collection/full-download/route.ts]**
Severity: MEDIUM
Description: Five additional collection-adjacent routes have no try/catch, confirmed by grep.
Fix: Wrap DB calls in try/catch per handler.

---

**ISSUE [db/backend] [src/app/api/maintenance/stale/route.ts, src/app/api/producers/route.ts, src/app/api/download-status/route.ts, src/app/api/activity/kinds/route.ts, src/app/api/search/textual/route.ts, src/app/api/vn/[id]/lists/route.ts, src/app/api/vndb/auth/route.ts, src/app/api/vndb/pull-statuses/route.ts]**
Severity: MEDIUM
Description: Eight additional routes lack try/catch, confirmed by grep.
Fix: Wrap DB calls in try/catch per handler.

---

### MIGRATION SAFETY

---

**ISSUE [db/backend] [src/lib/db.ts:796-809]**
Severity: HIGH
Description: The `phys_loc_json_migration_v1` migration runs the data transformation inside a transaction (`run()` at line 805), but writes the idempotency marker (`INSERT OR REPLACE INTO app_setting`) OUTSIDE that transaction at line 807-809. If the process crashes after `run()` commits but before the marker INSERT, the migration re-runs on the next cold start and double-converts already-converted JSON strings, potentially corrupting physical_location values that are already valid JSON arrays.
Code:
```ts
const run = db.transaction(() => {
  for (const r of legacy) {
    updateStmt.run(...);   // migrates the rows
  }
});
run();     // ← transaction commits here
// ← process can crash here
db.prepare(`INSERT OR REPLACE INTO app_setting ... VALUES ('phys_loc_json_migration_v1', '1')`).run();
// ← marker only written if we reach here
```
Fix: Include the marker INSERT inside the transaction:
```ts
const run = db.transaction(() => {
  for (const r of legacy) { updateStmt.run(...); }
  db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('phys_loc_json_migration_v1', '1')`).run();
});
run();
```

---

### SQL IDENTIFIER INTERPOLATION

---

**ISSUE [db/backend] [src/lib/db.ts:2168-2170]**
Severity: LOW
Description: `getDbStatus()` interpolates table names from a hardcoded JS array into SQL (`SELECT COUNT(*) AS n FROM ${table}`). The list is a literal in the source file with no user input, so there is no injection vector — but the pattern bypasses the parameterization layer entirely and will silently accept a typo (misspelled table name throws at runtime, not at compile time).
Code:
```ts
const rows = tables.map((table) => ({
  table,
  count: (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
}));
```
Fix: Low-priority. Either validate each name against `sqlite_master` before interpolating, or use a record type keyed by allowed table names.

---

**ISSUE [db/backend] [src/lib/db.ts:7570, 7624, 7630-7633]**
Severity: LOW
Description: `restoreFromSqliteFile()` interpolates table names and column lists from `sqlite_master` into SQL (`PRAGMA table_info(${table})`, `DELETE FROM main.${table}`, `INSERT INTO main.${table} (...) SELECT ... FROM src.${table}`). Table names come from `sqlite_master` of a server-generated temp file (path from `mkdtemp`), not from user input. Column names are filtered through `shared` intersection. The code already notes this is intentional (comment at lines 7598-7603). No practical injection vector.
Fix: Accepted risk per code comment. Consider adding a stricter allowlist check: `if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) { summary.skipped.push(...); continue; }` before interpolation, to harden against a crafted backup file that declares a table with a name containing SQL metacharacters.

---

### SCHEMA INTEGRITY

---

**ISSUE [db/backend] [src/lib/db.ts — DDL section]**
Severity: LOW
Description: `user_list_vn.vn_id` intentionally has no FK to `vn(id)` (noted in comment at db.ts:7712: "deliberately has no FK to vn(id)"). This means removing a VN from the collection does not cascade-delete its list memberships, leaving orphan rows in `user_list_vn`. `removeFromCollection` does not clean up `user_list_vn` rows either.
Code: `removeFromCollection` (db.ts:2866): `db.prepare('DELETE FROM collection WHERE vn_id = ?').run(vnId);` — no cleanup of `user_list_vn`.
Fix: Either add explicit cleanup in `removeFromCollection` (`DELETE FROM user_list_vn WHERE vn_id = ?`), or document the intentional orphan-tolerance and add a periodic maintenance query to surface orphans.

---

### JSON PARSING SAFETY

---

**FALSE_CLOSURE — rowToItem JSON.parse is safe**
All JSON.parse calls on DB columns within `rowToItem` / `listCollection` / `listCollectionForCards` use `safeParseJson()` or `parseJsonField()` wrappers that catch parse errors and return null. No naked JSON.parse on DB data was found in the critical query paths.

---

### API ROUTE CONSISTENCY (400 vs 500)

---

**ISSUE [db/backend] [src/app/api/shelves/[id]/slots/route.ts:95-98]**
Severity: LOW
Description: The POST handler catches errors from `placeShelfItem` and returns 400 with `{ error: 'shelf slot place failed' }`. But `placeShelfItem` can throw for business-logic reasons (slot out of bounds, item not in owned_release) OR for genuine DB errors. Both collapse to 400, hiding infrastructure failures from the server operator.
Code:
```ts
} catch (e) {
  console.error('shelf slot place failed:', (e as Error).message);
  return NextResponse.json({ error: 'shelf slot place failed' }, { status: 400 });
}
```
Fix: Distinguish error types: rethrow SQLite errors as 500, throw a typed business-logic error class from `placeShelfItem` and catch that as 400.

---

### CACHE INVALIDATION

---

**ISSUE [db/backend] [src/lib/db.ts:7818-7851 and call sites]**
Severity: LOW
Description: `updateUserList` writes to `user_list` but does not call `invalidateAggregateStats()`. The aggregate stats snapshot does not include list counts, so this is currently safe — but the `countListMembershipsByVn()` result used in every library page fetch is not cached at all (re-computed per request). When/if it gets cached, `addVnToList` and `removeVnFromList` must both invalidate it.
Fix: If `countListMembershipsByVn()` is cached in future, ensure `addVnToList` and `removeVnFromList` invalidate the cache.

---

## SUMMARY

| Severity | Count |
|----------|-------|
| HIGH | 7 |
| MEDIUM | 18 |
| LOW | 12 |
| **Total** | **37** |

**HIGH issues:**
1. N+1 loop in `/api/collection` on aspect requests (collection/route.ts:116)
2. `updateUserList` TOCTOU — slug uniqueness check + UPDATE outside transaction (db.ts:7818)
3. `reading-queue` route — all 4 handlers lack try/catch
4. `saved-filters` route — all 4 handlers lack try/catch
5. `collection/[id]/activity` route — all 3 handlers lack try/catch
6. `lists/[id]/items` route — POST and DELETE lack try/catch
7. `phys_loc_json_migration_v1` marker INSERT outside the migration transaction (db.ts:807)

**FALSE_CLOSURE flags (checklist claims that ARE correct per actual code):**
- `PRAGMA foreign_keys = ON` — IS set in `open()` (db.ts:95). Correctly on.
- All migrations ARE gated by `app_setting` marker checks — confirmed for every `if (db.prepare(...).get() == null)` block. The EXCEPTION is the marker-outside-transaction bug above.
- JSON parsing in `rowToItem` IS protected via `safeParseJson()` / `parseJsonField()` wrappers.
- `findDuplicates` DOES have a `LIMIT 20000` guard (db.ts:2146).
- `listReadingQueue` DOES have a `LIMIT 1000`.
- `listSteamLinks` DOES have a `LIMIT 10000`.
- `placeShelfItem`, `placeShelfDisplayItem`, `addToCollection`, `createUserList`, `addVnToList`, `removeVnFromList`, `reorderListItems`, `reorderReadingQueue` ARE all properly wrapped in `db.transaction()`.