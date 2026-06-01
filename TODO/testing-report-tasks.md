# Testing audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| TESTA-001 | CRITICAL | SSRF regression coverage exercises direct `safeFetch` redirects but not proxy-enabled initial URLs and redirects. Add proxy-hop allowlist and private-address rejection tests. | `tests/safe-fetch.test.ts`, `src/lib/proxy-fetch.ts` | DONE_WITH_DIFF |
| TESTA-002 | HIGH | Collection listing has no contract test proving private fields are absent from public-shaped responses. Add an exact response-body security test. | `tests/collection-public-dto.test.ts`, `src/app/api/collection/route.ts` | DONE_WITH_DIFF |
| TESTA-003 | HIGH | New stock browser, map, places, and place detail routes do not have route-level loading-state checks. Add file-presence QA and component smoke coverage. | `tests/loading-states.test.ts`, `src/app/{alicesoft_kobe,map,places,places/[id]}/loading.tsx` | DONE_WITH_DIFF |
| TESTA-004 | HIGH | VN stock navigation race behavior is untested. Add deterministic delayed-response tests proving stale responses cannot replace the active VN. | `tests/stock-prices-section.test.tsx`, `src/components/StockPricesSection.tsx` | TODO |
| TESTA-005 | MEDIUM | Collection `limit` handling has no regression test proving SQL and API bounds. Add database and route tests for defaults, maximums, and invalid values. | `tests/db.test.ts`, `tests/api-collection.test.ts` | TODO |
| TESTA-006 | MEDIUM | The repository has no formal lint script despite relying on style and safety conventions. Add a lint command or document the intentionally limited gate clearly. | `package.json`, `CLAUDE.md` | TODO |
| TESTA-007 | MEDIUM | Existing QA does not cover narrow mobile tutorial placement, VN detail height, or touch-target sizing. Add browser-driven assertions for representative narrow viewports. | `tests/qa-responsive.test.ts`, `src/components/**` | TODO |
| TESTA-008 | LOW | Rotated `SafeImage` rendering has no orientation regression coverage. Add component tests for portrait, landscape, and rotated framing calculations. | `tests/safe-image-rotation.test.ts`, `src/components/SafeImage.tsx` | DONE_WITH_DIFF |
| TESTA-009 | HIGH | The place-registry response contract had no regression proving that structured registry rows and string physical-location suggestions remain separate. Add a route-level contract test with both payload shapes populated. | `tests/place-coordinates.test.ts`, `src/app/api/places/route.ts` | DONE_WITH_DIFF |
