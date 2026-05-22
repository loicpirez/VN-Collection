'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

/**
 * Horizontal scroll container that renders a right-edge fade overlay
 * only when there is content clipped beyond the right viewport edge.
 * The fade disappears once the user scrolls to the end, preventing
 * a misleading "there is more here" hint when nothing remains.
 *
 * Replaces the CSS-only `.scroll-fade-right` class on surfaces where
 * content may or may not overflow (e.g. `VaTimeline`, `ActivityHeatmap`).
 *
 * @param children  Content to place in the scrollable viewport.
 * @param className Extra classes forwarded to the scroll container (do
 *                  NOT include `overflow-x-auto` — the component sets it).
 * @param rest      Any other `<div>` props forwarded verbatim.
 */
export function ScrollFadeRight({
  children,
  className,
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setShowFade(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [update]);

  return (
    <div
      ref={ref}
      className={`relative overflow-x-auto${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
      {showFade && (
        <div
          className="pointer-events-none absolute bottom-0 right-0 top-0 w-8 bg-gradient-to-l from-[rgba(12,15,20,0.9)] to-transparent"
          aria-hidden
        />
      )}
    </div>
  );
}
