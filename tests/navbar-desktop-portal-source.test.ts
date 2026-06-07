import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/MoreNavMenu.tsx', 'utf8');

describe('desktop grouped navigation portal', () => {
  it('renders desktop menus through the body portal above sticky-header stacking contexts', () => {
    expect(source).toContain('open && createPortal(');
    expect(source).toContain('document.body');
    expect(source).toContain('fixed z-[1100]');
  });

  it('clamps horizontal placement and recomputes it while the viewport moves', () => {
    expect(source).toContain('Math.min(rect.left, window.innerWidth - width - gutter)');
    expect(source).toContain("window.addEventListener('resize', updateMenuPosition)");
    expect(source).toContain("window.addEventListener('scroll', updateMenuPosition, true)");
  });

  it('flips a category menu above its trigger before introducing an internal scroller', () => {
    expect(source).toContain('const naturalHeight = items.length * 44 + 8');
    expect(source).toContain('const fitsBelow = belowTop + renderedHeight <= window.innerHeight - gutter');
    expect(source).toContain('top: fitsBelow ? belowTop : aboveTop');
    expect(source).toContain("overflowY: menuPosition.scrollable ? 'auto' : 'visible'");
    expect(source).not.toContain('w-56 overflow-y-auto');
  });

  it('keeps keyboard focus and outside-click handling bound to the portaled menu', () => {
    expect(source).toContain("menuRef.current?.querySelector<HTMLElement>('[role=\"menuitem\"]')");
    expect(source).toContain("menuRef.current!.querySelectorAll<HTMLElement>('[role=\"menuitem\"]')");
    expect(source).toContain('!menuRef.current?.contains(target)');
    expect(source).toContain('triggerRef.current?.focus({ preventScroll: true })');
  });
});
