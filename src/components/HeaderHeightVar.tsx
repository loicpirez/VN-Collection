'use client';
import { useEffect } from 'react';

/**
 * Measures the sticky header's height on mount and on resize, exposing it as
 * the `--header-height` CSS variable on `<html>`. Sticky/fixed elements use
 * `top: var(--header-height, 64px)` instead of a hard-coded value that breaks
 * when the FR/JA header copy is wider or wraps on small viewports.
  */
export function HeaderHeightVar() {
  useEffect(() => {
    const headerEl = document.querySelector('header[aria-label]') as HTMLElement | null;
    if (!headerEl) return;
    const header = headerEl;
    const root = document.documentElement;

    function publish() {
      const h = Math.round(header.getBoundingClientRect().height);
      if (h > 0) {
        root.style.setProperty('--header-height', `${h}px`);
      }
    }

    publish();

    // ResizeObserver fires for both content reflow (FR/JA copy wrap)
    // and font-size changes. The window.resize listener covers cases
    // where the browser chrome (mobile address bar) changes the
    // viewport without resizing the header itself.
    const ro = new ResizeObserver(publish);
    ro.observe(header);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
    };
  }, []);

  return null;
}
