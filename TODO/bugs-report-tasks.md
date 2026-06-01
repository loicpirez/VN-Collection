# Bug audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| BUGA-001 | HIGH | Root metadata title composition can duplicate the product name on map and places routes because child metadata already includes it. Keep route titles semantic and let the root template append the product name once. | `src/app/layout.tsx`, `src/app/map/page.tsx`, `src/app/places/page.tsx` | TODO |
| BUGA-002 | HIGH | VN stock results can race when navigating between VN pages: the section does not reset or abort stale work before applying a late response. Add request cancellation or sequence guards and reset loading state on VN change. | `src/components/StockPricesSection.tsx` | TODO |
| BUGA-003 | HIGH | Collection listing accepts a `limit` value but the backing query path does not consistently enforce it. Apply a bounded SQL limit and test the route contract. | `src/app/api/collection/route.ts`, `src/lib/db.ts` | TODO |
| BUGA-004 | MEDIUM | Rotated `SafeImage` sizing uses `Math.min`, shrinking images too aggressively and producing inconsistent framing. Calculate bounds from orientation and container aspect ratio. | `src/components/SafeImage.tsx` | TODO |
| BUGA-005 | MEDIUM | The settings description says header page spacing is disabled by default while the stored default evaluates to enabled. Align default behavior and copy. | `src/lib/display-settings.ts`, `src/components/SettingsButton.tsx` | TODO |
| BUGA-006 | MEDIUM | Map markers can receive non-finite latitude or longitude values from persisted place data. Validate coordinates at the boundary and omit invalid markers with a visible diagnostic. | `src/components/MapClient.tsx`, `src/lib/db.ts` | TODO |
| BUGA-007 | MEDIUM | Stock marketplace parsing relies on an English presentation string for a provider-specific result. Parse structured source data instead of translated display text. | `src/lib/stock.ts` | TODO |
| BUGA-008 | LOW | Shelf fullscreen focus restoration runs against an initial mount path and can restore focus unexpectedly. Restore only after a real fullscreen close transition. | `src/components/ShelfSpatialFullscreen.tsx` | TODO |
