# AI playtime estimate deployment handoff

Status: source prepared and tested, then pushed to `main`; production deployment is intentionally left to the deployment agent.

## Product contract

The AI estimate is a fourth playtime source, separate from the user's actual `playtime_minutes`:

- VNDB community length;
- ErogameScape median playtime;
- personal recorded playtime;
- bounded AI estimate.

The AI record stores a central value, lower and upper bounds, optional confidence, model identifier, optional rationale, and generation timestamp. Selecting AI changes only `source_pref.playtime`. It never overwrites personal playtime.

`combined_playtime` is the arithmetic mean of every populated positive source. Null and zero values are ignored. The same shared SQL expression drives SQLite and PostgreSQL library sorting, while the detail comparison and cards apply the same four-source rule.

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

Migration `0014_ai_playtime_estimate.sql` adds seven nullable columns plus a consistency constraint. It is expand-only.

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
   - selecting combined uses the four positive sources without changing personal playtime;
   - sorting the library by total duration uses the same combined order;
   - `DELETE` clears the AI estimate and removes a now-stale AI source preference, without changing personal playtime.
7. Record the deployed commit, migration version, and endpoint checks in the canonical wiki.

Do not copy the nginx address, login, password, browser cookie, or proxy secret into a command transcript, commit, release note, or wiki page.

## Verification before handoff

- Production build: passed (`next build`, including TypeScript and route generation).
- Focused tests: 52 tests passed across the AI route/form, executed four-source SQL sort, source preference, collection decoding, cards, route policy, and migration manifest.
- Repository-wide TypeScript: passed after restoring the tracked `scripts` directory in the sparse checkout.
- The repository-wide Vitest run was attempted but could not be used as a release gate in this checkout: its SQLite suites fail before test logic because the installed `better-sqlite3` tree has no native binding for Node 24.19.0. The focused tests avoid that environmental defect; one of them executes the production shared sort expression with Node's built-in SQLite engine.
- No production deploy, nginx edit, production database mutation, or V: write was performed.

## Read-only dumped/install reconciliation

The authenticated production snapshot contains 172 entries marked dumped. Against the current launch-target inventory, 156 match a launchable target and 16 do not.

The non-matched set is not equivalent to “missing from the PC”:

- seven are explicit historical no-executable exclusions: `v1270`, `v2059`, `v177`, `v8533`, `v2398`, `egs_894`, and `v116`;
- `v99` (Suika) is independently confirmed installed outside the launch-target snapshot: the sanitized canonical record `work/vn-length-audit/inventory.json` has `id=v99`, `origin=reconciled-path-live-verified`, `exeExists=true`, and `rootExists=true`; `wiki/apps/legacy-windows-vn-ninkyo-suika.md` independently records the verified Windows reconstruction and executable;
- eight still require identity/path requalification: `v458`, `v21170`, `v86`, `v2515`, `v6385`, `v2301`, `v2654`, and `v16151`.

Therefore the evidence currently proves 157 of 172 dumped records present on the PC, identifies seven intentional exclusions, and leaves eight unresolved. It does **not** prove that those eight are absent.

`V:\DUMP\Done` was inspected read-only. It contains 24 files representing 20 logical media/archive sets: two `.mds` sidecars reduce the logical count by two, and the three BALDR FORCE files form one set, reducing it by two more (`24 - 2 - 2 = 20`). That folder is a media subset, not the complete installed-game inventory, so filename absence there cannot classify an installed title as missing. Nothing on V: was modified, renamed, extracted, or deleted.

## Rollback

Roll back the application commit and rebuild/restart the service. Because migration 0014 is nullable and expand-only, its columns may safely remain during an application rollback. Do not drop them during an incident; removal would be a later reviewed contract migration after backups and data-retention review.
