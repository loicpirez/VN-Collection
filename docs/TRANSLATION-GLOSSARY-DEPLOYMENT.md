# Translation glossary API deployment handoff

Status: source implemented and tested; production deployment is intentionally left to the deployment agent.

## Purpose

Kamui Local and PlayTranslate can download the VN collection game list and a compact Japanese-name-to-romaji glossary for each selected game. The clients cache these responses locally for offline use. The feature is disabled by default in both clients.

## New authenticated routes

- `GET /api/translation-glossary/games?page=1&limit=500`
  - Returns collection games ordered by title.
  - `limit` is bounded to 500.
  - Response fields: `version`, `games`, and `pagination`.
- `GET /api/translation-glossary/:vndbId`
  - Accepts a VNDB `vNNN` identifier.
  - Fetches every VNDB character page (100 records per page), de-duplicates
    character ids, and fails closed if an invalid upstream response keeps
    pagination open beyond the 100-page safety guard.
  - Returns only useful `original` Japanese name → `romaji` mappings, aliases, and the character role in that VN.

Both routes call `requireLocalhostOrToken`. On the nginx deployment, retain the existing Basic-auth boundary and trusted reverse-proxy secret/header configuration. Do not place Basic credentials in application environment variables or logs. Clients may authenticate to nginx with an ordinary `Authorization: Basic …` header; nginx must continue to add the application’s trusted proxy authentication after validating it.

## Deployment procedure

1. Pull `origin/main` on the VNCollection host.
2. Preserve the current `.env`, database, nginx configuration, volumes, and proxy-secret configuration.
3. Build using the repository’s normal production procedure.
4. Restart only the VNCollection application service; do not replace the database or cache volumes.
5. From behind the nginx Basic-auth boundary, verify:
   - page 1 of `/api/translation-glossary/games?limit=2` returns HTTP 200 and at most two games;
   - `/api/translation-glossary/v1` (or a VN id that exists in the collection) returns HTTP 200 with `version: 1` and a `characters` array;
   - a malformed id returns HTTP 400;
   - a request that bypasses the approved auth path remains denied.
6. Record the deployed commit and endpoint checks in the canonical Codex wiki.

## Verification performed before handoff

- `vitest run tests/translation-glossary.test.ts tests/api-route-policy.test.ts`: passed (5 tests).
- TypeScript produced no diagnostic for the new translation-glossary files. The sparse handoff checkout cannot complete the repository-wide typecheck because `scripts/prepare-qa-snapshot.ts`, which is outside the sparse checkout, is absent.
- No production deployment, nginx edit, credential read, or database mutation was performed.

## 11 October follow-up: complete casts

The initial handoff fetched only the first 100 VNDB character rows. That
implementation is superseded: the route now uses the exhaustive paged helper,
so large casts are not silently truncated before role sorting and glossary
generation. The deployment agent must pull the latest `main`, not the original
`293e32b` handoff commit, and repeat the route/auth checks above.

Fresh follow-up verification passed 13/13 focused route, pagination and auth
tests. The repository-wide TypeScript command still stops only on the known
sparse-checkout omission of `scripts/prepare-qa-snapshot.ts`; the new files
produce no diagnostic before that unrelated missing-module error.

## Rollback

Roll back the application commit and rebuild/restart the application service. The routes add no database schema and perform no migration, so there is no data rollback step.
