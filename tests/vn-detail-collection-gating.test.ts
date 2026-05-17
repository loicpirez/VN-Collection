/**
 * Static contract test for the action-bar gating decisions in
 * `<VnDetailActionsBar>`. RTL is not wired in the repo, so instead
 * of mounting the component we lint the source string itself for
 * the conditional patterns that ARE the contract:
 *
 *   - Collection-only clusters (`media`, `dangerous`, the favorite /
 *     queue primaries) gate on `inCollection`.
 *   - Data / Mapping clusters do NOT gate on `inCollection` — they
 *     gate on `isEgsOnly` or render unconditionally.
 *
 * This is a brittle-by-design lint: when the gating expression
 * changes, the assertion that pinned it changes too, which forces
 * the author to acknowledge the shift. The alternative — every
 * future refactor silently flipping the gate — is precisely the
 * regression manual QA flagged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const bar = readFileSync(
  join(root, 'src/components/VnDetailActionsBar.tsx'),
  'utf8',
);

function line(marker: string): string {
  const idx = bar.indexOf(marker);
  expect(idx, `expected marker not found: ${marker}`).toBeGreaterThan(-1);
  // Return the surrounding ~120 chars so the assertion message is
  // readable when the regex below misses.
  return bar.slice(Math.max(0, idx - 8), idx + 120);
}

describe('VnDetailActionsBar gating contract', () => {
  it('Media cluster gates on inCollection', () => {
    expect(line('const media = ')).toMatch(/const media = inCollection \?/);
  });

  it('Destructive cluster gates on inCollection', () => {
    expect(line('const dangerous = ')).toMatch(/const dangerous = inCollection \?/);
  });

  it('Data cluster does NOT gate on inCollection (gates on !isEgsOnly)', () => {
    expect(line('const data = ')).toMatch(/const data = !isEgsOnly \?/);
    // Defensive — ensure the previous-state pattern is gone.
    expect(bar).not.toMatch(/const data = inCollection \?/);
  });

  it('Mapping cluster renders unconditionally', () => {
    // Mapping is built without a ternary — it's always present in
    // the linear cluster list. The block opens with a bare const
    // assignment to an `<ActionMenu>`.
    expect(line('const mapping = ')).toMatch(/const mapping = \(\s*<ActionMenu/);
  });

  it('External cluster gates on the showExternalMenu computed flag, not on inCollection', () => {
    expect(line('const external = ')).toMatch(
      /const external = showExternalMenu \?/,
    );
  });
});

describe('assets route gating contract', () => {
  it('no longer rejects when getCollectionItem returns null', () => {
    const route = readFileSync(
      join(root, 'src/app/api/collection/[id]/assets/route.ts'),
      'utf8',
    );
    // The "not in collection" early return must be gone — the route
    // now operates on the `vn` table (per-VN cache). The string
    // appears once in `vn-data-management.test.ts`'s docblock; this
    // assertion only inspects the route source.
    expect(route).not.toMatch(/if \(!getCollectionItem\(id\)\) return NextResponse\.json\(\{ error: 'not in collection' \}/);
    // The replacement check: existence in `vn` (with VNDB fall-back).
    expect(route).toMatch(/SELECT id FROM vn WHERE id = \?/);
  });
});

describe('NotInCollectionBanner exists with the expected CTA', () => {
  it('exports a function and POSTs to /api/collection/<id>', () => {
    const banner = readFileSync(
      join(root, 'src/components/NotInCollectionBanner.tsx'),
      'utf8',
    );
    expect(banner).toMatch(/export function NotInCollectionBanner/);
    expect(banner).toMatch(/\/api\/collection\/\$\{vnId\}/);
  });
});
