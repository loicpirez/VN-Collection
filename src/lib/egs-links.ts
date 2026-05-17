/**
 * Centralised URL helpers for every clickable EGS surface token.
 *
 * The surfaces (EgsPanel, EgsRichDetails, `/egs`, `/top-ranked?tab=egs`,
 * `/upcoming?tab=anticipated`) used to render developer / brand / platform /
 * language / year as plain text. This module pins the href shape per
 * token type so every surface produces the same URL for the same
 * semantic field.
 *
 * The helpers stay pure (no DB / no fetch) so they're cheap to call
 * from server and client components alike, and unit tests can assert
 * the exact strings without any runtime setup.
 */

/** Build a producer href that prefers the local VNDB-mapped page when
 *  the brand has a known VNDB id, falling back to a search by name. */
export function brandHref(vndbId: string | null | undefined, brandName: string | null | undefined): string | null {
  if (vndbId && /^p\d+$/i.test(vndbId)) return `/producer/${vndbId}`;
  if (brandName && brandName.trim()) return `/search?q=${encodeURIComponent(brandName.trim())}`;
  return null;
}

/** Search filter on a platform code (`win`, `psp`, …). */
export function platformHref(code: string | null | undefined): string | null {
  if (!code || !code.trim()) return null;
  return `/search?platforms=${encodeURIComponent(code.trim())}`;
}

/** Search filter on a language code (`ja`, `en`, …). */
export function languageHref(code: string | null | undefined): string | null {
  if (!code || !code.trim()) return null;
  return `/search?langs=${encodeURIComponent(code.trim())}`;
}

/**
 * Library filter on a year range. Accepts either a 4-digit year or a
 * date-like string (`YYYY-MM-DD`); silently returns null on garbage so
 * the chip stays as text instead of pointing nowhere.
 */
export function yearHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  const y = match[1];
  return `/?yearMin=${y}&yearMax=${y}`;
}

/** Local VN detail page when the EGS row carries a VNDB cross-link. */
export function vnHref(vndbId: string | null | undefined): string | null {
  if (!vndbId) return null;
  if (!/^v\d+$/i.test(vndbId)) return null;
  return `/vn/${vndbId.toLowerCase()}`;
}

/** External EGS game page URL — always absolute, opened in a new tab. */
export function egsExternalHref(egsId: number | string): string {
  return `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsId}`;
}
