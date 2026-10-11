# AI playtime estimate deployment handoff

Status: the automatic four-source median correction has passed the complete release gates. Publication and immutable deployment are authorized; their exact revision and live evidence are recorded in the personal Wiki receipt after activation. The production activation described below is historical and remains a separate release.

Deployment update, 11 October 2026: the exact application commit `533ed152697085aad0f20f55fe8c203d3a700921` is active with migration 0014. See the [sanitized deployment receipt](AI-PLAYTIME-DEPLOYMENT-RECEIPT-20261011.md) for fresh runtime evidence, preserved data, rollback and the known defects/red gates retained in that exact SHA. The original handoff verification below is historical, not a claim that the whole-project test suite passes.

## Product contract

The AI estimate is a fourth playtime source, separate from the user's actual `playtime_minutes`:

- VNDB community length;
- ErogameScape median playtime;
- personal recorded playtime;
- bounded AI estimate.

The AI record stores a central value, lower and upper bounds, optional confidence, model identifier, optional rationale, and generation timestamp. A populated positive AI estimate participates automatically. There is no separate "Use AI" activation button. Legacy raw-source preferences remain compatible and change only the detail headline, not the shared median. An AI estimate never overwrites personal playtime.

`combined_playtime` is the mathematical median of every finite positive source. Null, zero and negative values are ignored. For an even sample, it averages the two middle values without intermediate rounding. For example, 600, 600, 600 and 2400 minutes produce 600 minutes, not 1050 minutes.

The shared rule applies to the detail comparison, cards, EGS panel, comparison page, reading queue, wishlist duration ordering, library filtering/sorting and CSV median column. Quick/advanced search and relation cards batch-load personal, EGS and AI sources for owned VNs. A detail page outside the collection uses its available VNDB/EGS median and retains those raw values separately. SQLite and PostgreSQL execute the same median SQL expression. Stats sum per-VN medians into a separately labelled collection-duration total. Personal hours played, annual activity and reader-speed calibration retain actual recorded playtime. Completion hints compare the recorded time against the median of external VNDB/EGS/AI sources, excluding the recorded time from its own reference.

JSON exports include all seven AI fields and the source-preference map. Importing an old backup that omits these fields preserves existing estimates; an explicit all-null record clears them. Invalid or partial estimates are rejected. CSV retains the existing personal-playtime column and appends EGS, AI and median duration columns.

## API and validation

`GET /api/collection/:id/ai-playtime` follows the existing public-read policy. `PUT` and `DELETE` call `requireLocalhostOrToken` and therefore remain protected mutations.

`PUT` accepts:

```json
{
  "minutes": 720,
  "lower_minutes": 600,
  "upper_minutes": 840,
  "confidence": 0.8,
  "model": "estimator-name-and-version",
  "rationale": "optional bounded explanation",
  "generated_at": 1700000000000
}
```

`generated_at` is optional and defaults to server time. Values must be positive integers, `lower_minutes <= minutes <= upper_minutes`, confidence must be null or between 0 and 1, model is required and bounded to 200 characters, rationale is optional and bounded to 2,000 characters, and future timestamps beyond five minutes are rejected. Activity records keep bounded provenance but intentionally omit the free-text rationale.

The endpoint is producer-neutral: a trusted local or authenticated estimator may generate values, then persist them through `PUT`. No model vendor credential or production Basic-auth credential belongs in this repository, logs, or wiki.

## Guide for an estimation agent

Use the AI field only for a researched estimate. Never copy an estimate into
`playtime_minutes`, which is the user's real recorded playtime, and do not
change `source_pref.playtime` unless the user explicitly asks for AI to become
the preferred display source.

For each collection VN:

1. Read `GET /api/collection/{vnId}/ai-playtime` before doing any write. A VN
   outside the collection returns 404 and must be skipped.
2. Research a central completion time and a defensible lower/upper range.
   Keep the consulted public URLs, page titles, access date and calculation in
   the agent's working evidence. Do not invent precision when sources disagree.
3. Convert hours to positive integer minutes with `round(hours * 60)` and
   enforce `lower_minutes <= minutes <= upper_minutes`.
4. Use a confidence from 0 to 1 only when it reflects source quality and
   agreement; otherwise use `null`. Identify both the estimating model and the
   prompt/method revision in `model`. Put only a concise, verifiable synthesis
   in `rationale` (at most 2,000 characters), without credentials or private
   host details.
5. Make the payload deterministic. Keep `generated_at` stable while the same
   evidence set is reused. If all seven returned fields already equal the
   intended payload, do not send a PUT: an identical PUT would still add an
   activity/update event.
6. Send the protected PUT, require HTTP 200, then GET the same endpoint and
   compare every returned field exactly. Record only the VN ID, outcome and a
   payload digest in operational logs; never log authentication material.
7. If an estimate must be withdrawn, use the protected DELETE for that VN and
   require `{ "ok": true, "estimate": null }`, then confirm the same null
   state with GET. This also clears a now-invalid AI playtime preference but
   does not alter personal playtime.

Example payload (minutes, not hours):

```json
{
  "minutes": 720,
  "lower_minutes": 600,
  "upper_minutes": 900,
  "confidence": 0.75,
  "model": "estimator-name-version / method-revision",
  "rationale": "Central estimate and range reconciled from dated public completion-time sources.",
  "generated_at": 1700000000000
}
```

For a batch, process one VN at a time with bounded concurrency and a retry cap.
Report counts for unchanged, created, updated, skipped, failed and verified;
never describe a request as persisted until its post-write GET matches.

## Schema and deployment

Migration `0014_ai_playtime_estimate.sql` adds seven nullable columns plus a consistency constraint. Migration `0015_ai_playtime_required_fields.sql` strengthens consistency: an estimate needs its central value, both bounds, model and timestamp, or all seven fields must be null. Optional confidence and rationale may remain null. The original migration is unchanged.

1. Pull the latest `origin/main` on the VNCollection host.
2. Preserve existing environment files, nginx Basic-auth configuration, proxy secret, PostgreSQL data, and storage volumes.
3. Build the candidate before changing the live database.
4. Apply the reviewed PostgreSQL migrations with the repository migration runner.
5. Restart only the VNCollection application service.
6. Behind the existing nginx authentication boundary, verify:
   - an existing collection item returns `{"estimate": null}` before an estimate exists;
   - malformed bounds return HTTP 400;
   - an authenticated `PUT` persists all provenance fields;
   - `source-pref` accepts `{"playtime":"ai"}` and rejects AI for every other field;
   - saving AI immediately recalculates the four-source median, without a "Use AI" action or personal-playtime mutation;
   - sorting the library by total duration uses the same combined order;
   - duration filtering, comparison, wishlist and reading queue use that median; stats distinguish collection-duration medians from personal hours played;
   - JSON export/import preserves the complete AI record and legacy backup compatibility; CSV personal time remains unchanged;
   - `DELETE` clears the AI estimate and removes a now-stale AI source preference, without changing personal playtime.
7. Record the deployed commit, migration version, and endpoint checks in the canonical wiki.

Do not copy the nginx address, login, password, browser cookie, or proxy secret into a command transcript, commit, release note, or wiki page.

## Current correction verification

Fresh gates after the final source/test edit:

- `yarn typecheck`: exit 0.
- `yarn build`: exit 0; compiled, TypeScript passed and 5/5 static pages generated.
- `yarn test`: exit 0; 985 files and 10,358 tests passed.
- `yarn test:cov`: exit 0; 986 files and 10,457 tests passed, including PostgreSQL. Statements 47001/47001, branches 39800/39800, functions 9626/9626 and lines 40161/40161, all 100%.

Local browser acceptance uses a separate SQLite database with only synthetic collection entries, not production data. An AI-only source participates after save/reload and disappears after clear. Four sources 10/10/10/40 h consistently show 10 h in the detail, cards, EGS, comparison and queue. A minimum filter of 14 h retains the AI-only 15 h entry. Stats show 25 h of medians separately from 10 h actually played. The optimized local build also renders the four-source detail automatically with no "Use AI" control.

Widths of 390, 1024 and 1440 px were inspected; mobile comparison has no document overflow at 390 px. These are Chrome viewport checks, not physical iPhone/Safari acceptance. No new production activation is implied by this guide.

## Historical verification before the original handoff

- Production build: passed (`next build`, including TypeScript and route generation).
- Focused tests: 52 tests passed across the AI route/form, executed four-source SQL sort, source preference, collection decoding, cards, route policy, and migration manifest.
- Repository-wide TypeScript: passed after restoring the tracked `scripts` directory in the sparse checkout.
- The repository-wide Vitest run was attempted but could not be used as a release gate in this checkout: its SQLite suites fail before test logic because the installed `better-sqlite3` tree has no native binding for Node 24.19.0. The focused tests avoid that environmental defect; one of them executes the production shared sort expression with Node's built-in SQLite engine.
- No production deploy, nginx edit, production database mutation, or V: write was performed.

## Read-only dumped/install reconciliation

The authenticated production snapshot contains 172 entries marked dumped. Against the current launch-target inventory, 156 match a launchable target and 16 do not.

The non-matched set is not equivalent to “missing from the PC”:

- seven are explicit historical no-executable exclusions;
- one is independently confirmed installed outside the launch-target snapshot by the canonical private installation inventory and reconstruction record;
- eight still require identity/path requalification. Per-title identifiers and installation evidence remain in the personal Wiki rather than this public deployment guide.

Therefore the evidence currently proves 157 of 172 dumped records present on the PC, identifies seven intentional exclusions, and leaves eight unresolved. It does **not** prove that those eight are absent.

`V:\DUMP\Done` was inspected read-only. It contains 24 files representing 20 logical media/archive sets: two `.mds` sidecars reduce the logical count by two, and the three BALDR FORCE files form one set, reducing it by two more (`24 - 2 - 2 = 20`). That folder is a media subset, not the complete installed-game inventory, so filename absence there cannot classify an installed title as missing. Nothing on V: was modified, renamed, extracted, or deleted.

## Rollback

Roll back the application release and restart the service while preserving older immutable releases. Migration 0014 columns and the strengthened 0015 constraint can remain during application rollback: the previous valid writer satisfies the new constraint. Do not drop AI columns during an incident; removal would be a later reviewed contract migration after backups and data-retention review. Back up before migration, inspect any incompatible existing records read-only, and stop for explicit repair if migration rejects them rather than silently discarding estimates.
