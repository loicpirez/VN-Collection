'use client';

import { useCallback, useEffect, useState, type RefCallback } from 'react';
import { observeIntersectionOnce } from './intersection-observer-pool';

interface NearViewportState<T extends HTMLElement> {
  ref: RefCallback<T>;
  active: boolean;
}

/**
 * Activate network-backed content once its host approaches the viewport.
 * Browsers without IntersectionObserver activate immediately, preserving the
 * complete section instead of leaving a permanent placeholder.
 *
 * @param rootMargin Distance ahead of the viewport at which activation starts.
 * @returns A host ref and a sticky activation flag.
 */
export function useNearViewport<T extends HTMLElement>(
  rootMargin = '600px 0px',
): NearViewportState<T> {
  const [element, setElement] = useState<T | null>(null);
  const [active, setActive] = useState(false);
  const ref = useCallback((node: T | null) => setElement(node), []);

  useEffect(() => {
    if (active) return;
    if (!element) return;
    return observeIntersectionOnce(
      element,
      () => setActive(true),
      { rootMargin, threshold: 0.01 },
    );
  }, [active, element, rootMargin]);

  return { ref, active };
}
