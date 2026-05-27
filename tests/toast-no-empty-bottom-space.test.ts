/**
 * Pins the toast layout fix after operator feedback:
 *   "On saving something, the toast of success have big empty space
 *    at bottom of toast."
 *
 * Cause: the dismiss `<button>` used `min-h-[44px] min-w-[44px]` to
 * satisfy the WCAG-AA touch target. Inside a flex row with
 * `items-start`, the 44px button stretched the toast vertically
 * while the 16px icon + single-line text only occupied ~24px.
 *
 * Fix: use the `.tap-target` utility (invisible ±10px pseudo-element
 * hit-area) so the toast hugs its content, and flip alignment to
 * `items-center` so the icon and dismiss caret line up with the
 * text baseline.
 *
 * This static-source test ensures neither regression sneaks back in.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(__dirname, '..', 'src/components/ToastProvider.tsx'), 'utf8');

describe('ToastProvider — no empty-space-below regression', () => {
  it('toast row uses items-center, not items-start', () => {
    // We expect exactly one toast container element to opt into
    // items-center alignment. items-start would re-introduce the
    // empty space whenever the dismiss button is taller than the
    // first line of text.
    expect(SRC).toContain('items-center');
    // The container line:
    expect(SRC).toMatch(/items-center gap-2 rounded-lg/);
  });

  it('dismiss button does not pad the toast with min-h-[44px]', () => {
    // The button uses the `.tap-target` utility for hit-area
    // expansion (invisible pseudo-element) instead of bloating the
    // visible chrome with min-h/min-w. We scan the dismiss <button>
    // by anchoring on the unique aria-label and then walking
    // backwards through the opening tag (which contains className
    // and comments) and forward to the closing tag.
    const idx = SRC.indexOf('aria-label={t.common.dismiss}');
    expect(idx).toBeGreaterThan(0);
    const openIdx = SRC.lastIndexOf('<button', idx);
    const closeIdx = SRC.indexOf('</button>', idx);
    expect(openIdx).toBeGreaterThan(0);
    expect(closeIdx).toBeGreaterThan(openIdx);
    const block = SRC.slice(openIdx, closeIdx);
    expect(block).not.toMatch(/min-h-\[44px\]/);
    expect(block).not.toMatch(/min-w-\[44px\]/);
    expect(block).toContain('tap-target');
  });
});
