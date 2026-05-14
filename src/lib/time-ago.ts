import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * Tiered "X ago" formatter shared by every UI surface that shows the
 * age of a piece of data (refresh chip, game log, recent activity,
 * lists, …). Returns a localized string using the same i18n keys
 * across the app so wording stays consistent.
 *
 * Tiers (in order):
 *   < 1m  → "just now"
 *   < 1h  → "{n}m ago"
 *   < 1d  → "{n}h ago"
 *   < 7d  → "{n}d ago"
 *   < 30d → "{n}w ago"
 *   < 365d → "{n}mo ago"
 *   else  → "{n}y ago"
 *
 * Passing `now` is optional — defaults to Date.now(). Required as a
 * parameter so callers can stamp it with a tick-state and avoid SSR
 * hydration mismatches.
 */
export function timeAgo(
  ts: number | null | undefined,
  t: Dictionary,
  now: number = Date.now(),
): string {
  if (ts == null) return t.timeAgo.never;
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return t.timeAgo.justNow;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t.timeAgo.minutes.replace('{n}', String(min));
  const hr = Math.floor(diff / 3_600_000);
  if (hr < 24) return t.timeAgo.hours.replace('{n}', String(hr));
  const d = Math.floor(diff / 86_400_000);
  if (d < 7) return t.timeAgo.days.replace('{n}', String(d));
  const w = Math.floor(d / 7);
  if (d < 30) return t.timeAgo.weeks.replace('{n}', String(w));
  const mo = Math.floor(d / 30);
  if (d < 365) return t.timeAgo.months.replace('{n}', String(mo));
  const y = Math.floor(d / 365);
  return t.timeAgo.years.replace('{n}', String(y));
}
