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

let missingDictWarned = false;

/**
 * Format minutes into a short "Xh Ym" / "Xh" / "Ym" string. Pass `t` for
 * localised unit suffixes; pass `opts.fallback` for the empty-state string
 * and `emptyValue: 'allow_zero'` when `0` is a meaningful value (e.g. a
 * playtime of "started but not yet played").
 *
 * When `t` is omitted the function still produces output using English
 * `h`/`m` suffixes so production callers never crash, but a forgotten
 * dictionary is a localisation bug. To stop it passing unnoticed, the
 * first such call in a non-production build emits a single
 * `console.error`; production stays silent and non-crashing.
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
  if (!t && !missingDictWarned && process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
    missingDictWarned = true;
    console.error(
      '[formatMinutes] called without `t` — falling back to English h/m suffixes. Pass `t.year` for localised output to fix the missing localisation.',
    );
  }
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

/**
 * R5-145: consolidation of the duplicate `fmtMinutes(m, locale, t)`
 * helpers that lived in `/vn/[id]/page.tsx` and `/compare/page.tsx`.
 * Both expected the full dictionary object (where `t.year` carries the
 * `hoursUnit`/`minutesUnit` pair) and rendered `'—'` for the empty
 * state so the cell could be rendered unconditionally. Centralising
 * keeps the dash + fallback contract in one place.
 */
export function formatMinutesWithDash(
  m: number | null | undefined,
  locale: Locale,
  t: { year?: { hoursUnit: string; minutesUnit: string } } | undefined,
): string {
  return formatMinutes(m, locale, t?.year, { fallback: '—', emptyValue: 'strict_positive' });
}
