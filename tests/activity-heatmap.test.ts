/**
 * Source-lint contracts for ActivityHeatmap. RTL is not wired in this repo,
 * so we read the TSX source as a string and assert on the structural patterns
 * that form the public contract.
 *
 * See `tests/component-contracts.test.ts` for the canonical example of this
 * approach.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const src = readFileSync(join(root, 'src/components/ActivityHeatmap.tsx'), 'utf8');

describe('ActivityHeatmap contracts', () => {
  it('delegates scrolling to ScrollFadeRight (delegation contract)', () => {
    expect(src).toMatch(/ScrollFadeRight/);
  });

  it('does not apply the legacy scroll-fade-right CSS class directly (migration contract)', () => {
    expect(src).not.toMatch(/scroll-fade-right/);
  });
});
