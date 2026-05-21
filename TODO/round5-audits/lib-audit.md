# src/lib — Complete Security & Code-Quality Audit

Cold, read-only audit. No source files modified. No commits.

---

## ISSUES

---

### db.ts

---

ISSUE [db.ts:114-115]
Severity: HIGH
Description: `open()` sets `journal_mode = WAL` and `foreign_keys = ON` but never sets `busy_timeout`. Under concurrent Next.js request handling a second writer will immediately receive `SQLITE_BUSY` instead of waiting. This is a latent data-loss risk whenever two requests try to write simultaneously (e.g. a sync job running while the user edits collection status).
Code:
```ts
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// busy_timeout never set — SQLITE_BUSY on concurrent writes
```
Fix: Add `db.pragma('busy_timeout = 5000')` (5 s) immediately after `foreign_keys = ON` so writers queue instead of crashing.

---

ISSUE [db.ts:818-845]
Severity: MEDIUM
Description: The `egs_colon_to_underscore_v1` migration rewrites EGS-format ids in `collection`, `egs_game`, `vn_quote`, `owned_release`, `vn_route`, and `series_vn`, but does NOT update `vn_staff_credit`, `vn_va_credit`, `vn_activity`, `user_list_vn`, `steam_link`, `vn_aspect_override`, `vn_egs_link`, `vn_game_log`, `character_vn_index`, or `staff_credit_index`. Any of those tables that carry a `vn_id` column referencing an EGS VN would be left with stale colon-style ids after migration.
Code:
```sql
-- migration updates collection, egs_game, vn_quote, owned_release,
-- vn_route, series_vn only
```
Fix: Audit every table that has a `vn_id` column; include all of them in the migration or document why they are excluded.

---

ISSUE [db.ts:1946,1959]
Severity: LOW
Description: `SELECT * FROM egs_game` returns all columns, including large JSON blobs (developers, genres, screenshots). When called per-VN across a large collection the excess columns are discarded by the caller.
Code:
```ts
.prepare('SELECT * FROM egs_game WHERE vn_id = ?')
.prepare(`SELECT * FROM egs_game WHERE vn_id IN (${placeholders})`)
```
Fix: Replace with an explicit column list matching the fields the callers actually use.

---

ISSUE [db.ts:2309-2315]
Severity: LOW
Description: `migrateVnId()` toggles `foreign_keys = OFF` at the connection level outside a transaction (using try/finally to restore). While safe for better-sqlite3's synchronous execution model, this pattern would be dangerous if the function were ever made async. A note documenting why this is safe would help future maintainers.
Code:
```ts
db.pragma('foreign_keys = OFF');
// migration steps
db.pragma('foreign_keys = ON');
```
Fix: Consider using `db.pragma('defer_foreign_keys = ON')` inside the transaction instead, which does not require turning off FK enforcement globally.

---

ISSUE [db.ts:4443]
Severity: MEDIUM
Description: `searchLocalStaff()` uses `LOWER(sc.name) LIKE ?` in the WHERE clause. SQLite's LIKE operator is already case-insensitive for ASCII characters, but the `LOWER()` wrapper defeats any index on `sc.name` and forces a full table scan for every keystroke. With a large staff table this will be slow.
Code:
```ts
"(LOWER(sc.name) LIKE ? OR LOWER(COALESCE(sc.original, '')) LIKE ? OR sc.sid LIKE ?)"
```
Fix: Drop `LOWER()` (rely on SQLite LIKE case-insensitivity for ASCII) or add a functional index: `CREATE INDEX IF NOT EXISTS idx_staff_name_lower ON staff_credit(LOWER(name))`.

---

ISSUE [db.ts:6642]
Severity: LOW
Description: `listAllSeries()` uses `SELECT * FROM series ORDER BY name ASC LIMIT 2000`. The `SELECT *` returns all columns. The hard `LIMIT 2000` is an undocumented assumption about maximum series count — it would silently truncate results for a user with more than 2000 series without any warning.
Code:
```ts
return db.prepare('SELECT * FROM series ORDER BY name ASC LIMIT 2000').all()
```
Fix: Enumerate only the columns needed; document or remove the 2000-row cap, or add a count check.

---

ISSUE [db.ts:computeAggregateStats/listCollectionTags]
Severity: MEDIUM
Description: Both `computeAggregateStats()` (topTags query) and `listCollectionTags()` use `json_each(v.tags)` to unnest the JSON tags column at query time rather than reading from the flat `vn_tag_index` table. This performs a full `vn` table scan and inline JSON parsing on every call, which is O(rows × tags_per_row). The `vn_tag_index` table exists precisely to avoid this.
Code:
```sql
-- inside computeAggregateStats topTags query:
json_each(v.tags) AS t
-- inside listCollectionTags:
json_each(v.tags)
```
Fix: Rewrite both queries to join against `vn_tag_index` instead of `json_each(v.tags)`.

---

ISSUE [db.ts:materializeReleaseMetaForVn,materializeReleaseMetaForCollectionVns]
Severity: MEDIUM
Description: Both materialization helpers scan `vndb_cache` with `cache_key LIKE 'POST /release|%'` and apply a hard `LIMIT 200`. If the user has more than 200 cached release pages, some releases will never be materialized into `release_meta_cache`, silently leaving out data.
Code:
```sql
SELECT cache_key, body FROM vndb_cache
WHERE cache_key LIKE 'POST /release|%'
LIMIT 200
```
Fix: Remove the LIMIT or paginate through all matching rows, since this is an internal maintenance operation not a user-facing paginated endpoint.

---

ISSUE [db.ts:2918]
Severity: LOW
Description: `listInCollectionVnIds()` issues an unbounded `SELECT vn_id FROM collection` with no LIMIT. For a personal-use app this is acceptable but there is no guard if the collection table grows unexpectedly large.
Code:
```ts
.prepare('SELECT vn_id FROM collection').all()
```
Fix: Document the assumption that this is a personal-use app with a bounded collection, or add a practical upper LIMIT.

---

### auth-gate.ts

---

ISSUE [auth-gate.ts:85]
Severity: HIGH
Description: The `TRUSTED_PROXY_SECRET` comparison uses plain string equality (`===`) rather than `timingSafeEqual`. An attacker who can measure response timing and issue many requests could brute-force the proxy secret byte-by-byte. The admin token at line 66-67 IS compared timing-safely; this is an inconsistency.
Code:
```ts
const secretOk = secret ? (proofHeader === secret) : false;
```
Fix: Replace `proofHeader === secret` with a call to the existing `timingSafeStrEqual` helper:
```ts
const secretOk = secret ? timingSafeStrEqual(proofHeader ?? '', secret) : false;
```

---

### url-allowlist.ts

---

ISSUE [url-allowlist.ts:100-112]
Severity: MEDIUM
Description: `assertNoPrivateIpRebind` only resolves IPv4 addresses via `dnsResolve4`. If a hostile DNS server for an allowlisted domain returns an IPv6 loopback (`::1`) or link-local (`fe80::/10`) address, the check passes silently and the subsequent fetch may reach a local service on IPv6. The comment in the file acknowledges this as a known gap.
Code:
```ts
addrs = await dnsResolve4(hostname);
// IPv6 addresses are never checked
```
Fix: Also call `dnsResolve6(hostname)` and check each resolved IPv6 address against `::1`, `fe80::/10`, `fc00::/7`, and other private IPv6 ranges. Wrap in try/catch so DNS6 failure does not break callers when IPv6 is not configured.

---

ISSUE [url-allowlist.ts:57-69]
Severity: LOW
Description: `isAllowedHttpTarget` does not follow redirects. A redirect from an allowlisted host to `http://169.254.169.254` would not be caught. This is acknowledged in the inline comment but is worth tracking explicitly.
Code:
```ts
// NOTE: this does not protect against redirect-to-private-IP.
```
Fix: Use `redirect: 'manual'` on the fetch and re-run `isAllowedHttpTarget` on any `Location` header before following, or document this as an accepted risk for the current trust model.

---

### vndb-cache.ts

---

ISSUE [vndb-cache.ts:125,141,225]
Severity: HIGH
Description: Three call sites read `cached.body` with a bare `JSON.parse()` outside any try/catch. A corrupted or truncated cache row (e.g. from an interrupted write, a DB restore from a partial backup, or manual editing) will throw an uncaught exception that propagates to the caller as an unhandled 500.
Code:
```ts
data: JSON.parse(cached.body) as T,   // line 125 (fresh hit path)
data: JSON.parse(cached.body) as T,   // line 141 (stale-while-error path)
data: JSON.parse(cached.body) as T,   // line 225 (304 revalidation path)
```
Fix: Wrap each in try/catch and treat a parse failure the same as a cache miss — re-fetch from upstream rather than crashing. The existing `readCachedJson` helper (line 285) already does this correctly; apply the same pattern here.

---

### activity.ts

---

ISSUE [activity.ts:77-88]
Severity: HIGH
Description: `recordActivity()` has no try/catch around the `db.prepare(...).run(...)` call. Any SQLite error (disk full, schema mismatch, SQLITE_BUSY from a concurrent writer) propagates directly to the caller. Because `recordActivity` is called from state-mutating paths like `updateCollection`, a DB error in the activity insert will roll back the entire calling transaction and surface a 500 to the user — even though the activity record is secondary to the primary operation.
Code:
```ts
export function recordActivity(input: RecordActivityInput): void {
  // ...
  db.prepare(`INSERT INTO user_activity ...`).run(...);
  // no try/catch — any DB error propagates
}
```
Fix: Wrap the INSERT in try/catch and swallow or log errors:
```ts
try {
  db.prepare(`INSERT INTO user_activity ...`).run(...);
} catch (e) {
  console.error('[activity] insert failed:', e);
}
```

---

### erogamescape.ts

---

ISSUE [erogamescape.ts:202]
Severity: MEDIUM
Description: `fetchTable()` calls `res.text()` with no response-body size cap. A malicious or malfunctioning EGS server could return a multi-megabyte or unbounded HTML response that fully buffers in memory before `parseHtmlTable` runs. The 15s `AbortController` timeout limits the time but not the bytes.
Code:
```ts
const html = await res.text();
return parseHtmlTable(html);
```
Fix: Check `Content-Length` before reading, or stream the response and abort if the accumulated byte count exceeds a reasonable cap (e.g. 4 MB for an HTML response from a personal use SQL interface).

---

ISSUE [erogamescape.ts:319-325]
Severity: MEDIUM
Description: `fetchOne()` catches all `fetchTable` errors (including `EgsUnreachable` for real network failures) and silently returns `null`. Callers like `fetchEgsGame` then treat `null` as "no result" rather than distinguishing between "EGS returned no row" and "EGS was unreachable". This masks transient network errors as permanent "not found" results.
Code:
```ts
async function fetchOne(...): Promise<...> {
  try {
    rows = await fetchTable(sql);
  } catch {
    return null;   // EgsUnreachable swallowed as "not found"
  }
```
Fix: Re-throw `EgsUnreachable` from `fetchOne` (or return a typed result that distinguishes "no rows" from "unreachable") so callers can make the right fallback decision.

---

### vndb-throttle.ts

---

ISSUE [vndb-throttle.ts:157]
Severity: MEDIUM
Description: `probeVndbHealthy()` calls raw `fetch()` directly, bypassing both `throttledFetch` (the rate limiter) and `isAllowedHttpTarget` (the SSRF allowlist). The URL is hardcoded to `https://api.vndb.org/kana/schema` so the SSRF risk is negligible, but the probe call does not count against the 1 req/s ceiling and can cause temporary bursting alongside other throttled calls.
Code:
```ts
const r = await fetch('https://api.vndb.org/kana/schema', {
  method: 'GET',
  headers: { 'User-Agent': 'vndb-collection/1.0' },
});
```
Fix: Route through `throttledFetch` (which already gates via `isAllowedHttpTarget`) to apply the same rate-limit ceiling as all other VNDB calls.

---

### files.ts

---

ISSUE [files.ts:118]
Severity: MEDIUM
Description: `downloadToBucket()` calls `res.arrayBuffer()` with no size cap. A CDN redirect from an allowlisted host, a misconfigured server, or a very large image from the VNDB CDN will buffer entirely into memory before being written to disk. The 15s `AbortController` timeout limits time but not bytes.
Code:
```ts
const buf = Buffer.from(await res.arrayBuffer());
```
Fix: Check `Content-Length` header before reading; reject or abort when it exceeds a practical maximum (e.g. 20 MB for images). Alternatively stream the response into the file using a pipe with a byte counter that aborts the transfer when exceeded.

---

### vndb-scrape.ts

---

ISSUE [vndb-scrape.ts:96-100]
Severity: MEDIUM
Description: `fetchVndbWebHtml()` calls raw `fetch()` directly — bypassing both the SSRF allowlist second-check and `throttledFetch` rate limiting. The `isAllowedHttpTarget` check is applied to `target` before the request (line 87), which is correct, but the call does not go through the throttler and therefore is not gated by the 1 req/s ceiling that applies to all other VNDB calls.
Code:
```ts
const res = await fetch(target, {
  headers: { 'User-Agent': 'vn-collection (local cache builder)' },
});
```
Fix: The function already has its own 2s `SCRAPE_GAP_MS` serial queue, which adequately rate-limits web scraping. Add a comment making clear this intentionally uses a separate queue from the API throttle, and confirm that the separate queue is sufficient so reviewers do not mistake the raw `fetch` for an oversight.

---

### recommend.ts

---

ISSUE [recommend.ts:collectExclusions,stampOwnershipFlags]
Severity: LOW
Description: Both helpers issue unbounded `SELECT vn_id FROM collection` with no LIMIT. Acceptable for a single-user personal app where the collection is bounded, but worth documenting.
Code:
```ts
// collectExclusions and stampOwnershipFlags both use:
db.prepare('SELECT vn_id FROM collection').all()
```
Fix: Add a comment documenting the assumption that collection size is bounded for personal use, or add a reasonable upper LIMIT.

---

### steam.ts

---

ISSUE [steam.ts]
Severity: LOW
Description: The Steam API response is read with `res.json()` without a wrapping try/catch. If Steam returns a non-JSON response (e.g. an HTML maintenance page), the call throws an uncaught exception. The rest of the steam-related code (key masking, SSRF gating) is correct.
Code:
```ts
const data = await res.json();
```
Fix: Wrap `res.json()` in a try/catch that throws a descriptive error rather than letting a raw `SyntaxError` propagate.

---

### vndb-sync.ts

---

No HIGH or MEDIUM issues. `throttledFetch` is used for all writes (PATCH/DELETE). Token appears only in `Authorization` headers and is never interpolated into error messages or log output.

---

### csrf.ts

---

No issues. `Sec-Fetch-Site` correctly rejects `same-site` (which would allow subdomains). Form-encoded and text/plain bodies are rejected. Origin: null is rejected in the fallback path. The logic is sound.

---

### egs-sync.ts

---

No issues. EGS id lookups are chunked at 500 to stay below `SQLITE_MAX_VARIABLE_NUMBER`. All writes go through `updateCollection` which is wrapped in try/catch per-item.

---

### egs-links.ts

---

No issues. All functions are pure URL helpers with no DB or network access.

---

### source-resolve.ts

---

No issues. Pure functional helper with no side effects.

---

### vndb-recommend.ts

---

No issues. Routes through `cachedFetch` which applies the SSRF gate and rate limiter.

---

### vndb-link-normalize.ts

---

No issues. Pure function, no side effects, correctly handles all three URL shapes.

---

### vn-id-shape.ts / vn-id.ts

---

No issues. `isVndbVnId` and `isValidVnId` are correctly implemented. The server-only wrapper in `vn-id.ts` is cleanly separated from the client-safe `vn-id-shape.ts`.

---

### scrape-character-instances.ts / scrape-producer-relations.ts / scrape-tag-dag.ts

---

No issues. All three scrapers:
- Validate the id format before scraping.
- Wrap `JSON.parse(row.body)` in try/catch in the read helpers.
- Use try/finally in the job loop to ensure `tickJob` is always called.
- Write results via parameterized `INSERT ... ON CONFLICT DO UPDATE`.

---

### vndb-tag-web-cache.ts / vndb-tag-web-parser.ts

---

No issues. Cache reads are wrapped in try/catch. Stale-while-error is handled cleanly. The parser is pure with no network or DB access.

---

### download-status.ts

---

No issues. The `MAX_LISTENERS = 100` cap prevents unbounded listener leaks from abandoned SSE connections. The GC logic correctly prunes finished jobs older than 1 hour.

---

### top-ranked.ts / top-ranked-query.ts

---

No issues. `limit` is clamped to [10, 200] and VNDB `results` is clamped to 100. `parseMinVotes` snaps to a preset to prevent cache-key proliferation from arbitrary user input.

---

### reading-speed.ts

---

No issues. Query is parameterized and bounded by the `completed` status filter. The 3-sample threshold prevents overconfident predictions.

---

### recentlyViewed.ts

---

No issues. `localStorage` access is guarded by `typeof window !== 'undefined'`. Parse failures are caught and return an empty array. Items are capped at `MAX_ITEMS = 12`.

---

### language-names.ts / platform-label.ts

---

No issues. Pure lookup tables with safe fallbacks for unknown codes.

---

### api-body.ts / api-error.ts / api-error-read.ts

---

No issues. `readJsonObject` correctly normalizes `null` bodies and non-object results to `{}`. `upstreamError` strips the raw upstream message from the client response while logging server-side. `readApiError` swallows JSON parse errors safely.

---

### format.ts / time-ago.ts

---

No issues reviewed. Pure utility functions with no network or DB access.

---

## SUMMARY

### Totals by severity

| Severity | Count |
|----------|-------|
| HIGH     | 4     |
| MEDIUM   | 8     |
| LOW      | 7     |

### Files with HIGH severity issues

| File | Issue |
|------|-------|
| `db.ts` | Missing `busy_timeout` PRAGMA — concurrent writers receive immediate `SQLITE_BUSY` |
| `auth-gate.ts` | `TRUSTED_PROXY_SECRET` compared with plain `===` instead of timing-safe equality |
| `vndb-cache.ts` | Three `JSON.parse(cached.body)` calls outside try/catch — corrupted cache row crashes callers |
| `activity.ts` | `recordActivity()` has no try/catch — DB errors in the secondary activity INSERT propagate to primary callers |

### Security-critical patterns

1. **Timing oracle on proxy secret** (`auth-gate.ts:85`): The admin token comparison is correctly timing-safe, but the `TRUSTED_PROXY_SECRET` check immediately adjacent to it is not. An attacker on the network who can measure response timing can brute-force the proxy secret character by character.

2. **Missing IPv6 DNS rebind protection** (`url-allowlist.ts:100-112`): `assertNoPrivateIpRebind` only checks IPv4. A hostile allowlisted DNS server could return `::1` or a private IPv6 address to redirect requests to local services.

3. **Unbounded response buffering** (`files.ts:118`, `erogamescape.ts:202`): Two code paths call `res.arrayBuffer()` / `res.text()` with no body-size cap. A hostile or misconfigured upstream can exhaust server memory.

4. **Cache corruption crash** (`vndb-cache.ts:125,141,225`): Three paths call `JSON.parse` on DB-stored bytes without try/catch. A single corrupted row in `vndb_cache` breaks every cache hit for that key with a 500 error until the row is deleted manually.

5. **recordActivity not fire-and-forget** (`activity.ts:77-88`): Activity logging is called from write paths where it is intended to be a best-effort side effect. Without a try/catch, a disk-full or busy-timeout error on the activity INSERT causes the entire primary operation (e.g. `updateCollection`) to surface a 500 to the user.

### Positive patterns (things done well)

- All DB queries use parameterized `?` / `@named` binding — no string interpolation on untrusted data.
- `isAllowedHttpTarget` is applied consistently at `throttledFetch`, `cachedFetch/doFetch`, `mirrorUrl`, `downloadToBucket`, `fetchVndbWebHtml`, and the EGS SQL endpoint.
- All migrations are gated by `app_setting` marker rows — fully idempotent on re-open.
- `safeJsonParse` helper is used throughout `rowToItem` for DB JSON columns.
- `maskActivityPayload` uses a word-boundary regex that correctly masks sensitive key suffixes without over-masking innocuous keys like `cache_key`.
- The 8KB activity payload cap prevents runaway row sizes.
- `timingSafeEqual` is used for the admin token; the same pattern needs to be applied to the proxy secret.
- EGS bulk lookups are chunked at 500 to stay below `SQLITE_MAX_VARIABLE_NUMBER`.
- `ORDER BY RANDOM()` is always paired with `LIMIT 1` — no unbounded random sort.
