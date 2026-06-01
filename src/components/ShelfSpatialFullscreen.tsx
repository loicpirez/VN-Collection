'use client';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useDialogA11y } from './Dialog';

interface FullscreenLabels {
  enterFullscreen: string;
  exitFullscreen: string;
}


/**
 * Client wrapper that adds a fullscreen toggle to the read-only
 * spatial shelf view. The server renders the shelf grid; this
 * component only owns the fullscreen overlay state and keyboard
 * navigation between shelves.
 *
 * - Fullscreen uses `fixed inset-0 z-50` + `body { overflow: hidden }`
 *   so the underlying page can't scroll behind the overlay.
 * - `Escape` exits. The toggle button is also focusable.
 * - Focus is restored to the originating button when fullscreen
 *   closes.
 * - The spatial view now renders ONE shelf at a time and the page
 *   carries the active shelf in `?shelf=N`. ArrowLeft/Right (and
 *   ArrowUp/Down or PageUp/PageDown) navigate the router to the
 *   adjacent shelf URL, keeping the carousel buttons and the
 *   keyboard in sync.
 * - The keyboard handler is bound while fullscreen is open and
 *   ALSO while the container has focus-within in normal mode, so
 *   a desktop user holding focus can flip shelves quickly.
 */
export function ShelfSpatialFullscreen({
  children,
  labels,
  prevHref,
  nextHref,
  controlsSlot,
}: {
  children: ReactNode;
  labels: FullscreenLabels;
  prevHref: string | null;
  nextHref: string | null;
  /**
   * Shelf display options control to render next to the fullscreen
   * button. Only visible inside the overlay so the user can adjust
   * sizing/fit/orientation without having to exit fullscreen.
   */
  controlsSlot?: ReactNode;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenTitleId = useId();
  const router = useRouter();
  const closeFullscreen = useCallback(() => setFullscreen(false), []);

  useDialogA11y({ open: fullscreen, onClose: closeFullscreen, panelRef: containerRef });

  // Keyboard arrow nav: route to the prev/next shelf URL. The page
  // re-renders with the new active shelf (URL-driven state). Both
  // horizontal and vertical arrows work since the user may instinctively
  // press either when scanning shelves.
  const navigate = useCallback((direction: 1 | -1) => {
    const target = direction === 1 ? nextHref : prevHref;
    if (target) router.push(target);
  }, [nextHref, prevHref, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const container = containerRef.current;
      if (!fullscreen && container && !container.contains(document.activeElement)) return;
      // While typing in an input / textarea, leave the keys alone.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        navigate(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
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
    <div
      ref={containerRef}
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen ? 'true' : undefined}
      aria-labelledby={fullscreen ? fullscreenTitleId : undefined}
      className={shellClass}
      tabIndex={-1}
    >
      {fullscreen && <h2 id={fullscreenTitleId} className="sr-only">{labels.exitFullscreen}</h2>}
      <div className="mb-2 flex items-center justify-end gap-2">
        {fullscreen && controlsSlot}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? labels.exitFullscreen : labels.enterFullscreen}
          title={fullscreen ? labels.exitFullscreen : labels.enterFullscreen}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
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
