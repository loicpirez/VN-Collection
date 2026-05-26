/**
 * Format minutes into a short "Xh Ym" / "Xh" / "Ym" string. Six
 * separate copies of this function existed across the components
 * (VnCard, EgsPanel, EgsSyncBlock, EgsRichDetails, /vn/[id],
 * /compare) with subtly different empty-state handling:
 *   • Some returned `null` for missing / non-positive values.
 *   • Others returned the literal "—" so the surrounding markup
 *     could render the cell unconditionally.
 *
 * One shared signature with a `fallback` option keeps every caller
 * happy and stops drift from creeping back.
 */
import type { Locale } from './i18n/dictionaries';
import { getDict } from './i18n/server'; // Note: Server-only helper, but we pass dictionaries.

/**
 * Format minutes into a short "Xh Ym" / "Xh" / "Ym" string. Pass `t` for
 * localised unit suffixes; pass `opts.fallback` for the empty-state string
 * and `emptyValue: 'allow_zero'` when `0` is a meaningful value (e.g. a
 * playtime of "started but not yet played").
 */
export function formatMinutes(
  m: number | null | undefined,
  locale?: Locale,
  t?: { hoursUnit: string; minutesUnit: string },
  opts: { fallback?: string | null; emptyValue?: 'allow_zero' | 'strict_positive' } = {},
): string {
  const fallback = opts.fallback ?? '';
  if (m == null) return fallback;
  if (opts.emptyValue !== 'allow_zero' && m <= 0) return fallback;
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const mn = total % 60;
  const hu = t?.hoursUnit ?? 'h';
  const mu = t?.minutesUnit ?? 'm';
  if (h && mn) return `${h}${hu} ${mn}${mu}`;
  if (h) return `${h}${hu}`;
  return `${mn}${mu}`;
}

/**
 * Variant of `formatMinutes` that returns `null` for empty/non-positive
 * inputs so callers can conditionally render the cell entirely.
 */
export function formatMinutesOrNull(
  m: number | null | undefined,
  locale?: Locale,
  t?: { hoursUnit: string; minutesUnit: string },
): string | null {
  const out = formatMinutes(m, locale, t, { emptyValue: 'strict_positive' });
  return out ? out : null;
}
