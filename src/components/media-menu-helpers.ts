/**
 * Sizing + collision constants for the per-tile kebab dropdown in
 * `<MediaGallery>`. Extracted into a standalone helper module so:
 *
 *   1. The component stays a client-only React file but the
 *      constants can be imported from a Vitest node-environment
 *      test without dragging in `next/navigation`, `useTransition`,
 *      `useT()`, etc.
 *   2. The contract values (`min-width: 12rem`, `max-width: 18rem`,
 *      flip when within 12rem of the viewport edge) live in one
 *      place — visible to both the renderer and the unit tests.
 *
 *   `MEDIA_MENU_MIN_WIDTH_REM`  — `min-width: 12rem`
 *   `MEDIA_MENU_MAX_WIDTH_REM`  — `max-width: 18rem`, prevents the
 *                                 menu from spanning a thin tile when
 *                                 a localised label is long.
 *   `MEDIA_MENU_FLIP_REM`       — when the trigger sits within 12rem
 *                                 of the right viewport edge, the
 *                                 menu opens to the left instead.
 */
export const MEDIA_MENU_MIN_WIDTH_REM = 12;
export const MEDIA_MENU_MAX_WIDTH_REM = 18;
export const MEDIA_MENU_FLIP_REM = 12;

/**
 * Pure helper: given the rect of the trigger and the viewport
 * width, decide whether the menu should open to the left (default
 * for a top-right kebab) or flip right when the trigger sits
 * within `MEDIA_MENU_FLIP_REM` of the right viewport edge.
 *
 * Splitting the helper out of the component keeps the contract
 * portable across renderers (e.g. a future popover refactor) and
 * makes the threshold testable without spinning up jsdom.
 */
export function decideMediaMenuHorizontal(
  triggerRight: number,
  viewportWidth: number,
  remToPx: number = 16,
): 'left' | 'right' {
  const spaceFromTriggerRightToEdge = viewportWidth - triggerRight;
  if (spaceFromTriggerRightToEdge < MEDIA_MENU_FLIP_REM * remToPx) return 'right';
  return 'left';
}
