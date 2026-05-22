/**
 * VN detail action-bar shape contract.
 *
 * The operator's spec for round 5 is:
 *   - one coherent toolbar primitive (single component)
 *   - uniform button height (`h-9`) and padding (`px-3 py-1.5`)
 *   - plain row wrappers; size and padding live on the actual controls
 *   - no `class="btn "` drift (trailing-space mass-edit signature)
 *   - no useless `<span className="contents">` wrappers
 *   - no child-selector styling that accidentally targets menu wrappers
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
  it('pins the shared toolbar action button sizing contract', () => {
    expect(SOURCE).toMatch(
      /ACTION_BUTTON_CLASSES[\s\S]*?inline-flex h-9[\s\S]*?gap-1\.5[\s\S]*?px-3 py-1\.5[\s\S]*?text-xs/,
    );
  });

  it('keeps row wrappers free of child-selector sizing', () => {
    const primaryRowMatch = SOURCE.match(/const PRIMARY_ROW_CLASSES =\n\s+'([^']+)';/);

    expect(primaryRowMatch?.[1]).toBe('flex flex-wrap items-center gap-2');
    expect(primaryRowMatch?.[1]).not.toContain('[&>*]');
    expect(SOURCE).not.toMatch(/DROPDOWN_ROW_CLASSES/);
  });

  it('uses a single compact toolbar surface', () => {
    expect(SOURCE).toMatch(/rounded-xl border border-border\/70 bg-bg-elev\/25 p-2/);
  });

  it('does not ship the `class="btn "` trailing-space drift', () => {
    expect(SOURCE).not.toMatch(/class(Name)?=['"`]btn ['"`]/);
  });

  it('does not ship a useless `<span className="contents">` wrapper', () => {
    expect(SOURCE).not.toMatch(/className=['"`]contents['"`]/);
  });

  it('passes the shared action button class to dropdown triggers', () => {
    expect(SOURCE).toMatch(/triggerClassName=\{ACTION_BUTTON_CLASSES\}/);
  });

  it('keeps cluster grouping discoverable via role="group" + aria-label', () => {
    // At least one cluster must declare a semantic group label so
    // screen-reader users hear the cluster name.
    expect(SOURCE).toMatch(/role=['"`]group['"`]/);
    expect(SOURCE).toMatch(/aria-label=\{t\.detail\.actions\.group/);
  });
});
