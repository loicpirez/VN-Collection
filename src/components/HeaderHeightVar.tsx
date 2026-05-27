'use client';
import { useEffect } from 'react';

/**
 * Audit R-124: measure the sticky header's height once on mount + on
 * resize, and expose it as the `--header-height` CSS variable on
 * `<html>`. Any sticky / fixed element that needs to clear the header
 * can use `top: var(--header-height, 64px)` instead of guessing a
 * hard-coded value that breaks at the French locale's wider header.
 *
 * The fallback `64px` matches the desktop default; the JS measurement
 * is mostly there to (a) honour the wider FR / JA copy, (b) handle
 * the wrap-to-second-line case on small viewports, and (c) account
 * for the safe-area-inset-top padding on devices with a notch.
 */
export function HeaderHeightVar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const headerEl = document.querySelector('header[aria-label]') as HTMLElement | null;
    if (!headerEl) return;
    const root = document.documentElement;

    function publish() {
      if (!headerEl) return;
      const h = Math.round(headerEl.getBoundingClientRect().height);
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
    ro.observe(headerEl);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
    };
  }, []);

  return null;
}
