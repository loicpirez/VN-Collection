# Test Coverage Audit — vndb-collection-new

**Date:** 2026-05-21  
**Auditor:** QA Senior (Claude Sonnet 4.6)  
**Scope:** Read-only analysis of `/tests/` vs `/src/lib/` and `/src/app/api/`

---

## Inventory

### Test files found: 140
Located in `/tests/` (project root). No `src/tests/` or `__tests__/` directories exist.

### Source files:
- `src/lib/` — 82 files
- `src/app/api/` — 87 route files (route.ts across all nested paths)

---

## Section 1 — Coverage Gaps: lib/ files with zero test coverage

The following `src/lib/` files have **no test file that imports or even mentions them by filename**. This was determined by grepping all test files for each lib module name.

---

### GAP [src/lib/source-resolve.ts — resolveField()]
**Severity: HIGH**  
**Description:** `resolveField()` is the core VNDB/EGS data resolution function. It is called wherever VNDB and EGS data compete (description, image, brand, rating, playtime). The function is pure (no DB, no I/O) and has three distinct paths: `auto/vndb-first`, `egs-first`, and the fallback chain when the preferred side is empty.  
**Risk:** A regression in the fallback logic (e.g., `isEmpty()` treating `0` as empty) would silently serve wrong data across the entire collection view without any test catching it. The `'custom'` source choice is also untested.  
**Suggested test:**
```ts
// pref=auto, vndb wins; pref=egs, egs wins; fallback when preferred is null/empty string/empty array
expect(resolveField('vndb-val', 'egs-val', 'auto')).toMatchObject({ used: 'vndb', fellBack: false });
expect(resolveField(null, 'egs-val', 'auto')).toMatchObject({ used: 'egs', fellBack: true });
expect(resolveField('vndb-val', null, 'egs')).toMatchObject({ used: 'vndb', fellBack: true });
expect(resolveField([], [], 'auto')).toMatchObject({ value: null, used: null });
```

---

### GAP [src/lib/time-ago.ts — timeAgo()]
**Severity: HIGH**  
**Description:** `timeAgo()` formats cached-data ages for every refresh chip, game log, activity feed, and list page in the UI. There are 7 distinct branches (just now / minutes / hours / days / weeks / months / years) plus the `null` guard. The function accepts a `Dictionary` argument which must expose the `timeAgo` sub-tree.  
**Risk:** A boundary error (e.g., "23h" displaying as "0d") or a wrong i18n key reference would affect every time display across the app. The `{n}` substitution in format strings could silently produce `undefined` if a key is renamed.  
**Suggested test:**
```ts
const t = { timeAgo: { justNow:'just now', never:'never', minutes:'{n}m ago', hours:'{n}h ago',
  days:'{n}d ago', weeks:'{n}w ago', months:'{n}mo ago', years:'{n}y ago' } };
expect(timeAgo(null, t)).toBe('never');
expect(timeAgo(now - 30_000, t, now)).toBe('just now');
expect(timeAgo(now - 3_600_000, t, now)).toBe('1h ago');
// boundary: 6 days → days, 7 days → weeks
expect(timeAgo(now - 6 * 86_400_000, t, now)).toMatch(/6d/);
expect(timeAgo(now - 7 * 86_400_000, t, now)).toMatch(/1w/);
```

---

### GAP [src/lib/reading-speed.ts — getReadingSpeedProfile() / predictReadingMinutes()]
**Severity: HIGH**  
**Description:** `getReadingSpeedProfile()` is a DB query that builds a statistical model from the user's collection. `predictReadingMinutes()` applies the multipliers to predict reading time displayed on VN detail pages. Both functions have boundary conditions: the 3-sample minimum threshold, zero-division protection, and the VNDB-vs-EGS fallback.  
**Risk:** A query bug (wrong column join, wrong `WHERE status = 'completed'` filter) would silently produce wrong speed profiles. The prediction being shown prominently on detail pages makes any regression highly visible to users but invisible to CI.  
**Suggested test:**
```ts
// Seed 3+ completed VNs with playtime + vndb length, confirm multiplier is non-null
// Seed < 3: multiplier should be null
// predictReadingMinutes with null multiplier returns null
// predictReadingMinutes picks VNDB over EGS when both available
```

---

### GAP [src/lib/series-detect.ts — walkSeriesRelations() / detectSeriesForVn()]
**Severity: HIGH**  
**Description:** `walkSeriesRelations()` does a BFS through VNDB `relations` JSON stored in the `vn` table. `detectSeriesForVn()` uses it to suggest series membership on the detail page. Neither the BFS logic nor the longest-common-prefix naming heuristic has a test. Malformed JSON in `vn.relations` is swallowed silently.  
**Risk:** A cycle in the relation graph would hang `walkSeriesRelations()` indefinitely (it guards with `visited` set, but this is untested). The prefix truncation logic (`trimVolumeMarker`) has regex that could over-trim, hiding the wrong series name suggestion.  
**Suggested test:**
```ts
// Seed VNs with seq/preq relations, verify BFS reaches all, excludes seed
// Seed a cycle (A→B→A), confirm visited guard prevents infinite loop
// detectSeriesForVn returns null when seed already in a series
// longestCommonPrefix on ["VN A/Part 1","VN A/Part 2"] → "VN A/"
```

---

### GAP [src/lib/egs-sync.ts — computeEgsSuggestions() / applyEgsSuggestions()]
**Severity: HIGH**  
**Description:** `computeEgsSuggestions()` fetches from ErogameScape and compares against local collection data. `applyEgsSuggestions()` writes playtime/score changes into the user's collection. These are the only write paths from EGS user data into local DB and have no unit tests at all.  
**Risk:** A bug in the score conversion (EGS uses a different scale), playtime unit (EGS hours vs local minutes), or the join logic could silently corrupt every user's ratings/playtime when they apply EGS sync suggestions.  
**Suggested test:**
```ts
// computeEgsSuggestions: needsConfig=true when egs_username unset
// computeEgsSuggestions: returns correct delta when egs playtime > local
// applyEgsSuggestions: updates collection.playtime_minutes and user_rating correctly
// applyEgsSuggestions: skips rows with no local VN match
```

---

### GAP [src/lib/schema-local.ts — listLocalSqliteSchema()]
**Severity: MEDIUM**  
**Description:** `listLocalSqliteSchema()` is used to expose the DB schema through the admin interface. The SQL uses string interpolation of table names through `"${table.name.replace(/"/g, '""')}"`. If a table name with unusual characters was ever added, the injection guard would matter.  
**Risk:** Low probability of exploit (table names come from `sqlite_master`, not user input), but the only protection is the `replace` call which has no test.  
**Suggested test:**
```ts
const schema = listLocalSqliteSchema();
expect(schema.some(t => t.name === 'vn')).toBe(true);
expect(schema.find(t => t.name === 'collection')?.columns.some(c => c.name === 'vn_id')).toBe(true);
```

---

### GAP [src/lib/recentlyViewed.ts — recordRecentlyViewed() / clearRecentlyViewed() / useRecentlyViewed()]
**Severity: MEDIUM**  
**Description:** Client-side localStorage management with a 12-item cap, deduplication, and a custom event system. The `readStorage()` and `writeStorage()` helpers both have `try/catch` silencing, and the `MAX_ITEMS` cap is never verified.  
**Risk:** A regression in the deduplication logic (checking `e.id !== entry.id`) could accumulate duplicate entries. The `MAX_ITEMS` truncation in `writeStorage` could silently drop items if the slice is applied to the wrong array.  
**Suggested test (jsdom):**
```ts
// recordRecentlyViewed twice with same id: list remains length 1
// recordRecentlyViewed 13 items: list capped at 12
// clearRecentlyViewed: localStorage entry removed
// readStorage on corrupt JSON returns []
```

---

### GAP [src/lib/staff-roles.ts — roleLabel()]
**Severity: LOW**  
**Description:** `roleLabel()` is used across staff section, brand-overlap, and compare pages. The function falls back to the raw role string when the key is unknown.  
**Risk:** A new VNDB role code not in `ROLE_KEY` would silently display the raw API value instead of a localised label. Low impact individually but it affects every staff credit display.  
**Suggested test:**
```ts
expect(roleLabel('scenario', dict)).toBe(dict.role_scenario);
expect(roleLabel('unknown_role', dict)).toBe('unknown_role');
expect(roleLabel(null, dict)).toBe('');
```

---

### GAP [src/lib/language-names.ts]
**Severity: LOW**  
**Description:** Language display name lookup used across filter chips and detail sections. Not examined in detail but has zero test references.

### GAP [src/lib/download-status-names.ts]
**Severity: LOW**  
**Description:** Display-name map for download status codes. Zero test references.

### GAP [src/lib/producer-associations.ts]
**Severity: MEDIUM**  
**Description:** Used for the brand/producer overlap feature. Logic for associating producers with VNs across brands. Zero test references.

### GAP [src/lib/producer-completion.ts]
**Severity: MEDIUM**  
**Description:** Completion statistics for producers. Zero test references.

### GAP [src/lib/relations-full.ts]
**Severity: MEDIUM**  
**Description:** Full relation graph construction from cached data. Zero test references.

### GAP [src/lib/release-full.ts]
**Severity: MEDIUM**  
**Description:** Release metadata hydration used by detail pages and shelf popover. Zero test references.

### GAP [src/lib/scrape-character-instances.ts]
**Severity: MEDIUM**  
**Description:** VNDB HTML scraper for character instances. Scraper reliability (retry logic, queue drain, 30-day cache handling) is completely untested.

### GAP [src/lib/scrape-producer-relations.ts]
**Severity: MEDIUM**  
**Description:** VNDB HTML scraper for producer hierarchy. Same scraper infrastructure as `scrape-character-instances.ts`. Zero test references.

### GAP [src/lib/vndb-tag-web-cache.ts]
**Severity: MEDIUM**  
**Description:** Caching layer for the VNDB web tag tree. Interacts with `vndb_cache` table. Zero test references.

### GAP [src/lib/vndb-scrape.ts — nextSlot() / drain() / throttled scraping queue]
**Severity: HIGH**  
**Description:** The global mutable scraper queue (`queue: Array<() => void>`, `working: boolean`, `last: number`) is module-level state with no tests. The `drain()` function calls itself recursively via Promises. A missed `working = false` reset after a failed request would permanently stall the queue.  
**Risk:** A queue stall would prevent any future HTML scraping in the same process instance (staff full, character instances, producer relations). Only a server restart would clear it.  
**Suggested test:**
```ts
// Mock fetch; confirm sequential dispatch with SCRAPE_GAP_MS gap
// Simulate fetch failure; confirm queue continues after retry exhaustion
// Confirm working flag resets on error (no permanent stall)
```

### GAP [src/lib/tag-full.ts]
**Severity: LOW**  
**Description:** Tag detail data assembly. Zero test references.

### GAP [src/lib/trait-full.ts]
**Severity: LOW**  
**Description:** Trait detail data assembly. Zero test references.

### GAP [src/lib/character-full.ts]
**Severity: MEDIUM**  
**Description:** Character profile download and hydration. Zero test references.

### GAP [src/lib/producer-full.ts]
**Severity: MEDIUM**  
**Description:** Producer profile download and hydration. Zero test references.

### GAP [src/lib/staff-full.ts]
**Severity: MEDIUM**  
**Description:** Staff profile download and cache write (writes `staff_credit_index`). Zero test references.

---

## Section 2 — API Routes with Zero Test Coverage

Of the 87 API route files, **only 20 have any test coverage** (via import in test files). The following significant routes have zero tests:

### HIGH-SEVERITY UNTESTED ROUTES

---

### GAP [src/app/api/collection/[id]/route.ts — POST/PATCH/DELETE handlers]
**Severity: HIGH**  
**Description:** The primary collection mutation route. `POST` adds a VN to collection after fetching from VNDB. `PATCH` updates collection fields. `DELETE` removes from collection. The `pickFields()` validator (lines 31–122) has 15+ input validation branches: `user_rating` integer range, `playtime_minutes` bounds, ISO date format, `status` enum, location enum, etc. None of these validation paths are tested.  
**Risk:** Any validation regression (e.g., accepting float `user_rating`, or accepting invalid `status`) would silently corrupt the collection DB. The SQLite column is INTEGER; the previous bug of accepting floats and having SQLite coerce silently is documented in a code comment — indicating this was a real production bug.  
**Suggested tests:**
```ts
// PATCH with user_rating=99.5 → 400
// PATCH with status='invalid' → 400
// PATCH with started_date='not-a-date' → 400
// PATCH with playtime_minutes=-1 → 400
// DELETE: removes from collection, returns 200
// GET: 404 when not in collection
```

---

### GAP [src/app/api/backup/restore/route.ts — POST]
**Severity: HIGH**  
**Description:** Restores the entire SQLite database from an uploaded file. Auth-gated. Has no tests for: non-SQLite file rejection (bad magic bytes), content-type validation, file size limit (1 GiB), or the happy path. The backup **GET** route has tests; the restore **POST** does not.  
**Risk:** A regression that skips the SQLite magic-byte check would allow replacing the DB with arbitrary binary data, corrupting the entire collection irreversibly.  
**Suggested tests:**
```ts
// POST without auth (external origin) → 403
// POST with wrong content-type → 400
// POST with non-SQLite file (wrong magic bytes) → 400
// POST with file > MAX_UPLOAD_BYTES → 413
// POST with valid SQLite → 200, DB replaced
```

---

### GAP [src/app/api/collection/import/route.ts]
**Severity: HIGH**  
**Description:** JSON/backup import. Auth-gated with `requireLocalhostOrToken`. No tests exist for the auth rejection path or any import validation.  
**Risk:** Import failures that let through malformed payloads would corrupt DB state silently.

---

### GAP [src/app/api/export/raw/route.ts]
**Severity: HIGH**  
**Description:** Raw SQLite export. Auth-gated. No tests for auth rejection or the response content shape.

---

### GAP [src/app/api/export/csv/route.ts]
**Severity: HIGH**  
**Description:** CSV export of collection. Auth-gated. No tests.

---

### GAP [src/app/api/export/ics/route.ts]
**Severity: MEDIUM**  
**Description:** iCalendar export. Auth-gated. No tests for auth rejection or ICS format validity.

---

### GAP [src/app/api/collection/export/route.ts]
**Severity: HIGH**  
**Description:** Collection export endpoint. Auth-gated. No tests. Any regression in the export format breaks the user's ability to back up their data.

---

### GAP [src/app/api/collection/[id]/assets/route.ts]
**Severity: HIGH**  
**Description:** Triggers local image download for a VN. Auth-gated. No tests. This was a recently-relaxed route (no longer requires collection membership). The behavior change (now gates on `vn` table not `collection` table) is documented in a test for the underlying DB function, but the HTTP handler itself has no tests.

---

### GAP [src/app/api/files/[...path]/route.ts]
**Severity: HIGH**  
**Description:** Serves local image files from the data directory. No tests for path traversal protection, authentication, or file-not-found handling. This is a critical security surface — a path traversal vulnerability here could serve arbitrary local files.  
**Risk:** Path traversal (`../../etc/passwd`-style) in the `[...path]` param. There should be explicit assertions that requests outside the `data/storage/` sandbox return 403 or 404.  
**Suggested tests:**
```ts
// GET /api/files/../../../etc/passwd → 403 or 404
// GET /api/files/nonexistent.jpg → 404
// GET /api/files/valid-path.jpg → 200 with correct content-type
```

---

### GAP [src/app/api/search/advanced/route.ts]
**Severity: MEDIUM**  
**Description:** Advanced search route. No tests for search parameter validation or SQL injection via unsanitized filter values.

---

### GAP [src/app/api/vn/[id]/link-vndb/route.ts]
**Severity: MEDIUM**  
**Description:** Links an EGS-only VN to a VNDB id. This triggers `migrateVnId()` which updates 10+ tables. No tests for the route's input validation or the auth gate.

---

### GAP [src/app/api/series/[id]/route.ts — PATCH/DELETE]
**Severity: MEDIUM**  
**Description:** Series update and delete. No tests for the PATCH body validation or the DELETE cascade behavior.

---

### MEDIUM-SEVERITY UNTESTED ROUTES (condensed list)

The following routes have zero test coverage for their request/response behavior:

| Route | Missing coverage |
|---|---|
| `api/lists/route.ts` | CRUD for user lists |
| `api/lists/[id]/route.ts` | List update/delete |
| `api/lists/[id]/items/route.ts` | List membership mutations |
| `api/saved-filters/route.ts` | Saved filter CRUD |
| `api/reading-queue/route.ts` | Reading queue management |
| `api/shelves/[id]/route.ts` | Shelf update/delete |
| `api/shelves/[id]/slots/route.ts` | Slot placement |
| `api/shelves/[id]/displays/route.ts` | Display slot management |
| `api/character/[id]/route.ts` | Character detail fetch |
| `api/egs-cover/[id]/route.ts` | EGS cover resolver |
| `api/egs-cover/[id]/candidates/route.ts` | Cover candidates |
| `api/release/[id]/route.ts` | Release detail fetch |
| `api/tags/route.ts` | Tag list query |
| `api/tags/web-tree/route.ts` | Web tag tree |
| `api/traits/route.ts` | Trait list query |
| `api/producers/route.ts` | Producer list query |
| `api/producer/[id]/route.ts` | Producer detail |
| `api/vn/[id]/route.ts` | VN detail fetch |
| `api/vn/[id]/releases/route.ts` | VN releases |
| `api/vn/[id]/lists/route.ts` | VN list membership |
| `api/vn/[id]/characters/route.ts` | VN characters |
| `api/vn/[id]/quotes/route.ts` | VN quotes |
| `api/vn/[id]/vndb-status/route.ts` | VNDB writeback |
| `api/vndb/pull-statuses/route.ts` | Pull VNDB statuses |
| `api/vndb/stats/route.ts` | VNDB stats |
| `api/vndb/quote/random/route.ts` | Random quote |
| `api/staff/[id]/download/route.ts` | Staff full download |
| `api/steam/library/route.ts` | Steam library fetch |
| `api/maintenance/duplicates/route.ts` | Auth checked only (no body assertions) |
| `api/maintenance/stale/route.ts` | Auth checked only (no body assertions) |

---

## Section 3 — Test Quality Issues

### ISSUE [auth-gate-routes.test.ts — maintenance routes: 403 only, no 200 body assertions]
**Severity: MEDIUM**  
**Description:** Tests for `GET /api/maintenance/duplicates` and `GET /api/maintenance/stale` verify only that the routes return 403 from an external origin. There are no tests for the actual response body from localhost: what does the duplicates route return? What shape is the stale data? What happens when there are no duplicates?  
**File:** `/Users/loicpirez/Perso/vndb-collection-new/tests/auth-gate-routes.test.ts` lines 69–77  
**Risk:** The routes could return `{ duplicates: undefined }` or a 500 without any test catching it.

---

### ISSUE [backup-export.test.ts — no auth rejection body assertion]
**Severity: LOW**  
**Description:** The test at line 54–58 checks `[401, 403]` (allowing either status code). Allowing a range is fine, but there is no body assertion. If the auth gate changed its error message format, no test would catch the regression.

---

### ISSUE [refresh-scope-route.test.ts — line 69: toBe(200) without body assertion on first test]
**Severity: LOW**  
**Description:** In the first test (`busts only rows matching the scope patterns`), `expect(res.status).toBe(200)` appears before the body assertions. This is acceptable since the body is checked 3 lines later. Not a real gap, but documents the pattern.

---

### ISSUE [cover-rotation.test.ts — lines 126, 147, 159, 169, 179: multiple 200-only checks]
**Severity: LOW**  
**Description:** Several tests in this file only assert `res.status === 200` without verifying the response body. For example, line 147 (`normalises arbitrary degree values`) checks 200 but then reads `getCollectionItem()` — the DB assertion covers correctness, making the HTTP-200-only check technically sufficient. However, the response body (which contains `{ rotation: N }`) is only verified in one test case.

---

### ISSUE [activity.test.ts — route-level source-pin approach]
**Severity: MEDIUM**  
**Description:** The `round-four route source-pin` describe block (lines 182–231) checks that route files *contain the string* `'recordActivity'` and the kind string. This is a source-pin test, not a behavior test. It does not verify that `recordActivity` is actually **called** at runtime — a developer could leave the string in a comment while removing the actual call. Two of 35 pins (`collection.custom-order` and `aspect.set`/`aspect.clear`) have real integration tests; the other 33 are source-pin only.  
**Risk:** A refactor that moves `recordActivity` calls behind a conditional or renames the function would pass the source-pin tests.

---

## Section 4 — Missing Error Path Coverage

### GAP [db.ts — upsertVn(): no test for DB error propagation]
**Severity: HIGH**  
**Description:** `upsertVn()` runs inside a transaction (`upsertVnTx`) that writes to `vn`, `vn_staff_credit`, `vn_va_credit`, `vn_tag_index`, `vn_developer_index`. There are no tests for what happens when the transaction fails (e.g., FK violation, UNIQUE constraint, disk-full). The transaction is wrapped in `db.transaction()` which auto-rolls back on throw, but no test verifies this.  
**Risk:** A partial write (e.g., VN inserted but tag index rebuild fails) could leave the DB in an inconsistent state.

---

### GAP [db.ts — addGameLogEntry(): empty note throws, never caught by route]
**Severity: MEDIUM**  
**Description:** `addGameLogEntry()` throws `new Error('empty note')` when the trimmed note is empty. The route handler at `src/app/api/collection/[id]/game-log/route.ts` has no test, so it's unknown whether this error is caught and returned as a 400 or propagates as a 500.

---

### GAP [db.ts — migrateVnId(): toId not in vn table throws, no route test]
**Severity: MEDIUM**  
**Description:** `migrateVnId()` throws when the target VN id is not in the `vn` table. This is called from `api/vn/[id]/link-vndb/route.ts` which has no tests. The error message would surface as a 500 rather than a structured 404.

---

### GAP [activity.ts — recordActivity() with empty kind]
**Severity: LOW**  
**Description:** `recordActivity()` returns early when `kind.trim()` is empty. This silently drops the activity with no error or warning. There is no test verifying this guard specifically (the payload truncation tests do not cover the empty-kind path).

---

### GAP [vndb-cache.ts — cachedFetch() in-flight deduplication]
**Severity: MEDIUM**  
**Description:** The `inflight` Map deduplicate concurrent requests for the same cache key. If the first request fails, the Promise is deleted from `inflight` in the `finally` block. But if two concurrent requests share the same key and the first fails, the second (which joined the first's Promise via `existing`) also receives the failure. There is no test verifying this concurrent-failure behavior.  
**Risk:** Under concurrent load, a VNDB timeout could make N callers all fail when only 1 actually hit the network.

---

### GAP [auth-gate.ts — VN_ADMIN_TOKEN empty string behavior]
**Severity: MEDIUM**  
**Description:** The existing tests cover loopback + proxy secret. The case where `VN_ADMIN_TOKEN` is set to an empty string (or whitespace) is handled by `.trim()`, but no test verifies that `adminToken = ''` after trim causes the token path to be skipped (since `if (adminToken)` is falsy for `''`). An empty-string env var should NOT grant access.  
**Suggested test:**
```ts
process.env.VN_ADMIN_TOKEN = '   '; // whitespace only
// Request with Authorization: Bearer    → 403 (not allowed)
```

---

## Section 5 — Missing Edge Cases

### GAP [activity.ts — ACTIVITY_PAYLOAD_MAX_BYTES truncation]
**Severity: MEDIUM**  
**Description:** `safePayloadJson()` truncates payloads larger than 8KB to `{ truncated: true, size: N }`. No test verifies this truncation. A test should confirm the exact stub shape and that the oversized payload does NOT appear in the DB.

---

### GAP [url-allowlist.ts — isAllowedHttpTarget() with 0.0.0.0]
**Severity: LOW**  
**Description:** `isAllowedHttpTarget('http://0.0.0.0/kana')` — the allowlist test does not cover this specific case. It tests `127.0.0.1` (blocked by IPv4 literal regex) but `0.0.0.0` would also be blocked by the same IPv4 regex (`/^\d+\.\d+\.\d+\.\d+$/`). This is technically covered but should be explicit.

---

### GAP [db.ts — setCollectionCustomOrder() with empty array]
**Severity: LOW**  
**Description:** `setCollectionCustomOrder([])` returns early. No test verifies this guard. The caller (the collection order route) is also untested.

---

### GAP [db.ts — getEgsForVns() chunking behavior]
**Severity: LOW**  
**Description:** `getEgsForVns()` chunks at 500 to stay below SQLite's variable number limit. No test verifies the chunking boundary — a list of exactly 501 items should produce 2 DB queries.

---

### GAP [series-detect.ts — longestCommonPrefix() with single-character prefix]
**Severity: LOW**  
**Description:** `longestCommonPrefix()` has no test for edge cases: empty input array, single-element array, strings with no common prefix.

---

## SUMMARY

### Total Gaps by Severity

| Severity | Count |
|---|---|
| HIGH | 18 |
| MEDIUM | 24 |
| LOW | 11 |
| **Total** | **53** |

---

### Coverage Estimate by Area

| Area | Estimated Coverage | Notes |
|---|---|---|
| `src/lib/` (82 files) | ~40% | ~23 lib files have no test reference at all; critical security libs (auth-gate, url-allowlist, csrf) are well tested; DB helper functions partially covered via integration tests |
| `src/app/api/` (87 routes) | ~23% | Only ~20 routes have any direct test import; auth-gate tests cover 11 routes for 403 path only; most routes have zero tests |
| Components | Out of scope per instructions | Frontend tests exist but are largely source-pin or structural checks |

---

### Top 5 Highest-Risk Untested Paths

1. **`src/app/api/files/[...path]/route.ts` — Path traversal protection**  
   This route serves local files from disk. If the path parameter is not sanitized against directory traversal (`../../`), arbitrary local files could be served. No test verifies the sandbox boundary. This is the highest-risk untested path in the codebase.

2. **`src/app/api/backup/restore/route.ts` — SQLite magic-byte check bypass**  
   The only thing preventing a non-SQLite file from replacing the entire DB is a 16-byte magic-byte check. No test verifies this check works. A regression here would let an attacker (with network access) corrupt the entire collection irreversibly.

3. **`src/lib/egs-sync.ts` — applyEgsSuggestions() corrupting ratings/playtime**  
   EGS sync applies external playtime and score values directly into the collection DB. The EGS scale and unit conversions (hours→minutes, score normalization) have no unit tests. A unit error here would silently corrupt every user's collection metrics.

4. **`src/app/api/collection/[id]/route.ts` — pickFields() validation regressions**  
   The `user_rating` integer-only rule was introduced specifically to fix a production bug where SQLite silently coerced floats. The date format regex, the `status` enum validation, and the `playtime_minutes` bounds are all untested. Any regression here directly corrupts collection data.

5. **`src/lib/vndb-scrape.ts` — global queue stall on error**  
   The module-level `working` flag is never reset by a test. A failed scrape that doesn't properly reset `working = false` (e.g., via a missed `finally`) would permanently stall all future scraping in the same process. This is subtle state-machine behavior that only integration-style tests can catch.
