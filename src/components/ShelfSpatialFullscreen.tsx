'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface FullscreenLabels {
  enterFullscreen: string;
  exitFullscreen: string;
}

/**
 * Client wrapper that adds a fullscreen toggle to the read-only
 * spatial shelf view. The server renders the shelf grids; this
 * component only owns the fullscreen overlay state.
 *
 * - Fullscreen uses `fixed inset-0 z-50` + `body { overflow: hidden }`
 *   so the underlying page can't scroll behind the overlay.
 * - `Escape` exits. The toggle button is also focusable.
 * - Focus is restored to the originating button when fullscreen
 *   closes.
 * - Keyboard nav between shelves: `ArrowLeft`/`ArrowRight` move the
 *   currently-focused shelf's anchor into view (`Element.scrollIntoView`).
 *   The shelf sections are siblings in document order so simple
 *   sibling traversal works.
 */
export function ShelfSpatialFullscreen({
  children,
  labels,
}: {
  children: ReactNode;
  labels: FullscreenLabels;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Body-scroll lock + scroll-position restore.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // Escape exits + focus returns to the trigger button.
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFullscreen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [fullscreen]);

  // Keyboard arrow nav: scroll the next/previous shelf section into
  // view. Operates on the container's <section> children which are
  // the per-shelf blocks rendered by ShelfSpatialView.
  const navigate = useCallback((direction: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    const sections = Array.from(container.querySelectorAll('section[aria-labelledby^="shelf-"]'));
    if (sections.length === 0) return;
    // Find the section currently nearest the viewport top.
    const viewportTop = fullscreen ? 0 : (window.scrollY || 0);
    let active = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sections.length; i++) {
      const rect = (sections[i] as HTMLElement).getBoundingClientRect();
      const top = fullscreen ? rect.top : rect.top + window.scrollY;
      const dist = Math.abs(top - viewportTop);
      if (dist < bestDist) {
        bestDist = dist;
        active = i;
      }
    }
    const target = sections[active + direction];
    if (!target) return;
    (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        navigate(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        navigate(-1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, navigate]);

  const shellClass = fullscreen
    ? 'fixed inset-0 z-50 overflow-auto bg-bg p-3 sm:p-6'
    : 'relative';

  return (
    <div ref={containerRef} className={shellClass}>
      <div className="mb-2 flex justify-end">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? labels.exitFullscreen : labels.enterFullscreen}
          title={fullscreen ? labels.exitFullscreen : labels.enterFullscreen}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          {fullscreen ? (
            <Minimize2 className="h-3 w-3" aria-hidden />
          ) : (
            <Maximize2 className="h-3 w-3" aria-hidden />
          )}
          <span>{fullscreen ? labels.exitFullscreen : labels.enterFullscreen}</span>
        </button>
      </div>
      {children}
    </div>
  );
}
