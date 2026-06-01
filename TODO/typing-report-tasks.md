# Typing audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| TYPEA-001 | HIGH | Character routes use `as unknown as VndbCharacter[]`, bypassing the real API shape. Introduce an explicit adapter that validates and maps source rows. | `src/lib/vn-character-row.ts`, `src/lib/vn-characters-cache.ts`, `src/components/RoutesSection.tsx`, `tests/vn-character-row.test.ts` | DONE_WITH_DIFF |
| TYPEA-002 | HIGH | Stock provider extra JSON is checked only shallowly before consumer-specific casts. Add discriminated schemas and validate provider payloads at the storage boundary. | `src/lib/erogeprice-meta.ts`, `src/lib/db.ts`, `src/lib/stock-prices.ts`, `src/components/StockPanel.tsx`, `src/components/ErogePricePanel.tsx`, `tests/stock-extras-validation.test.ts` | DONE_WITH_DIFF |
| TYPEA-003 | MEDIUM | Proxy-agent construction relies on `as unknown as Agent`, hiding compatibility assumptions between third-party agent types and Node requests. Define a narrow supported request-agent type or typed adapter. | `src/lib/proxy-fetch.ts` | TODO |
| TYPEA-004 | MEDIUM | Display-settings cookie parsing uses shallow casts after JSON decoding. Validate every persisted field against the versioned schema. | `src/lib/display-settings.ts` | TODO |
| TYPEA-005 | MEDIUM | Several cache and settings helpers directly cast parsed JSON without a type guard. Replace direct casts with `safeJsonParse` validators. | `src/lib/db.ts`, `src/lib/cache.ts` | TODO |
| TYPEA-006 | LOW | Card listing paths return the broad `CollectionItem` type even when only a projection is loaded. Introduce exact row DTOs for card and API projections. | `src/lib/db.ts`, `src/components/VnCard.tsx` | TODO |
| TYPEA-007 | LOW | Core modules have grown into very large files, making typed boundaries harder to reason about. Extract coherent provider, query, and DTO modules without changing behavior. | `src/lib/db.ts`, `src/lib/stock.ts`, `src/components/StockPanel.tsx` | TODO |
| TYPEA-008 | LOW | Leaflet icon initialization mutates a private prototype through an unsafe cast. Bundle assets and pass explicit `L.icon` configuration instead. | `src/components/MapCanvas.tsx`, `public/leaflet/` | DONE_WITH_DIFF |
