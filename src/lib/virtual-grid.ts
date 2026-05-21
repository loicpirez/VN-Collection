export const VIRTUAL_GRID_THRESHOLD = 96;
export const VIRTUAL_GRID_OVERSCAN_ROWS = 3;
export const VIRTUAL_GRID_DEFAULT_WIDTH = 1200;
export const VIRTUAL_GRID_DEFAULT_VIEWPORT_HEIGHT = 900;
export const VIRTUAL_GRID_MIN_ROW_HEIGHT = 320;
export const VIRTUAL_GRID_CARD_CHROME_PX = 156;

/**
 * Measured state needed to calculate a virtual grid window.
 */
export interface VirtualGridInput {
  itemCount: number;
  width: number;
  scrollY: number;
  viewportHeight: number;
  containerTop: number;
  densityPx: number;
  densityMultiplier: number;
  gapPx: number;
  threshold?: number;
  overscanRows?: number;
}

/**
 * Render window and spacer geometry for a virtualized card grid.
 */
export interface VirtualGridWindow {
  enabled: boolean;
  columns: number;
  rowHeight: number;
  startIndex: number;
  endIndex: number;
  topSpacer: number;
  bottomSpacer: number;
  totalRows: number;
}

/**
 * Parses a CSS pixel token from `getComputedStyle`.
 *
 * @param value CSS value such as `220px`.
 * @param fallback Positive fallback when the token is absent or invalid.
 * @returns The parsed positive pixel value.
 */
export function parseCssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Computes the visible item slice for a responsive card grid.
 *
 * @param input Current grid measurements and item count.
 * @returns Window indexes plus spacer heights for a virtualized grid.
 */
export function calculateVirtualGridWindow(input: VirtualGridInput): VirtualGridWindow {
  const threshold = input.threshold ?? VIRTUAL_GRID_THRESHOLD;
  const width = input.width > 0 ? input.width : VIRTUAL_GRID_DEFAULT_WIDTH;
  const viewportHeight = input.viewportHeight > 0
    ? input.viewportHeight
    : VIRTUAL_GRID_DEFAULT_VIEWPORT_HEIGHT;
  const densityFloor = Math.max(1, input.densityPx * input.densityMultiplier);
  const gap = Math.max(0, input.gapPx);
  const columns = Math.max(1, Math.floor((width + gap) / (densityFloor + gap)));
  const columnWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const rowHeight = Math.ceil(Math.max(
    VIRTUAL_GRID_MIN_ROW_HEIGHT,
    columnWidth * 1.5 + VIRTUAL_GRID_CARD_CHROME_PX,
  ));
  const totalRows = Math.ceil(input.itemCount / columns);

  if (input.itemCount <= threshold || totalRows <= 1) {
    return {
      enabled: false,
      columns,
      rowHeight,
      startIndex: 0,
      endIndex: input.itemCount,
      topSpacer: 0,
      bottomSpacer: 0,
      totalRows,
    };
  }

  const overscanRows = input.overscanRows ?? VIRTUAL_GRID_OVERSCAN_ROWS;
  const viewportTop = Math.max(0, input.scrollY - input.containerTop);
  const viewportBottom = Math.max(viewportTop, input.scrollY + viewportHeight - input.containerTop);
  const startRow = Math.max(0, Math.floor(viewportTop / rowHeight) - overscanRows);
  const endRow = Math.min(totalRows, Math.ceil(viewportBottom / rowHeight) + overscanRows);
  const normalizedEndRow = Math.max(startRow + 1, endRow);

  return {
    enabled: true,
    columns,
    rowHeight,
    startIndex: Math.min(input.itemCount, startRow * columns),
    endIndex: Math.min(input.itemCount, normalizedEndRow * columns),
    topSpacer: startRow * rowHeight,
    bottomSpacer: Math.max(0, (totalRows - normalizedEndRow) * rowHeight),
    totalRows,
  };
}
