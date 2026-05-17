/**
 * Pin that the custom-sort branch of `<LibraryClient>` (the
 * `<SortableGrid>` drag-reorder layout) consumes the same
 * `--card-density-px` CSS variable as the regular `<Grid>` branch.
 *
 * Regression context: the previous SortableGrid hard-coded
 * `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 …` so the operator's
 * density slider had no effect when `?sort=custom` was active. The
 * fix routes both branches through `minmax(min(100%,
 * var(--card-density-px, …)))`.
 *
 * The tests live as source-pins (vitest `environment: 'node'` so no
 * jsdom). Run-time correctness is exercised by browser QA against an
 * isolated server.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SORTABLE_GRID = readFileSync(
  join(__dirname, '..', 'src/components/SortableGrid.tsx'),
  'utf8',
);
const LIBRARY_CLIENT = readFileSync(
  join(__dirname, '..', 'src/components/LibraryClient.tsx'),
  'utf8',
);

describe('LibraryClient `?sort=custom` honours the density slider', () => {
  it('SortableGrid template uses var(--card-density-px, …)', () => {
    expect(SORTABLE_GRID).toMatch(/var\(--card-density-px/);
  });

  it('SortableGrid no longer hard-codes responsive column counts', () => {
    // The old broken pattern. Must NOT reappear.
    expect(SORTABLE_GRID).not.toMatch(/grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6/);
    expect(SORTABLE_GRID).not.toMatch(/grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4/);
  });

  it('SortableGrid keeps the dense=>0.72 multiplier so the Library density toggle still tightens columns', () => {
    expect(SORTABLE_GRID).toMatch(/\* \$\{dense \? 0\.72 : 1\}/);
  });

  it('LibraryClient itself still uses the same template token in the non-custom branch', () => {
    expect(LIBRARY_CLIENT).toMatch(/var\(--card-density-px, 220px\)/);
  });
});
