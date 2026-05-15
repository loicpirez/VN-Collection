'use client';

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Required: every modal needs an aria-labelledby target. */
  title: ReactNode;
  /** Optional sub-heading rendered under the title. */
  description?: ReactNode;
  /** Extra classes on the panel itself (control width / padding). */
  panelClassName?: string;
  /** Hide the rendered title bar (still attached via aria-labelledby). */
  hideTitleVisually?: boolean;
  /** Disable the ESC-to-close handler — for confirmation flows. */
  disableEscape?: boolean;
  /** Disable backdrop click-to-close — same use case. */
  disableBackdropClose?: boolean;
  children: ReactNode;
}

/**
 * Shared accessible modal shell.
 *
 * Every consumer gets: ARIA role + modal + labelledby/describedby
 * wiring, ESC handling, backdrop click, body-scroll lock, and a tiny
 * focus trap that keeps Tab from escaping into the page underneath.
 * On open the first interactive element inside the panel receives
 * focus; on close, the previously-focused element is restored.
 *
 * Drop-in replacement pattern:
 *
 *   <Dialog open={open} onClose={close} title={t.foo.title}>
 *     ...panel body...
 *   </Dialog>
 *
 * For a custom title bar (icon + sub-actions), pass a node:
 *
 *   <Dialog title={<><Icon/> Heading</>}>
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  panelClassName,
  hideTitleVisually,
  disableEscape,
  disableBackdropClose,
  children,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  // Stash `onClose` in a ref so the effect doesn't re-run (and tear
  // down the focus trap) every time a parent recreates the closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Capture the active element BEFORE React commits the dialog tree
  // (in commit-time `useLayoutEffect`, not the post-paint `useEffect`)
  // so that even legacy Safari + Portal interleavings still see the
  // pre-open trigger as the focused element.
  useLayoutEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('inert'));

    // Move focus into the panel.
    const initial = focusables()[0] ?? panelRef.current;
    initial?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !disableEscape) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
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
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus to where it was before the dialog opened, so
      // keyboard users land back on the trigger button.
      restoreFocusTo.current?.focus({ preventScroll: true });
    };
  }, [open, disableEscape]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-bg/80 backdrop-blur"
        aria-hidden
        onClick={() => {
          if (!disableBackdropClose) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full max-w-2xl rounded-2xl border border-border bg-bg-card shadow-card outline-none ${
          panelClassName ?? 'p-4 sm:p-6'
        }`}
      >
        <h2
          id={titleId}
          className={hideTitleVisually ? 'sr-only' : 'mb-2 text-base font-bold sm:text-lg'}
        >
          {title}
        </h2>
        {description && (
          <p id={descId} className="mb-3 text-xs text-muted">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Hook variant for callers that don't want the full `<Dialog>` shell
 * (typically because their panel layout is too specific — image
 * lightbox, side sheet, etc.). The hook handles:
 *   • body-scroll lock while `open`
 *   • ESC-to-close (window keydown)
 *   • Tab focus trap inside the panel ref
 *   • initial focus shift into the panel
 *   • focus restore on close
 *
 * Caller is responsible for the `role="dialog"` + `aria-modal="true"`
 * + `aria-labelledby` attrs on its own panel.
 */
export function useDialogA11y({
  open,
  onClose,
  panelRef,
  disableEscape,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  disableEscape?: boolean;
}): void {
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  // Same trick as <Dialog> — keep the effect dependency list small
  // so an unstable `onClose` reference doesn't tear down the trap.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Commit-time capture so the eventual focus restoration always
  // returns to the trigger that was actually focused at the moment
  // the consumer flipped `open` to true.
  useLayoutEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('inert'));
    const initial = focusables()[0] ?? panelRef.current;
    initial?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !disableEscape) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
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
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocusTo.current?.focus({ preventScroll: true });
    };
  }, [open, panelRef, disableEscape]);
}
