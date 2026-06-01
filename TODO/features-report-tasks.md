# Feature completeness audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| FEA-001 | HIGH | The GEO stock provider remains an incomplete parser path and does not deliver the same structured stock guarantees as other providers. Finish parsing, fixtures, and diagnostics before presenting it as supported. | `src/lib/stock.ts`, `tests/stock.test.ts` | TODO |
| FEA-002 | HIGH | Owned-edition selection is capped at 100 releases without navigation, leaving large VN release histories incomplete. Add paginated or searchable release selection. | `src/components/OwnedEditionsSection.tsx` | TODO |
| FEA-003 | HIGH | Generic stock offer groups render long lists without pagination or bounded expansion. Add compact pagination with range state per provider group. | `src/components/StockPanel.tsx`, `src/components/StockPricesSection.tsx` | TODO |
| FEA-004 | MEDIUM | Bulk stock refresh state is process-memory only, so refresh progress disappears on restart and cannot be resumed reliably. Persist durable job state or explicitly constrain the feature to foreground operation. | `src/lib/stock-refresh.ts`, `src/app/api/stock/**` | TODO |
| FEA-005 | MEDIUM | Stock provider capability metadata is not expressive enough to distinguish search-only links, structured price results, exact JAN lookups, and unfinished providers. Introduce an explicit capability contract used by UI and docs. | `src/lib/stock-providers.ts`, `src/components/StockPanel.tsx` | TODO |
| FEA-006 | MEDIUM | Tutorial step counts and desktop-only assumptions no longer match the expanded application surface. Rebuild the tour registry around actual routes, mobile behavior, and keyboard help. | `src/components/TutorialOverlay.tsx`, `src/lib/tutorial.ts` | TODO |
| FEA-007 | LOW | The AliceSoft Kobe browser, route naming, labels, and provider identifiers are not consistently branded. Choose one canonical name and migrate UI, docs, route descriptions, and setting keys coherently. | `src/app/alicesoft_kobe/**`, `src/lib/alicesoft-kobe.ts`, `CLAUDE.md` | TODO |
