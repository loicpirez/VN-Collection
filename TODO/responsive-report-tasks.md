# Responsive audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| RESPA-001 | HIGH | Cover quick-action buttons are below the 44 px touch target requirement. Increase hit areas while keeping desktop density restrained. | `src/components/CoverQuickActions.tsx`, `tests/responsive-tap-targets.test.ts` | DONE_WITH_DIFF |
| RESPA-002 | HIGH | Hero image-adjust controls use compact targets that are difficult to operate on touch devices. Provide 44 px tap areas and responsive wrapping. | `src/components/HeroBanner.tsx`, `tests/responsive-tap-targets.test.ts` | DONE_WITH_DIFF |
| RESPA-003 | HIGH | Provider refresh controls can be hover-dependent and approximately 24 px tall, making them inaccessible on touch screens. Keep the action visible and enlarge its hit area. | `src/components/StockPanel.tsx`, `tests/responsive-tap-targets.test.ts` | DONE_WITH_DIFF |
| RESPA-004 | MEDIUM | Stock query controls use compact input heights below the touch target requirement. Increase mobile control height without inflating desktop rows. | `src/components/StockPanel.tsx`, `tests/responsive-tap-targets.test.ts` | DONE_WITH_DIFF |
| RESPA-005 | MEDIUM | Card-density controls hide text labels at narrow breakpoints, reducing clarity and parity. Preserve labels through wrapping, stacking, or an accessible menu. | `src/components/CardDensitySlider.tsx` | TODO |
| RESPA-006 | MEDIUM | Tutorial overlays can cover most of the useful mobile viewport. Constrain overlay size and position relative to the active target. | `src/components/TutorialTour.tsx`, `tests/tutorial-tour-a11y.test.ts` | DONE_WITH_DIFF |
| RESPA-007 | MEDIUM | Shelf fullscreen controls remain compact and crowded at narrow widths. Reflow actions and preserve minimum target sizes. | `src/components/ShelfSpatialFullscreen.tsx`, `src/components/ShelfLayoutEditor.tsx`, `tests/responsive-tap-targets.test.ts` | DONE_WITH_DIFF |
| RESPA-008 | LOW | Global page-space clipping can hide overflow symptoms rather than reveal the owning component. Remove blanket clipping where possible and fix local overflow boundaries. | `src/components/PageSpaceFrame.tsx` | TODO |
