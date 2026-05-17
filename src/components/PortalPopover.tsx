'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  computePortalPopoverPlacement,
  PORTAL_POPOVER_BOTTOM_SHEET_VW,
  PORTAL_POPOVER_VIEWPORT_MARGIN,
  PORTAL_POPOVER_Z_INDEX,
} from './portal-popover-helpers';

/**
 * Anchored popover that escapes its parent's `overflow-hidden` cell
 * by rendering through `createPortal(content, document.body)`. The
 * trigger and the panel keep their semantic relationship via
 * `aria-controls` / `aria-expanded`, but the DOM tree puts the panel
 * directly under `<body>` so card-grid clipping is impossible.
 *
 * Card-level overlays (`<ListsPickerButton>` "Add to list", favourite
 * hover, status quick actions) used to render inline inside the
 * `.card { overflow: hidden }` wrapper — every dropdown that grew
 * taller than the cover area got clipped at the bottom edge of its
 * VN card. This component is the canonical fix; every card-level
 * overlay should route through it.
 *
 * Contract:
 *
 *   - Renders the panel via portal at `z-index: 1200` so it always
 *     floats above cards / hero banner / sticky toolbars.
 *   - Collision-aware viewport flip: prefers below+right, falls back
 *     to above / left when the trigger is close to a viewport edge.
 *     The horizontal axis flips when the trigger sits within the
 *     panel's measured width of the right edge; the vertical axis
 *     flips when there's more room above than below.
 *   - Outside-click closes (mousedown on document, ignoring clicks
 *     inside the panel or on the trigger).
 *   - Escape closes and returns focus to the trigger.
 *   - Focus trap: Tab / Shift+Tab cycle through focusable children
 *     of the panel; the first focusable element receives focus on
 *     open. On close, focus restores to the trigger.
 *   - Mobile fallback: when the viewport is narrower than 640px the
 *     panel renders as a bottom sheet (full width, anchored to the
 *     bottom of the viewport) rather than an anchored popover, so
 *     the user always sees the whole panel above the on-screen
 *     keyboard / browser chrome.
 */
interface PortalPopoverProps {
  /** Whether the popover is currently visible. */
  open: boolean;
  /** Called when the popover wants to close (outside-click / Escape). */
  onClose: () => void;
  /** Ref to the element the panel is anchored to (usually the trigger button). */
  triggerRef: RefObject<HTMLElement | null>;
  /** Accessible label for the panel — used as the `aria-label`. */
  label: string;
  /** Optional fixed DOM id for the panel so triggers can wire `aria-controls`. */
  panelId?: string;
  /**
   * Extra classes for the panel chrome. The component supplies the
   * positioning + z-index style inline; classes here typically cover
   * background / border / padding.
   */
  panelClassName?: string;
  /** Panel body. */
  children: ReactNode;
}

export function PortalPopover({
  open,
  onClose,
  triggerRef,
  label,
  panelId,
  panelClassName = 'rounded-lg border border-border bg-bg-card p-2 text-sm shadow-card',
  children,
}: PortalPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: -9999,
    zIndex: PORTAL_POPOVER_Z_INDEX,
    visibility: 'hidden',
  });

  // SSR guard — `createPortal(…, document.body)` can only run after
  // the first browser render. The panel is hidden offscreen until the
  // post-mount measure runs so users never see the un-placed frame.
  useEffect(() => setMounted(true), []);

  const reposition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const triggerRect = trigger.getBoundingClientRect();
    const placement = computePortalPopoverPlacement({
      triggerRect: {
        top: triggerRect.top,
        bottom: triggerRect.bottom,
        left: triggerRect.left,
        right: triggerRect.right,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: PORTAL_POPOVER_VIEWPORT_MARGIN,
    });
    if (placement.mode === 'bottom-sheet') {
      setStyle({
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100vw',
        maxHeight: `${PORTAL_POPOVER_BOTTOM_SHEET_VW}vh`,
        zIndex: PORTAL_POPOVER_Z_INDEX,
        visibility: 'visible',
      });
      return;
    }
    setStyle({
      position: 'fixed',
      top: placement.top,
      left: placement.left,
      zIndex: PORTAL_POPOVER_Z_INDEX,
      visibility: 'visible',
    });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    // Measure on the next frame so the panel children have settled.
    const raf =
      typeof window === 'undefined'
        ? 0
        : window.requestAnimationFrame(() => reposition());
    return () => {
      if (typeof window !== 'undefined') window.cancelAnimationFrame(raf);
    };
  }, [open, reposition, children]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    const onScroll = () => reposition();
    const onResize = () => reposition();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onResize);
    };
  }, [open, reposition]);

  // Outside-click closes the panel. We listen on document.mousedown
  // (matching <ActionMenu> + <ListsPickerButton> conventions) so the
  // close fires before any internal click handler steals the event.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, triggerRef]);

  // Escape + Tab focus trap. The trap cycles focus through the panel
  // so keyboard users can't accidentally tab back out into the card
  // grid while the popover is open.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function focusables(): HTMLElement[] {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('inert'));
    }
    // Land focus inside the panel on next frame (after measure).
    const raf = window.requestAnimationFrame(() => {
      const first = focusables()[0];
      first?.focus({ preventScroll: true });
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(raf);
      // Return focus to whatever owned it before the popover opened
      // — usually the trigger. Use `preventScroll` so a long card
      // grid doesn't jump while focus restores.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  const portalTarget = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return document.body;
  }, []);

  if (!open) return null;
  if (!mounted || !portalTarget) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      id={panelId}
      style={style}
      className={panelClassName}
    >
      {children}
    </div>,
    portalTarget,
  );
}
