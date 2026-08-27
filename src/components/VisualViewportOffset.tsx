'use client';

import { useEffect } from 'react';

const BOTTOM_OFFSET_PROPERTY = '--visual-viewport-bottom-offset';

type BottomViewportGeometry = Pick<VisualViewport, 'height' | 'offsetTop'>;

export function calculateVisualViewportBottomOffset(
  layoutViewportHeight: number,
  visualViewport: BottomViewportGeometry | null,
): number {
  if (!visualViewport) return 0;
  const offset = visualViewport.offsetTop + visualViewport.height - layoutViewportHeight;
  if (!Number.isFinite(offset)) return 0;
  return Math.round(offset * 100) / 100;
}

export function VisualViewportOffset() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame: number | null = null;

    const writeOffset = () => {
      frame = null;
      const offset = calculateVisualViewportBottomOffset(window.innerHeight, window.visualViewport);
      root.style.setProperty(BOTTOM_OFFSET_PROPERTY, `${offset}px`);
    };
    const scheduleOffset = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(writeOffset);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleOffset();
    };

    writeOffset();
    viewport?.addEventListener('resize', scheduleOffset);
    viewport?.addEventListener('scroll', scheduleOffset);
    window.addEventListener('resize', scheduleOffset);
    window.addEventListener('orientationchange', scheduleOffset);
    window.addEventListener('pageshow', scheduleOffset);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', scheduleOffset);
      viewport?.removeEventListener('scroll', scheduleOffset);
      window.removeEventListener('resize', scheduleOffset);
      window.removeEventListener('orientationchange', scheduleOffset);
      window.removeEventListener('pageshow', scheduleOffset);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      root.style.removeProperty(BOTTOM_OFFSET_PROPERTY);
    };
  }, []);

  return null;
}
