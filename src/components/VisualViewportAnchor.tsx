'use client';

import { useEffect } from 'react';

const SHIFT_PROPERTY = '--visual-viewport-anchor-shift';
const ANCHOR_SELECTOR = '[data-visual-viewport-anchor]';

type VisualViewportGeometry = Pick<VisualViewport, 'height' | 'offsetTop'>;

export function calculateVisualViewportAnchorShift(
  visualViewport: VisualViewportGeometry | null,
  renderedBottom: number,
  currentShift: number,
): number | null {
  if (!visualViewport) return 0;
  const visibleBottom = visualViewport.offsetTop + visualViewport.height;
  const unshiftedBottom = renderedBottom - currentShift;
  const shift = visibleBottom - unshiftedBottom;
  if (
    visualViewport.height <= 0 ||
    !Number.isFinite(visibleBottom) ||
    !Number.isFinite(unshiftedBottom) ||
    !Number.isFinite(shift)
  ) return null;
  return Math.round(shift * 100) / 100;
}

export function VisualViewportAnchor() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame: number | null = null;
    let currentShift = 0;

    const writeShift = () => {
      frame = null;
      const anchor = document.querySelector<HTMLElement>(ANCHOR_SELECTOR);
      if (!anchor) return;
      const nextShift = calculateVisualViewportAnchorShift(
        window.visualViewport,
        anchor.getBoundingClientRect().bottom,
        currentShift,
      );
      if (nextShift === null || nextShift === currentShift) return;
      currentShift = nextShift;
      root.style.setProperty(SHIFT_PROPERTY, `${nextShift}px`);
    };
    const scheduleShift = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(writeShift);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleShift();
    };

    writeShift();
    viewport?.addEventListener('resize', scheduleShift);
    viewport?.addEventListener('scroll', scheduleShift);
    window.addEventListener('resize', scheduleShift);
    window.addEventListener('scroll', scheduleShift, { passive: true });
    window.addEventListener('orientationchange', scheduleShift);
    window.addEventListener('pageshow', scheduleShift);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', scheduleShift);
      viewport?.removeEventListener('scroll', scheduleShift);
      window.removeEventListener('resize', scheduleShift);
      window.removeEventListener('scroll', scheduleShift);
      window.removeEventListener('orientationchange', scheduleShift);
      window.removeEventListener('pageshow', scheduleShift);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      root.style.removeProperty(SHIFT_PROPERTY);
    };
  }, []);

  return null;
}
