/**
 * Static source-lint contract tests for VnCard, ConfirmDialog, and
 * ActionMenu. RTL is not installed in this repo, so rather than
 * mounting components we read the TSX source as a string and assert
 * on the structural patterns that ARE the contract.
 *
 * When a gating expression or ARIA attribute changes, the assertion
 * that pins it changes too — forcing the author to acknowledge the
 * shift rather than letting a silent refactor break the contract.
 *
 * See `tests/vn-detail-collection-gating.test.ts` for the canonical
 * example of this approach.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

const vnCard = readFileSync(join(root, 'src/components/VnCard.tsx'), 'utf8');
const confirmDialog = readFileSync(join(root, 'src/components/ConfirmDialog.tsx'), 'utf8');
const actionMenu = readFileSync(join(root, 'src/components/ActionMenu.tsx'), 'utf8');

describe('VnCard contracts', () => {
  it('cover image routes through SafeImage, not a bare <img> (security contract)', () => {
    expect(vnCard).toMatch(/<SafeImage/);
    expect(vnCard).not.toMatch(/<img\s/);
  });

  it('rating display is gated — only rendered when rating is non-null (correctness contract)', () => {
    expect(vnCard).toMatch(/\{rating &&/);
    expect(vnCard).not.toMatch(/\{ratingNum &&/);
  });

  it('FavoriteToggleButton receives inCollection prop derived from status or inCollectionBadge (data-integrity contract)', () => {
    expect(vnCard).toMatch(/inCollection=\{!!\(data\.status \|\| data\.inCollectionBadge\)\}/);
  });

  it('FavoriteToggleButton is conditionally rendered based on status / inCollectionBadge / favorite (data-integrity contract)', () => {
    expect(vnCard).toMatch(/data\.status \|\| data\.inCollectionBadge \|\| data\.favorite/);
  });

  it('FavoriteToggleButton component is imported and used (accessibility contract via its own aria-label)', () => {
    expect(vnCard).toMatch(/import.*FavoriteToggleButton.*from/);
    expect(vnCard).toMatch(/<FavoriteToggleButton/);
  });
});

describe('ConfirmDialog contracts', () => {
  it('has role="dialog" (ARIA contract)', () => {
    expect(confirmDialog).toMatch(/role="dialog"/);
  });

  it('has aria-modal="true" (ARIA contract)', () => {
    expect(confirmDialog).toMatch(/aria-modal="true"/);
  });

  it('has a Tab keydown handler for focus trap (keyboard a11y contract)', () => {
    expect(confirmDialog).toMatch(/e\.key === 'Tab' && dialogRef\.current/);
    expect(confirmDialog).toMatch(/e\.shiftKey && document\.activeElement === first/);
  });

  it('has previouslyFocused focus-restore pattern (a11y contract)', () => {
    expect(confirmDialog).toMatch(/previouslyFocused/);
    expect(confirmDialog).toMatch(/previouslyFocused\.current\.focus\(\)/);
  });

  it('confirm button is disabled when requireTyping text does not match (requireTyping gate contract)', () => {
    expect(confirmDialog).toMatch(/disabled=\{!typingOk\}/);
    expect(confirmDialog).toMatch(/const typingOk = !needsTyping \|\| typed === entry\.requireTyping/);
  });

  it('requireTyping renders a verify input gated on needsTyping (requireTyping contract)', () => {
    expect(confirmDialog).toMatch(/needsTyping && \(/);
    expect(confirmDialog).toMatch(/entry\.requireTyping/);
  });
});

describe('ActionMenu contracts', () => {
  it('has role="menu" on the dropdown panel (ARIA contract)', () => {
    expect(actionMenu).toMatch(/role="menu"/);
  });

  it('closes panel on button/link click UNLESS data-menu-keep-open is present (keepMenuOpen contract)', () => {
    expect(actionMenu).toMatch(/\[data-menu-keep-open\]/);
    expect(actionMenu).toMatch(/closest\('\[data-menu-keep-open\]'\)/);
    expect(actionMenu).toMatch(/setOpen\(false\)/);
  });

  it('the data-menu-keep-open check runs before the close-on-item-click logic (ordering contract)', () => {
    const keepIdx = actionMenu.indexOf("closest('[data-menu-keep-open]')");
    const closeOnClickIdx = actionMenu.indexOf("closest('a, button')) setOpen(false)");
    expect(keepIdx).toBeGreaterThan(-1);
    expect(closeOnClickIdx).toBeGreaterThan(-1);
    expect(keepIdx).toBeLessThan(closeOnClickIdx);
  });

  it('defaultPlacement prop controls horizontal CSS class (layout contract)', () => {
    expect(actionMenu).toMatch(/defaultPlacement === 'bottom-right' \? 'right' : 'left'/);
    expect(actionMenu).toMatch(/placement\.horizontal === 'right' \? 'right-0' : 'left-0'/);
  });
});
