/**
 * Source-lint contracts for ScrollFadeRight. RTL is not wired in this repo,
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
const src = readFileSync(join(root, 'src/components/ScrollFadeRight.tsx'), 'utf8');

describe('ScrollFadeRight contracts', () => {
  it('container carries the relative class (stacking context for the overlay)', () => {
    expect(src).toMatch(/relative/);
  });

  it('container carries overflow-x-auto (horizontal scroll contract)', () => {
    expect(src).toMatch(/overflow-x-auto/);
  });

  it('fade overlay div has aria-hidden (accessibility contract — decorative)', () => {
    expect(src).toMatch(/aria-hidden/);
  });

  it('uses ResizeObserver to track container size changes', () => {
    expect(src).toMatch(/ResizeObserver/);
  });

  it('update callback is memoised with useCallback (stable reference for effect deps)', () => {
    expect(src).toMatch(/useCallback/);
  });
});
