'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface ShelfScrollFrameProps {
  children: ReactNode;
}

interface ShelfScrollEdges {
  left: boolean;
  right: boolean;
}

/**
 * Horizontal scroll frame for read-only shelf rows.
 *
 * @param children Shelf row stack to place inside the scrollable viewport.
 * @returns A scrollable frame whose fades only render at real clipped edges.
 */
export function ShelfScrollFrame({ children }: ShelfScrollFrameProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ShelfScrollEdges>({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const next: ShelfScrollEdges = {
      left: el.scrollLeft > 1,
      right: maxScroll - el.scrollLeft > 1,
    };
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
      observer?.disconnect();
    };
  }, [updateEdges]);

  return (
    <div className="relative -mx-4 sm:-mx-6">
      <div
        ref={scrollRef}
        data-shelf-scroll-frame
        className="overflow-x-auto overscroll-x-contain px-4 pb-4 sm:px-6"
      >
        {children}
      </div>
      {edges.left && (
        <div
          data-shelf-scroll-fade="left"
          className="pointer-events-none absolute bottom-4 left-0 top-0 w-10 bg-gradient-to-r from-bg-card to-transparent"
          aria-hidden
        />
      )}
      {edges.right && (
        <div
          data-shelf-scroll-fade="right"
          className="pointer-events-none absolute bottom-4 right-0 top-0 w-10 bg-gradient-to-l from-bg-card to-transparent"
          aria-hidden
        />
      )}
    </div>
  );
}
