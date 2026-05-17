/**
 * Pure positioning helpers for `<PortalPopover>`. Extracted so the
 * collision logic is testable in a node-only Vitest environment
 * — the component itself depends on `react-dom/createPortal` and
 * `useLayoutEffect`, both of which require jsdom.
 *
 *   `PORTAL_POPOVER_Z_INDEX`            — Stacks above cards, hero
 *                                          banner, sticky toolbars.
 *   `PORTAL_POPOVER_VIEWPORT_MARGIN`    — Keep the panel this many
 *                                          pixels away from every
 *                                          viewport edge so it never
 *                                          looks glued to the chrome.
 *   `PORTAL_POPOVER_BOTTOM_SHEET_BP`    — Viewport widths strictly
 *                                          below this (px) render
 *                                          the panel as a bottom
 *                                          sheet anchored to the
 *                                          bottom of the screen.
 *   `PORTAL_POPOVER_BOTTOM_SHEET_VW`    — Bottom-sheet maximum
 *                                          height as a percentage
 *                                          of the viewport height.
 */
export const PORTAL_POPOVER_Z_INDEX = 1200;
export const PORTAL_POPOVER_VIEWPORT_MARGIN = 8;
export const PORTAL_POPOVER_BOTTOM_SHEET_BP = 640;
export const PORTAL_POPOVER_BOTTOM_SHEET_VW = 80;

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface PortalPopoverPlacementInput {
  triggerRect: Rect;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  /**
   * Optional small-viewport breakpoint override. Tests pass a
   * specific value; live code reads the module constant.
   */
  bottomSheetBreakpoint?: number;
}

export type PortalPopoverPlacement =
  | { mode: 'anchored'; top: number; left: number; vertical: 'below' | 'above'; horizontal: 'right' | 'left' }
  | { mode: 'bottom-sheet' };

/**
 * Compute where to render the panel for a given trigger rect. Pure
 * — no DOM reads, no globals, no side effects.
 *
 * The algorithm:
 *
 *   1. Viewport narrower than the small-screen breakpoint → render
 *      as a bottom sheet, regardless of the trigger position.
 *   2. Otherwise prefer below + aligned to the trigger's left edge.
 *      Flip above when there's more vertical room above the trigger;
 *      flip to right-anchored when the panel would overflow the
 *      right viewport edge with the panel's left aligned to the
 *      trigger's left edge.
 *   3. Clamp the final top/left so the panel never lands outside
 *      the viewport — even when the trigger itself is partially
 *      off-screen (e.g. a `position: fixed` element).
 */
export function computePortalPopoverPlacement({
  triggerRect,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  margin = PORTAL_POPOVER_VIEWPORT_MARGIN,
  bottomSheetBreakpoint = PORTAL_POPOVER_BOTTOM_SHEET_BP,
}: PortalPopoverPlacementInput): PortalPopoverPlacement {
  if (viewportWidth < bottomSheetBreakpoint) {
    return { mode: 'bottom-sheet' };
  }
  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const vertical: 'below' | 'above' =
    spaceBelow < panelHeight + margin && spaceAbove > spaceBelow ? 'above' : 'below';
  // Default: panel's left edge tracks the trigger's left edge. Flip
  // to right-anchored when that would overflow the right viewport
  // edge.
  const wouldOverflowRight =
    triggerRect.left + panelWidth + margin > viewportWidth;
  const horizontal: 'right' | 'left' = wouldOverflowRight ? 'left' : 'right';
  const rawTop =
    vertical === 'below' ? triggerRect.bottom + margin : triggerRect.top - panelHeight - margin;
  const rawLeft =
    horizontal === 'right' ? triggerRect.left : triggerRect.right - panelWidth;
  const top = clamp(rawTop, margin, Math.max(margin, viewportHeight - panelHeight - margin));
  const left = clamp(rawLeft, margin, Math.max(margin, viewportWidth - panelWidth - margin));
  return { mode: 'anchored', top, left, vertical, horizontal };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
