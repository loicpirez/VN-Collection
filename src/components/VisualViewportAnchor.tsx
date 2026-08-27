'use client';

import { useEffect } from 'react';

const SHIFT_PROPERTY = '--visual-viewport-anchor-shift';
const ANCHOR_SELECTOR = '[data-visual-viewport-anchor]';
const SETTLE_DELAYS_MS = [120, 360] as const;

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
    const anchor = document.querySelector<HTMLElement>(ANCHOR_SELECTOR);
    if (!anchor) return;
    if (getComputedStyle(anchor).position !== 'fixed') {
      anchor.dataset.visualViewportMode = 'flow';
      root.style.removeProperty(SHIFT_PROPERTY);
      return () => {
        delete anchor.dataset.visualViewportMode;
      };
    }
    const viewport = window.visualViewport;
    let primaryFrame: number | null = null;
    let settleFrame: number | null = null;
    let settleTimers: number[] = [];
    let currentShift = 0;
    let resizeObserver: ResizeObserver | null = null;

    const writePosition = () => {
      anchor.dataset.visualViewportMode = 'fixed';
      const nextShift = calculateVisualViewportAnchorShift(
        window.visualViewport,
        anchor.getBoundingClientRect().bottom,
        currentShift,
      );
      if (nextShift === null || nextShift === currentShift) return;
      currentShift = nextShift;
      root.style.setProperty(SHIFT_PROPERTY, `${nextShift}px`);
    };
    const cancelScheduled = () => {
      if (primaryFrame !== null) window.cancelAnimationFrame(primaryFrame);
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
      for (const timer of settleTimers) window.clearTimeout(timer);
      primaryFrame = null;
      settleFrame = null;
      settleTimers = [];
    };
    const scheduleSettledFrame = () => {
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
      settleFrame = window.requestAnimationFrame(() => {
        settleFrame = null;
        writePosition();
      });
    };
    const scheduleShift = () => {
      cancelScheduled();
      primaryFrame = window.requestAnimationFrame(() => {
        primaryFrame = null;
        writePosition();
        scheduleSettledFrame();
      });
      settleTimers = SETTLE_DELAYS_MS.map((delay) => window.setTimeout(scheduleSettledFrame, delay));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleShift();
    };

    writePosition();
    scheduleShift();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleShift);
      resizeObserver.observe(anchor);
    }
    viewport?.addEventListener('resize', scheduleShift);
    viewport?.addEventListener('scroll', scheduleShift);
    viewport?.addEventListener('scrollend', scheduleShift);
    window.addEventListener('resize', scheduleShift);
    window.addEventListener('scroll', scheduleShift, { passive: true });
    window.addEventListener('scrollend', scheduleShift);
    window.addEventListener('orientationchange', scheduleShift);
    window.addEventListener('pageshow', scheduleShift);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelScheduled();
      viewport?.removeEventListener('resize', scheduleShift);
      viewport?.removeEventListener('scroll', scheduleShift);
      viewport?.removeEventListener('scrollend', scheduleShift);
      window.removeEventListener('resize', scheduleShift);
      window.removeEventListener('scroll', scheduleShift);
      window.removeEventListener('scrollend', scheduleShift);
      window.removeEventListener('orientationchange', scheduleShift);
      window.removeEventListener('pageshow', scheduleShift);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver?.disconnect();
      delete anchor.dataset.visualViewportMode;
      root.style.removeProperty(SHIFT_PROPERTY);
    };
  }, []);

  return null;
}
