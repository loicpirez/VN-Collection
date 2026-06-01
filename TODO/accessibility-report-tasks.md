# Accessibility audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| A11YA-001 | HIGH | Map, places, and stock-loading surfaces introduce nested `<main>` landmarks under the root layout landmark. Keep one primary landmark and use sections inside page content. | `src/app/layout.tsx`, `src/app/map/page.tsx`, `src/app/places/page.tsx`, `src/app/places/[id]/page.tsx`, `src/app/stock/loading.tsx` | DONE_WITH_DIFF |
| A11YA-002 | HIGH | Shelf spatial fullscreen lacks complete modal semantics, focus trapping, and reliable focus restoration. Use the shared dialog accessibility primitive. | `src/components/ShelfSpatialFullscreen.tsx`, `tests/bug-regression-source-pins.test.ts` | DONE_WITH_DIFF |
| A11YA-003 | HIGH | Shelf layout editor fullscreen mode has the same incomplete modal keyboard contract. Apply labelled dialog semantics, Escape close, and focus containment. | `src/components/ShelfLayoutEditor.tsx`, `tests/bug-regression-source-pins.test.ts` | DONE_WITH_DIFF |
| A11YA-004 | HIGH | Tutorial step changes are not announced and focus is not intentionally managed when the target changes. Add a live region and predictable keyboard focus behavior. | `src/components/TutorialTour.tsx`, `tests/tutorial-tour-a11y.test.ts` | DONE_WITH_DIFF |
| A11YA-005 | MEDIUM | Stock refresh actions can be discoverable only through hover styling and compact icon affordances. Keep visible labelled actions and expose clear pressed, busy, and disabled states. | `src/components/StockPanel.tsx` | IN_PROGRESS |
| A11YA-006 | MEDIUM | Map loading state is not exposed as a status region. Add `role=\"status\"`, accessible loading copy, and a matching skeleton. | `src/components/MapPageClient.tsx`, `src/app/map/loading.tsx` | DONE_WITH_DIFF |
| A11YA-007 | LOW | Collapsed stock groups expose a small numeric badge without enough semantic context. Include provider name, result count, and expansion state in the accessible label. | `src/components/StockPanel.tsx` | IN_PROGRESS |
