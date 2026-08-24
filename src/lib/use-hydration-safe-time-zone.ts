'use client';

import { useEffect, useState } from 'react';
import type { Locale } from './i18n/dictionaries';
import { fmtDate } from './locale-number';

export type PreHydrationDateStyle = 'date' | 'time' | 'date-time';

/**
 * Return no timezone during SSR and the browser timezone after hydration.
 *
 * @returns The browser timezone after mount, otherwise `null`.
 */
export function useHydrationSafeTimeZone(): string | null {
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return timeZone;
}

/**
 * Format a date without relying on engine-specific Intl punctuation during
 * hydration, then use the requested locale and browser timezone after mount.
 *
 * @param date Date to format.
 * @param locale Active application locale.
 * @param options Intl options used after hydration.
 * @param timeZone Browser timezone, or `null` before hydration.
 * @param preHydrationStyle Stable UTC representation used before hydration.
 * @returns A deterministic pre-hydration label or localized browser label.
 */
export function formatHydrationSafeDate(
  date: Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
  timeZone: string | null,
  preHydrationStyle: PreHydrationDateStyle,
): string {
  if (timeZone != null) return fmtDate(date, locale, { ...options, timeZone });
  const iso = date.toISOString();
  if (preHydrationStyle === 'date') return iso.slice(0, 10);
  if (preHydrationStyle === 'time') return `${iso.slice(11, 16)} UTC`;
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
