'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Generic dropdown wrapper used by the regrouped detail-page action
 * bar and the per-tile kebab in the media gallery. Behavior contract,
 * pulled together from <MoreNavMenu> and <EditionInfoPopover>:
 *
 *   - Trigger button toggles `aria-expanded` and exposes
 *     `aria-haspopup="menu"` so screen readers announce the role.
 *   - Outside-click closes (document mousedown).
 *   - Escape closes.
 *   - Tab/Shift+Tab off the last/first focusable element wraps inside
 *     the panel - a single keystroke can never trap the user in an
 *     invisible loop because the trigger itself is rendered alongside.
 *   - On open, focus shifts to the first focusable child so keyboard
 *     users land inside the panel without an extra Tab.
 *   - On close, focus returns to the trigger button.
 *   - Collision detection mirrors the EditionInfoPopover pattern: the
 *     panel measures itself against the trigger's bounding rect on
 *     `requestAnimationFrame`, then flips above / right when the
 *     viewport edge is too close. Until the first measurement
 *     completes the panel renders `invisible opacity-0` so the user
 *     never sees the mis-positioned frame.
 *   - Pointer events on the trigger and panel stop propagation so the
 *     menu can be reused inside drag surfaces without dragging the
 *     parent.
 *
 * The component intentionally renders the panel as a sibling of the
 * trigger inside an `inline-block` wrapper with `position: relative`
 * - anchoring to the wrapper rather than the button itself lets
 * consumers position the trigger absolutely (e.g. the media-tile
 * kebab in the top-right corner) without breaking the popover math.
 */
interface ActionMenuProps {
  /** Visible content for the trigger. */
  trigger: ReactNode;
  /**
   * Accessible name used for the trigger button and the menu panel.
   * Required because the trigger may be icon-only.
   */
  label: string;
  /** Optional tooltip / title attribute on the trigger. */
  title?: string;
  /** Extra classes on the trigger button. */
  triggerClassName?: string;
  /** Extra classes on the menu panel itself. */
  menuClassName?: string;
  /** Default placement; the popover still flips on collision. */
  defaultPlacement?: 'bottom-left' | 'bottom-right';
  /**
   * When true, the trigger does NOT render the default chevron caret.
   * Used by the per-tile kebab so the icon (e.g. MoreHorizontal) is
   * the only glyph inside the button.
   */
  hideChevron?: boolean;
  /** Panel body. Children are wrapped in a `role="menu"` container. */
  children: ReactNode;
}

export function ActionMenu({
  trigger,
  label,
  title,
  triggerClassName = 'btn',
  menuClassName = 'min-w-[14rem] rounded-lg border border-border bg-bg-card p-1 text-sm shadow-card',
  defaultPlacement = 'bottom-left',
  hideChevron = false,
  children,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    vertical: 'below' | 'above';
    horizontal: 'left' | 'right';
  }>({
    vertical: 'below',
    horizontal: defaultPlacement === 'bottom-right' ? 'right' : 'left',
  });
  const [placed, setPlaced] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const trigger = triggerRef.current!;
    const panel = panelRef.current!;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (!trigger.contains(target) && !panel.contains(target)) {
        setOpen(false);
      }
    }
    function focusables(): HTMLElement[] {
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('inert'));
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>(
            '[role="menuitem"], [role="menuitemcheckbox"]',
          ),
        ).filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0) return;
        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        const nextIndex = e.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : e.key === 'ArrowUp'
            ? (currentIndex - 1 + items.length) % items.length
            : e.key === 'Home'
              ? 0
              : items.length - 1;
        e.preventDefault();
        items[nextIndex]!.focus({ preventScroll: true });
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() => {
      focusables()[0]?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      const active = document.activeElement as HTMLElement | null;
      if (
        restoreFocusTo.current === triggerRef.current ||
        active === document.body
      ) {
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    const trigger = triggerRef.current!;
    const panel = panelRef.current!;
    const compute = () => {
      const rect = trigger.getBoundingClientRect();
      const popHeight = panel.offsetHeight;
      const popWidth = panel.offsetWidth;
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      const vertical: 'below' | 'above' =
        spaceBelow < popHeight + 12 && spaceAbove > spaceBelow ? 'above' : 'below';
      const spaceRight = viewportW - rect.left;
      const horizontal: 'left' | 'right' = spaceRight < popWidth + 12 ? 'right' : 'left';
      setPlacement({ vertical, horizontal });
      setPlaced(true);
    };
    const raf = requestAnimationFrame(compute);
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  function stop(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  return (
    <span className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={label}
        title={title ?? label}
        className={triggerClassName}
      >
        {trigger}
        {!hideChevron && <ChevronDown className="h-3 w-3" aria-hidden />}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onPointerDown={stop}
          className={`absolute z-40 ${
            placement.vertical === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${placement.horizontal === 'right' ? 'right-0' : 'left-0'} ${
            placed ? 'visible opacity-100' : 'invisible opacity-0'
          } ${menuClassName}`}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-menu-keep-open]')) return;
            if (target.closest('a, button')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
