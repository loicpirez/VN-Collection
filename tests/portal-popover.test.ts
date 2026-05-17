/**
 * `<PortalPopover>` positioning contract.
 *
 * The live component depends on `react-dom`, `useLayoutEffect`, and
 * `document.body` — none of which are available in our default
 * node Vitest environment. We extract the positioning math into
 * `portal-popover-helpers.ts` and lock its contract here:
 *
 *   - Below + left-aligned by default.
 *   - Flips above when there's more room above the trigger.
 *   - Flips right-anchored when the panel would overflow the right
 *     viewport edge.
 *   - Clamps to viewport margins so the panel never lands off-screen.
 *   - Bottom-sheet fallback when the viewport is narrower than the
 *     mobile breakpoint.
 *   - z-index = 1200 so the portal always floats above the cards.
 */
import { describe, expect, it } from 'vitest';
import {
  computePortalPopoverPlacement,
  PORTAL_POPOVER_BOTTOM_SHEET_BP,
  PORTAL_POPOVER_BOTTOM_SHEET_VW,
  PORTAL_POPOVER_VIEWPORT_MARGIN,
  PORTAL_POPOVER_Z_INDEX,
  type Rect,
} from '@/components/portal-popover-helpers';

function makeRect(top: number, left: number, width = 100, height = 30): Rect {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
  };
}

describe('portal popover constants', () => {
  it('locks the public z-index + margin + breakpoint contract', () => {
    expect(PORTAL_POPOVER_Z_INDEX).toBe(1200);
    expect(PORTAL_POPOVER_VIEWPORT_MARGIN).toBe(8);
    expect(PORTAL_POPOVER_BOTTOM_SHEET_BP).toBe(640);
    expect(PORTAL_POPOVER_BOTTOM_SHEET_VW).toBe(80);
  });
});

describe('computePortalPopoverPlacement', () => {
  it('prefers below + right (panel left tracks trigger left) when there is room', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(200, 300),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(result.mode).toBe('anchored');
    if (result.mode === 'anchored') {
      expect(result.vertical).toBe('below');
      expect(result.horizontal).toBe('right');
      expect(result.top).toBe(200 + 30 + 8);
      expect(result.left).toBe(300);
    }
  });

  it('flips above when there is more room above than below', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(700, 300),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(result.mode).toBe('anchored');
    if (result.mode === 'anchored') {
      expect(result.vertical).toBe('above');
      // panelTop should be above the trigger, clamped to the viewport
      // top with at least the safety margin in play.
      expect(result.top).toBeLessThan(700);
      expect(result.top).toBeGreaterThanOrEqual(PORTAL_POPOVER_VIEWPORT_MARGIN);
    }
  });

  it('flips to right-anchored (panel right tracks trigger right) when the left-aligned layout would overflow', () => {
    const result = computePortalPopoverPlacement({
      // Trigger is at x=1100, width=100 → trigger right edge = 1200.
      // Panel is 250 wide → trigger.left (1100) + 250 = 1350 > 1280.
      triggerRect: makeRect(200, 1100, 100, 30),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(result.mode).toBe('anchored');
    if (result.mode === 'anchored') {
      expect(result.horizontal).toBe('left');
      // Panel's right edge tracks the trigger's right edge → panel
      // left = trigger.right - panelWidth.
      expect(result.left).toBe(1200 - 250);
    }
  });

  it('clamps the panel inside the viewport on the right edge', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(200, 1500, 100, 30),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(result.mode).toBe('anchored');
    if (result.mode === 'anchored') {
      // Even though the trigger is partially off-screen, the panel
      // must stay inside [margin, viewport - panelWidth - margin].
      expect(result.left).toBeGreaterThanOrEqual(PORTAL_POPOVER_VIEWPORT_MARGIN);
      expect(result.left + 250).toBeLessThanOrEqual(
        1280 - PORTAL_POPOVER_VIEWPORT_MARGIN,
      );
    }
  });

  it('clamps the panel below the top viewport edge when the trigger is partially off-screen', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(-100, 300, 100, 30),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(result.mode).toBe('anchored');
    if (result.mode === 'anchored') {
      expect(result.top).toBeGreaterThanOrEqual(PORTAL_POPOVER_VIEWPORT_MARGIN);
    }
  });

  it('falls back to bottom-sheet mode under the small-viewport breakpoint', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(200, 100),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 380,
      viewportHeight: 700,
    });
    expect(result.mode).toBe('bottom-sheet');
  });

  it('does not return bottom-sheet at the exact breakpoint width', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(200, 100),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: PORTAL_POPOVER_BOTTOM_SHEET_BP,
      viewportHeight: 700,
    });
    expect(result.mode).toBe('anchored');
  });

  it('honours a caller-supplied breakpoint override', () => {
    const result = computePortalPopoverPlacement({
      triggerRect: makeRect(200, 100),
      panelWidth: 250,
      panelHeight: 200,
      viewportWidth: 800,
      viewportHeight: 700,
      bottomSheetBreakpoint: 900,
    });
    expect(result.mode).toBe('bottom-sheet');
  });
});
