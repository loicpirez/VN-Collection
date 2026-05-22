/**
 * Source-lint contracts for VaTimeline. RTL is not wired in this repo,
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
const src = readFileSync(join(root, 'src/components/VaTimeline.tsx'), 'utf8');

describe('VaTimeline contracts', () => {
  it('delegates scrolling to ScrollFadeRight, not a bare scroll div (delegation contract)', () => {
    expect(src).toMatch(/ScrollFadeRight/);
  });

  it('does not apply the legacy scroll-fade-right CSS class directly (migration contract)', () => {
    expect(src).not.toMatch(/scroll-fade-right/);
  });

  it('scrollable region carries role="img" (ARIA landmark contract)', () => {
    expect(src).toMatch(/role="img"/);
  });

  it('scrollable region carries aria-label (accessible name contract)', () => {
    expect(src).toMatch(/aria-label/);
  });
});
