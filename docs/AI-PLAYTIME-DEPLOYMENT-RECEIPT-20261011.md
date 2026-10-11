# AI playtime deployment receipt - 11 October 2026

## Delivered state and acceptance boundary

The explicitly requested application commit
`533ed152697085aad0f20f55fe8c203d3a700921` is deployed and running.
Migration `0014_ai_playtime_estimate` is applied in production. This is an
activation receipt, not a claim that the whole project is defect-free or
that its failing full test suite has been repaired.

The exact SHA was retained after the functional defects and red gates below
were disclosed and the user explicitly instructed deployment to proceed.
No application source was changed during this deployment. Subsequent
documentation commits on `main` are not the active application revision.

## Source and immutable release

- `origin/main` was fetched and pulled fast-forward to
  `ea6d11b90bfa66e246ce7bd2e846fa356d453b04`. Its only difference from the
  requested SHA was 51 added documentation lines in the handoff guide.
- The transferred bundle was verified locally and on the server with
  SHA-256 `cabf0585a2703587929303669755a95623bd779f3accfa46f407d38db9be2bb1`.
- The server checked out the exact requested commit from that bundle.
- Active symlink: `/var/www/vndb-current` resolves to
  `/var/www/vndb-releases/533ed152697085aad0f20f55fe8c203d3a700921`.
- Independent inspection confirmed the Git SHA and `MainPID=396176` working
  directory at that release's `.next/standalone` directory.
- `ActiveState=active`, `NRestarts=0`; health reports `status=ok`,
  `backend=postgres`, `database=available`.

## Backup, migration and preserved state

A fresh, private PostgreSQL custom-format backup was retained before the
migration at
`/var/backups/vndb-ai-deploy-533ed152/activation-pre-0014.dump`.
Its SHA-256 is
`7fc40e204feff534caf7c91261668f10a8ef95bfbea396966667c2528522bfa3`.
The earlier pre-migration backup was also retained. Backup files remain
private; no database payload is published with this receipt.

The deployment followed the existing release script, with a second build
and standalone asset copy after the migration. The initial build remained
before any schema change. The temporary wrapper did not alter tracked
application code or server configuration.

1. Frozen dependency installation and initial production build succeeded.
2. The repository migration runner reported
   `applied: ["0014_ai_playtime_estimate"]` and skipped the prior 13 versions.
3. The post-migration production build succeeded.
4. A loopback candidate reported PostgreSQL available before activation.
5. Only the `vndb` application service was restarted.
6. The active symlink, actual process directory, SHA and health were checked
   independently after activation and again after verification.

Fresh catalog checks confirmed 14 migrations, all seven AI columns and
`collection_ai_playtime_consistency`. All 198 production collection rows
were retained. The deterministic digest of every pre-existing collection
field was identical before activation, after activation and after testing:
`419db88445ed4449e939aebdf685eae4`. The digest deliberately excludes only the
seven newly added AI columns, so personal playtime, preferences, notes,
ratings, membership and timestamps are included in the comparison.

All 59 production tables were sampled in a read-only repeatable-read audit.
Immediately after activation, only `schema_migration` differed. After the
read-only page checks, `vndb_cache` also differed and had one additional row;
every other table retained its row count and digest. This is not a claim
that the application's caches never change during normal page visits.

nginx configuration hashes, environment-file metadata, systemd unit hash,
mount configuration hash and nginx runtime identity were unchanged.
Environment-file values were not inspected or published. nginx retained
`MainPID=1148` and its original activation timestamp. Unauthenticated
public HTTPS `/api/health` still returned exactly HTTP 401.

All nine previous releases remain, for ten releases total. Retention was
set to 1,000 for this run; no old release was pruned. Preflight reported
370,863,542,272 free bytes and 28,328,407 free inodes.

## Fresh runtime and browser checks after activation

| Check | Result and environment |
| --- | --- |
| Production health, collection and AI read/rejection checks | 14/14 passed; three real existing collection entries sampled without publishing their identities or making a successful production collection write |
| Public HTTPS boundary | Unauthenticated health returned 401 |
| Frontend regression sentinel | `PASS: 32`, `FAIL: 0`, exit 0 against the active production process through a local SSH tunnel |
| Mobile production navbar | Chrome 390 x 844: 69 px header, 390 px document width, 198 entries loaded; all 31 menu links present; Wishlist navigation succeeded and closed the menu |
| Isolated AI API acceptance on deployed Linux artifact | `Acceptance passed: 12/12`, exit 0 |
| Whole API authorization/CSRF audit on deployed Linux artifact | 210 declared handlers, 122 mutating handlers, no missing mutation gate; `303 passed, 0 failed, 303 checks`, exit 0 |
| Project-wide initial page rendering | All 31 index pages rendered a main surface in Chrome at 390 and 1,440 px, with no matched fatal-error surface; this checks initial rendering, not every interaction or integration |
| Four-source detail and library card | Synthetic fixture displays VNDB 10 h, EGS 10 h, personal 10 h and AI 40 h 2 min; Combined displays 17 h 31 min; AI contribution is visible on the card |
| Preferred AI headline | Known defect reproduced again after clicking Use AI and reloading: headline still resolves to Combined |

Successful PUT, preference changes and DELETE were exercised only in a
new, isolated PostgreSQL database with four synthetic entries. That process
used the exact deployed Linux release, its dependencies and standalone
build, with a restricted role owning only the QA database. It loaded no
production environment file. It was not a second production deployment.

The 12 scenarios verify all persisted AI fields, protected PUT/DELETE,
invalid bounds, absent membership, positive-only four-source sorting in
both directions, rejection of AI for all five non-playtime preferences,
personal-time preservation and DELETE cleanup of stale AI preference.

The QA process was stopped after testing; the task-created database, role
and private generated configuration were removed. Independent checks found
zero remaining QA databases/roles and no listener on its loopback port.
No existing production database, role, credential or volume was removed.

The broad page pass observed a transient document width of 413 px on
`/schema` at 390 px. A subsequent hydrated inspection measured 390 px; the
wide tables were inside their scrolling surfaces. The transient observation
is retained rather than reported as a proven persistent regression or a
fixed defect. No Safari or physical iPhone control is claimed.

## Project-wide defects and red gates retained in this exact SHA

The following were found in the broader pre-activation audit of the same
exact SHA, not fixed by deployment:

1. PostgreSQL detail source preferences do not accept `ai` in
   `src/lib/db/repositories/vn-detail.ts:74`; validation at line 82 returns
   an empty map for that persisted choice, losing unrelated preferences
   in the reader's result. The server-artifact browser test reproduced
   Combined after Use AI again after activation.
2. `db/postgres/migrations/0014_ai_playtime_estimate.sql:12` allows partially
   null AI records under PostgreSQL CHECK/NULL semantics. Five synthetic,
   rolled-back SQL probes reproduced missing central/lower/upper/model/date
   records being accepted. The API bounds validation tested above still
   rejects malformed input.
3. Version-2 collection JSON export/import omits the seven AI fields:
   `src/lib/db/repositories/collection-transfer.ts:74` and line 126. A
   synthetic real export reproduced the omission. This is distinct from
   full PostgreSQL backup/restore, which retained the AI fields in the
   earlier isolated restore check.
4. The numeric AI form lacks `inputMode` at
   `src/components/PlaytimeCompare.tsx:383`; fixtures, the backup migration
   mock and documented API inventory also need alignment.

The prior full-suite run on this SHA, with Node.js 22.23.3 and working
native dependencies, reported:

```text
Test Files 7 failed | 974 passed (981)
Tests 86 failed | 10215 passed (10301)
```

`yarn test` and `yarn test:cov` failed. No global 100/100/100/100 coverage
result is accepted. The earlier typecheck, both direct TypeScript
diagnostics and build passed; the two Linux production builds above are
fresh deployment evidence. This receipt does not relabel the earlier full
test run as a new post-deployment run or substitute the narrower runtime
checks for the full test gate. VN Collection does not declare backend
`lint`, `format` or `test:e2e` scripts.

The earlier whole-project audit had 40 passing and seven failing checks
across 47 scenarios, covering index routes, glossary behavior, JSON export,
full backup/restore, five database consistency cases and detail preferences.
The seven failures comprise the three functional defect families above.

The dependency audit reported 40 alerts by dependency path, including three
critical alerts for Next.js 16.3.2. Manifest and lockfile are unchanged from
the preceding release. The image optimizer was observed active in QA;
absence of imported `next/image` consumers is not proof that it is disabled.
No exploit was attempted. Earlier QA logs also contained unconfigured
Steam warnings and destination-stream errors whose cause was not isolated.

`src/app/layout.tsx` and `src/components/MoreNavMenu.tsx` are unchanged from
the preceding accepted release. This deployment did not redesign the
navbar, patch those defects, generate real estimates for the user's
collection or touch installed games/media.

## Rollback

The prior application release
`f76853de7c828add52e1b1f26a2ba68f38668ca3` remains available. An application
rollback restores the active symlink to that retained release and restarts
only `vndb`, then checks the actual process directory, SHA and health.
Migration 0014's nullable expand-only columns remain; do not drop them
during application rollback. The private pre-migration backup is retained
for a separately reviewed database recovery if needed. No rollback was
executed during this successful activation.

## Publication

This sanitized receipt is linked from the deployment handoff and published
on the application's `main` branch after runtime verification. The personal
canonical Wiki records the activated SHA, accepted evidence and remaining
defects separately from the previous release's historical green gates.
No private server address, authentication value, cookie, token, real
collection identity or customer payload belongs in these publications.
