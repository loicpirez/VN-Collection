# UI and UX audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| UIUXA-001 | HIGH | VN detail pages can become extremely tall on mobile, making core actions and section navigation difficult to reach. Add compact mobile section navigation and collapse secondary content by default. | `src/components/VnDetailLayout.tsx`, `src/app/vn/[id]/page.tsx` | TODO |
| UIUXA-002 | HIGH | The tutorial launches over narrow screens with desktop-oriented positioning and can obscure the interface. Use responsive placement, viewport-aware scrolling, and a clear dismiss path. | `src/components/TutorialOverlay.tsx` | TODO |
| UIUXA-003 | HIGH | Stock provider setup, diagnostics, and results compete for visual priority on VN detail pages. Separate compact result summary from advanced configuration and diagnostics. | `src/components/StockPanel.tsx`, `src/components/StockPricesSection.tsx` | TODO |
| UIUXA-004 | MEDIUM | Some route transitions lack route-level skeletons, producing abrupt content replacement instead of stable loading geometry. Add skeletons for the stock browser, map, and place detail routes. | `src/app/alicesoft_kobe/loading.tsx`, `src/app/map/loading.tsx`, `src/app/places/[id]/loading.tsx` | TODO |
| UIUXA-005 | MEDIUM | Map loading uses a plain textual placeholder instead of a stable skeleton surface. Mirror the map viewport and side-panel geometry during loading. | `src/components/MapClient.tsx`, `src/app/map/loading.tsx` | TODO |
| UIUXA-006 | MEDIUM | Owned-edition selection silently stops after a fixed release count, with no paging or explanation. Add searchable pagination and a visible result range. | `src/components/OwnedEditionsSection.tsx` | TODO |
| UIUXA-007 | MEDIUM | Expanded stock provider groups do not expose range, result count, or density controls for long lists. Add compact pagination and consistent row density. | `src/components/StockPanel.tsx` | TODO |
| UIUXA-008 | LOW | Home layout controls and card-grid controls remain visually fragmented across toolbar areas. Consolidate related display controls into one predictable group. | `src/components/LibraryClient.tsx`, `src/components/SettingsButton.tsx` | TODO |
