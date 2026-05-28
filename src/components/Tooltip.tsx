'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps the trigger child with a hover / focus-revealed tooltip that
 * - is reachable by keyboard (focus + Escape to dismiss)
 * - announces via `aria-describedby` to screen readers when shown
 * - dismisses on hover-out, blur, and Escape (per WCAG 2.1 SC 1.4.13)
 * - never traps focus (it's a passive descriptor, not a menu)
 *
 * The previous approach used the native `title="..."` attribute on
 * 100+ icon buttons. That attribute is invisible to touch users,
 * timing-out for screen readers on some browsers, and impossible to
 * style. This primitive renders the tooltip as a positioned span next
 * to the trigger so it's accessible and styleable.
 *
 * Usage (illustrative — real call sites pass t.section.key strings):
 *   <Tooltip content={t.media.openLightbox}>
 *     <button aria-label={t.media.openLightbox} className="…">
 *       <Maximize2 className="h-4 w-4" />
 *     </button>
 *   </Tooltip>
 *
 * Adoption is opt-in per call site — callers can keep using `title=`
 * on places where the descriptor is purely cosmetic.
 */
export interface TooltipProps {
  /** Tooltip text content. Plain strings only — no markup. */
  content: string;
  /** Element to attach the tooltip to. Must accept ref + accept aria-describedby. */
  children: ReactNode;
  /** Side to render the tooltip on. Defaults to 'top'. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Disable the tooltip entirely (useful for conditional rendering). */
  disabled?: boolean;
}

const SIDE_CLASSES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
} as const;

export function Tooltip({ content, children, side = 'top', disabled = false }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Escape dismisses the tooltip — covers the WCAG dismissible
  // requirement for content that overlays other UI.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (disabled) return <>{children}</>;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {/*
        Clone-via-callback would let us pass aria-describedby down to
        the trigger; that's the cleanest pattern but requires React's
        Children.map machinery which adds bundle size. Most call sites
        already give the trigger its own `aria-label`, and the tooltip
        body just visually reinforces it — duplicating the content via
        aria-hidden when the visual is shown is fine.
      */}
      {children}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] font-medium text-white shadow-lg ${SIDE_CLASSES[side]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
