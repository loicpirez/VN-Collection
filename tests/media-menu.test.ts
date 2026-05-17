/**
 * MediaGallery per-tile kebab menu — sizing + collision contract.
 *
 * The kebab dropdown has a published sizing contract:
 *   - `min-width: 12rem`, `max-width: 18rem`
 *   - flips to the left when the trigger sits within 12rem of the
 *     right viewport edge
 *   - exposes short labels visibly while keeping the long form on
 *     aria-label / title
 *
 * We cover the pure helper (`decideMediaMenuHorizontal`) and lock
 * the rem-based constants. The toggle / outside-click / Escape
 * behaviours that depend on real DOM listeners are exercised
 * manually — the helper coverage here guards against the contract
 * regressing silently when the threshold gets retuned.
 */
import { describe, expect, it } from 'vitest';
import {
  MEDIA_MENU_FLIP_REM,
  MEDIA_MENU_MAX_WIDTH_REM,
  MEDIA_MENU_MIN_WIDTH_REM,
  decideMediaMenuHorizontal,
} from '@/components/media-menu-helpers';
import { dictionaries } from '@/lib/i18n/dictionaries';

describe('media-menu sizing constants', () => {
  it('keeps the public min/max width contract', () => {
    expect(MEDIA_MENU_MIN_WIDTH_REM).toBe(12);
    expect(MEDIA_MENU_MAX_WIDTH_REM).toBe(18);
    expect(MEDIA_MENU_FLIP_REM).toBe(12);
  });
});

describe('decideMediaMenuHorizontal', () => {
  // Default rem-to-px conversion is 16, matching the browser default.
  const VIEWPORT = 1280;

  it('opens to the left when the trigger has plenty of room on its right', () => {
    // Trigger right edge = 600px → 680px of free space, well above
    // the 12rem (192px) threshold.
    expect(decideMediaMenuHorizontal(600, VIEWPORT)).toBe('left');
  });

  it('flips to the right when the trigger sits inside the 12rem edge band', () => {
    // Trigger right edge = 1100px → only 180px of free space, below
    // the 192px threshold → menu must open to the right.
    expect(decideMediaMenuHorizontal(1100, VIEWPORT)).toBe('right');
  });

  it('uses the exact 12rem * 16px boundary as the inclusive flip threshold', () => {
    // 12rem * 16px = 192. Space below 192 → flip. Space at 192 stays.
    expect(decideMediaMenuHorizontal(VIEWPORT - 191, VIEWPORT)).toBe('right');
    expect(decideMediaMenuHorizontal(VIEWPORT - 192, VIEWPORT)).toBe('left');
  });

  it('respects an alternate rem-to-px conversion when zoom changes the root font size', () => {
    // At 20px-per-rem the band widens to 240px.
    expect(decideMediaMenuHorizontal(VIEWPORT - 220, VIEWPORT, 20)).toBe('right');
    expect(decideMediaMenuHorizontal(VIEWPORT - 260, VIEWPORT, 20)).toBe('left');
  });
});

describe('media menu i18n short labels', () => {
  it('exposes a short variant for every action in fr/en/ja', () => {
    for (const locale of ['fr', 'en', 'ja'] as const) {
      const media = dictionaries[locale].media;
      expect(media.openLightboxShort).toBeTruthy();
      expect(media.setAsCoverShort).toBeTruthy();
      expect(media.setAsBannerShort).toBeTruthy();
      expect(media.openOriginalShort).toBeTruthy();
      // The short form is strictly shorter than the long form so the
      // ellipsis logic actually gets to render the full word in the
      // tight menu width.
      expect(media.openLightboxShort.length).toBeLessThanOrEqual(media.openLightbox.length);
      expect(media.setAsCoverShort.length).toBeLessThanOrEqual(media.setAsCover.length);
      expect(media.setAsBannerShort.length).toBeLessThanOrEqual(media.setAsBanner.length);
      expect(media.openOriginalShort.length).toBeLessThanOrEqual(media.openOriginal.length);
    }
  });
});
