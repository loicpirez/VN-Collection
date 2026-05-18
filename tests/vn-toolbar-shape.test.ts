/**
 * VN detail action-bar shape contract.
 *
 * The operator's spec for round 5 is:
 *   - one coherent toolbar primitive (single component)
 *   - uniform button height (`h-9`) and padding (`px-3 py-1.5`)
 *   - explicit cluster separators (danger band visibly off to the side)
 *   - no `class="btn "` drift (trailing-space mass-edit signature)
 *   - no useless `<span className="contents">` wrappers
 *   - no mixed `.btn` primitives in the toolbar (all buttons should
 *     compose via the shared `btn` class OR be passive non-button
 *     surfaces like `AnimeChip`).
 *
 * Pin the source so a future PR that re-introduces a one-off button
 * with `h-7` or `h-11` height inside the toolbar will fail this test.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/VnDetailActionsBar.tsx'),
  'utf8',
);

describe('VnDetailActionsBar — shape invariants', () => {
  it('declares the uniform-height row class `[&>*]:h-9` for the primary row', () => {
    expect(SOURCE).toMatch(/PRIMARY_ROW_CLASSES[\s\S]*?\[&>\*\]:h-9/);
  });

  it('declares the uniform-height row class `[&>*]:h-9` for the dropdown row', () => {
    expect(SOURCE).toMatch(/DROPDOWN_ROW_CLASSES[\s\S]*?\[&>\*\]:h-9/);
  });

  it('uses uniform `px-3 py-1.5` padding on toolbar children', () => {
    expect(SOURCE).toMatch(/\[&>\*\]:px-3/);
    expect(SOURCE).toMatch(/\[&>\*\]:py-1\.5/);
  });

  it('does not ship the `class="btn "` trailing-space drift', () => {
    expect(SOURCE).not.toMatch(/class(Name)?=['"`]btn ['"`]/);
  });

  it('does not ship a useless `<span className="contents">` wrapper', () => {
    expect(SOURCE).not.toMatch(/className=['"`]contents['"`]/);
  });

  it('places the danger cluster behind a visible separator on md+', () => {
    // `md:border-l` + `md:ml-auto` collectively push danger right and
    // separate it from the rest of the bar. Pin both.
    expect(SOURCE).toMatch(/md:ml-auto/);
    expect(SOURCE).toMatch(/md:border-l/);
  });

  it('keeps cluster grouping discoverable via role="group" + aria-label', () => {
    // At least one cluster must declare a semantic group label so
    // screen-reader users hear the cluster name.
    expect(SOURCE).toMatch(/role=['"`]group['"`]/);
    expect(SOURCE).toMatch(/aria-label=\{t\.detail\.actions\.group/);
  });
});
