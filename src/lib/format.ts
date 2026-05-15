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
export function formatMinutes(
  m: number | null | undefined,
  opts: { fallback?: string | null; emptyValue?: 'allow_zero' | 'strict_positive' } = {},
): string {
  const fallback = opts.fallback ?? '';
  if (m == null) return fallback;
  // `strict_positive` (the default) treats <=0 as missing. `allow_zero`
  // lets `0` through as a real "0m" value. The previous two-branch form
  // was redundant — the second condition already subsumed the first.
  if (opts.emptyValue !== 'allow_zero' && m <= 0) return fallback;
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const mn = total % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

/**
 * `formatMinutes` variant that returns `null` instead of a string when
 * the value is missing/non-positive — handy for conditional render
 * blocks (`{fmtMinutesOrNull(m) && <span>{...}</span>}`). Replaces the
 * duplicated 3-line wrapper that lived in both `VnCard` and `EgsPanel`.
 */
export function formatMinutesOrNull(m: number | null | undefined): string | null {
  const out = formatMinutes(m, { emptyValue: 'strict_positive' });
  return out ? out : null;
}
