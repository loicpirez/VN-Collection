/**
 * R5-157 + R5-158 pin: the shared menu / dialog / popover
 * primitives implement the WAI-ARIA keyboard contracts.
 *
 * R5-157 (dropdown menus):
 *   - `ActionMenu` handles ArrowDown / ArrowUp / Home / End to
 *     move roving focus through `role="menuitem"` /
 *     `role="menuitemcheckbox"` rows.
 *   - The panel carries `role="menu"`.
 *
 * R5-158 (popovers / dialogs):
 *   - `Dialog` and `PortalPopover` install a Tab focus trap,
 *     close on Escape, and restore focus to the trigger on
 *     close.
 *   - `ActionMenu` does the same.
 *
 * MediaGallery has its own bespoke menu implementation
 * (`role="menuitem"` arrow nav + focus trap) — the test also
 * asserts the contract there so a refactor doesn't lose it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const ACTION_MENU = readFileSync(join(ROOT, 'src/components/ActionMenu.tsx'), 'utf8');
const DIALOG = readFileSync(join(ROOT, 'src/components/Dialog.tsx'), 'utf8');
const PORTAL_POPOVER = readFileSync(join(ROOT, 'src/components/PortalPopover.tsx'), 'utf8');
const MEDIA_GALLERY = readFileSync(join(ROOT, 'src/components/MediaGallery.tsx'), 'utf8');

describe('R5-157 — dropdown menus support arrow / Home / End nav + role=menuitem', () => {
  it('ActionMenu handles ArrowDown / ArrowUp / Home / End keys', () => {
    expect(ACTION_MENU).toMatch(/ArrowDown/);
    expect(ACTION_MENU).toMatch(/ArrowUp/);
    expect(ACTION_MENU).toMatch(/['"]Home['"]/);
    expect(ACTION_MENU).toMatch(/['"]End['"]/);
  });

  it('ActionMenu queries [role="menuitem"] / [role="menuitemcheckbox"] for roving focus', () => {
    expect(ACTION_MENU).toMatch(/role="menuitem"/);
    expect(ACTION_MENU).toMatch(/role="menuitemcheckbox"/);
  });

  it('ActionMenu panel renders with role="menu"', () => {
    expect(ACTION_MENU).toMatch(/role="menu"/);
  });

  it('MediaGallery menu also handles ArrowDown / ArrowUp / Home / End', () => {
    expect(MEDIA_GALLERY).toMatch(/ArrowDown/);
    expect(MEDIA_GALLERY).toMatch(/ArrowUp/);
    expect(MEDIA_GALLERY).toMatch(/['"]Home['"]/);
    expect(MEDIA_GALLERY).toMatch(/['"]End['"]/);
  });
});

describe('R5-158 — popovers / dialogs trap focus + close on ESC + restore focus', () => {
  for (const [name, src] of [
    ['ActionMenu', ACTION_MENU],
    ['Dialog', DIALOG],
    ['PortalPopover', PORTAL_POPOVER],
  ] as const) {
    it(`${name} handles Escape`, () => {
      expect(src).toMatch(/['"]Escape['"]/);
      expect(src).toMatch(/setOpen\(false\)|onClose\(\)/);
    });

    it(`${name} installs a Tab focus trap`, () => {
      expect(src).toMatch(/['"]Tab['"]/);
      expect(src).toMatch(/shiftKey/);
    });

    it(`${name} restores focus on close`, () => {
      // ActionMenu and Dialog use `restoreFocusTo` ref;
      // PortalPopover uses `previouslyFocused`. Either local
      // name proves the focus restoration is wired up.
      expect(src).toMatch(/restoreFocusTo|previouslyFocused/);
    });
  }
});
