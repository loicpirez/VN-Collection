'use client';
import { useEffect } from 'react';
import { clampCardDensity, useDisplaySettings } from '@/lib/settings/client';

/**
 * Mirrors the user's `cardDensityPx` preference into a CSS custom property
 * on the document root. Server-rendered grids reference
 * `var(--card-density-px, 220px)` so they don't need to be client
 * components themselves — the value is reactive on the document side.
 *
 * Mount once in the root layout. No DOM output.
 */
export function CardDensityVarSetter() {
  const { settings } = useDisplaySettings();
  useEffect(() => {
    const value = clampCardDensity(settings.cardDensityPx);
    document.documentElement.style.setProperty('--card-density-px', `${value}px`);
  }, [settings.cardDensityPx]);
  return null;
}
