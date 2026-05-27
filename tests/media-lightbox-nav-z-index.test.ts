/**
 * Regression pin: lightbox prev/next/close buttons must stack ABOVE the
 * displayed image on responsive viewports.
 *
 * Previously the nav buttons carried no z-index. Because the image
 * container is rendered AFTER the buttons in the JSX tree and sits at
 * `max-w-[92vw]` on mobile, the image painted on top of the buttons,
 * making them visually disappear once it finished loading
 * (operator-reported regression).
 *
 * The fix pins each button at `z-20` and the image container at `z-10`
 * so the nav controls are always reachable.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/MediaGallery.tsx'),
  'utf8',
);

describe('MediaGallery lightbox nav z-index', () => {
  /**
   * Find the visible nav button's className. We anchor on the unique
   * `e.stopPropagation()` calls inside each nav button's onClick handler
   * so the backdrop-button (which shares `aria-label={t.common.close}`
   * but only does `onClick={close}` without stopPropagation) cannot be
   * matched by accident.
   */
  function classNameNearMarker(marker: string): string {
    const idx = SOURCE.indexOf(marker);
    if (idx < 0) return '';
    // Only consider source BEFORE the marker — the button's className
    // declaration sits between `<button` and the onClick handler. Then
    // pick the LAST className in that slice so we don't grab the parent
    // dialog's className.
    const start = Math.max(0, idx - 600);
    const before = SOURCE.slice(start, idx);
    const matches = before.match(/className="([^"]+)"/g) ?? [];
    const last = matches[matches.length - 1] ?? '';
    const inner = last.match(/className="([^"]+)"/);
    return inner?.[1] ?? '';
  }

  it('close button stacks above the image (z-20)', () => {
    // The visible close button is the one that calls `close()` AFTER
    // `e.stopPropagation()`. The backdrop close button just does
    // `onClick={close}` without stopping propagation.
    const cls = classNameNearMarker('e.stopPropagation(); close();');
    expect(cls).toMatch(/\bz-20\b/);
  });

  it('prev / next buttons stack above the image (z-20)', () => {
    expect(classNameNearMarker('e.stopPropagation(); prev();')).toMatch(/\bz-20\b/);
    expect(classNameNearMarker('e.stopPropagation(); next();')).toMatch(/\bz-20\b/);
  });

  it('image container is explicitly at z-10 (below nav, above backdrop)', () => {
    // The image wrapper carries both `relative` and `z-10` so we can pin
    // it directly. Without z-10, the natural document-order stacking
    // covered the nav buttons.
    expect(SOURCE).toMatch(/className="relative z-10 max-h-\[90vh\] max-w-\[95vw\]"/);
  });

  it('nav buttons retain a backdrop-blur background so the image stays partially visible', () => {
    // `bg-bg-card/90` + `backdrop-blur-sm` make sure the nav controls are
    // legible against any image content while staying clickable.
    const cls = classNameNearMarker('e.stopPropagation(); close();');
    expect(cls).toMatch(/backdrop-blur-sm/);
    expect(cls).toMatch(/bg-bg-card\/90/);
  });

  it('nav buttons keep tap-target sizing on mobile (44×44 minimum)', () => {
    // `h-11 w-11` is 2.75rem = 44px, matching WCAG 2.5.5 minimum.
    const cls = classNameNearMarker('e.stopPropagation(); close();');
    expect(cls).toMatch(/\bh-11\b/);
    expect(cls).toMatch(/\bw-11\b/);
  });
});
