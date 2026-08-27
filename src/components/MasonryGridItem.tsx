'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

export const MASONRY_ROW_UNIT_PX = 1;

/**
 * Converts a measured item height into the number of fallback grid rows it occupies.
 *
 * @param height Measured item height in CSS pixels.
 * @returns A positive implicit-grid row span.
 */
export function calculateMasonryRowSpan(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 1;
  return Math.max(1, Math.ceil(height / MASONRY_ROW_UNIT_PX));
}

interface MasonryGridItemProps {
  children: ReactNode;
  gap: number;
  position: number;
  setSize: number;
}

/**
 * Measures one natural-height card for the CSS Grid fallback used when Grid Lanes is unavailable.
 *
 * @param props Card content, grid gap, and accessible list position.
 * @returns A list item that participates in the packed card grid.
 */
export function MasonryGridItem({ children, gap, position, setSize }: MasonryGridItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const item = itemRef.current!;
    const measure = () => {
      const span = calculateMasonryRowSpan(item.getBoundingClientRect().height);
      const next = `span ${span}`;
      if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(item);
    return () => observer.disconnect();
  }, [gap]);

  return (
    <div
      ref={itemRef}
      role="listitem"
      aria-posinset={position}
      aria-setsize={setSize}
      className="library-card-lane-item min-w-0"
      data-masonry-grid-item
      style={{ paddingBottom: gap }}
    >
      {children}
    </div>
  );
}
