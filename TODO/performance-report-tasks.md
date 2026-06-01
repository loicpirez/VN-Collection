# Performance audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| PERFA-001 | HIGH | The home route constructs and serializes library data more than once before rendering the main client surface. Compute one bounded projection and reuse it. | `src/app/page.tsx`, `src/components/LibraryClient.tsx` | TODO |
| PERFA-002 | HIGH | Collection listing defaults can reach roughly ten thousand rows and the route limit is not reliably enforced. Bound database and response sizes and add pagination or virtualization. | `src/app/api/collection/route.ts`, `src/lib/db.ts` | TODO |
| PERFA-003 | HIGH | Producer and publisher sorting uses scalar subqueries per row, multiplying work for large collections. Replace with joined aggregates and supporting indexes. | `src/lib/db.ts` | TODO |
| PERFA-004 | HIGH | Per-VN stock refresh executes many provider fetches serially, causing long waits and poor failure isolation. Add bounded concurrency with per-provider timeouts and stable ordering. | `src/lib/stock.ts` | TODO |
| PERFA-005 | HIGH | Bulk stock refresh can iterate thousands of items with nested serial provider requests. Chunk work, bound concurrency, expose durable progress, and allow cancellation. | `src/lib/stock-refresh.ts`, `src/app/api/stock/**` | TODO |
| PERFA-006 | MEDIUM | The in-process stock refresh queue has no explicit upper bound. Cap queued work and return a useful rejection when capacity is reached. | `src/lib/stock-refresh.ts` | TODO |
| PERFA-007 | MEDIUM | VN detail rendering receives a server stock snapshot but the price section can still issue an immediate extra client fetch. Hydrate from the snapshot and refresh only on explicit action or stale policy. | `src/app/vn/[id]/page.tsx`, `src/components/StockPricesSection.tsx` | TODO |
| PERFA-008 | MEDIUM | Place and aspect queries build large `IN` placeholder lists without chunking. Use bounded chunks to avoid SQLite variable limits and memory spikes. | `src/lib/db.ts` | TODO |
| PERFA-009 | LOW | Stock offer rendering maps every provider result even when only a compact preview is visible. Paginate the data projection before rendering rows. | `src/components/StockPanel.tsx` | IN_PROGRESS |
| PERFA-010 | MEDIUM | Library mounts fetch every advanced-filter facet even while the filter drawer is collapsed. Load facets on first open, cache the result, and bound large responses. | `src/components/LibraryClient.tsx` | DONE_WITH_DIFF |
| PERFA-011 | MEDIUM | Place registry listing computes stock counts through a correlated scalar subquery for every row. Replace it with a pre-aggregated join and verify supporting indexes. | `src/lib/db.ts`, `tests/places.test.ts`, `tests/performance-query-shapes.test.ts` | DONE_WITH_DIFF |
| PERFA-012 | MEDIUM | Reading queue and list pages interpolate unbounded `IN` placeholder lists. Chunk or cap identifiers to stay below SQLite variable limits. | `src/components/ReadingQueueStrip.tsx`, `src/app/lists/[id]/page.tsx`, `tests/performance-query-shapes.test.ts` | DONE_WITH_DIFF |
