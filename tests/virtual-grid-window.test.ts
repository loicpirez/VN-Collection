import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateVirtualGridWindow,
  parseCssPixelValue,
  VIRTUAL_GRID_THRESHOLD,
} from '@/lib/virtual-grid';

describe('virtual grid window calculation', () => {
  it('keeps small grids non-virtualized', () => {
    const windowState = calculateVirtualGridWindow({
      itemCount: VIRTUAL_GRID_THRESHOLD,
      width: 1000,
      scrollY: 0,
      viewportHeight: 800,
      containerTop: 0,
      densityPx: 220,
      densityMultiplier: 1,
      gapPx: 12,
    });
    expect(windowState.enabled).toBe(false);
    expect(windowState.startIndex).toBe(0);
    expect(windowState.endIndex).toBe(VIRTUAL_GRID_THRESHOLD);
  });

  it('returns a bounded visible slice with top and bottom spacers for large grids', () => {
    const windowState = calculateVirtualGridWindow({
      itemCount: 500,
      width: 1000,
      scrollY: 2400,
      viewportHeight: 800,
      containerTop: 200,
      densityPx: 220,
      densityMultiplier: 1,
      gapPx: 12,
      overscanRows: 1,
    });
    expect(windowState.enabled).toBe(true);
    expect(windowState.startIndex).toBeGreaterThan(0);
    expect(windowState.endIndex).toBeLessThan(500);
    expect(windowState.topSpacer).toBeGreaterThan(0);
    expect(windowState.bottomSpacer).toBeGreaterThan(0);
  });

  it('allows dense mode to fit more columns than comfortable mode', () => {
    const comfortable = calculateVirtualGridWindow({
      itemCount: 500,
      width: 1000,
      scrollY: 0,
      viewportHeight: 800,
      containerTop: 0,
      densityPx: 220,
      densityMultiplier: 1,
      gapPx: 12,
    });
    const dense = calculateVirtualGridWindow({
      itemCount: 500,
      width: 1000,
      scrollY: 0,
      viewportHeight: 800,
      containerTop: 0,
      densityPx: 220,
      densityMultiplier: 0.72,
      gapPx: 16,
    });
    expect(dense.columns).toBeGreaterThan(comfortable.columns);
  });

  it('parses CSS pixel values with a safe fallback', () => {
    expect(parseCssPixelValue('184px', 220)).toBe(184);
    expect(parseCssPixelValue('', 220)).toBe(220);
    expect(parseCssPixelValue('-10px', 220)).toBe(220);
  });
});

describe('LibraryClient virtual grid wiring', () => {
  const source = readFileSync(join(__dirname, '..', 'src/components/LibraryClient.tsx'), 'utf8');
  const gridBody = source.split('function Grid({')[1]?.split('\nconst MemoCard')[0] ?? '';

  it('renders only the computed item slice in the normal grid branch', () => {
    expect(gridBody).toContain('calculateVirtualGridWindow');
    expect(gridBody).toContain('items.slice(virtual.startIndex, virtual.endIndex)');
    expect(gridBody).toContain('renderedItems.map((it, i)');
    expect(gridBody).not.toContain('items.map((it, i)');
  });

  it('marks the live grid when virtualization is active for browser QA', () => {
    expect(gridBody).toContain('data-virtualized-library-grid');
    expect(gridBody).toContain('aria-rowcount');
  });
});
