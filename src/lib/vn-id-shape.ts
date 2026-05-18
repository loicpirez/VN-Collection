/**
 * Client-safe VN identifier shape helpers. NO `server-only` and
 * NO `next/server` imports — this module is imported from both
 * server routes AND client components (URL parsers in the
 * SeriesAddVnForm picker, SelectiveFullDownload, UpcomingCard,
 * AnimeChip, CoverQuickActions, etc.).
 *
 * The `validateVnIdOr400` wrapper that constructs a `NextResponse`
 * lives in `./vn-id` (server-only). Everything else lives here
 * and is re-exported from `./vn-id` for backwards compatibility.
 */

/**
 * Canonical VN identifier shape. Accepts:
 *   - VNDB ids: `v\d+` (`v90017`, `v25634`)
 *   - Synthetic EGS-only ids: `egs_\d+` (`egs_12345`)
 *
 * Used by every `/api/*` dynamic route that takes a VN id, so a
 * garbage path component fails fast with a 400 before any DB lookup.
 */
export const VN_ID_RE = /^(v\d+|egs_\d+)$/i;

export function isValidVnId(id: string | null | undefined): id is string {
  return typeof id === 'string' && VN_ID_RE.test(id);
}

/**
 * R5-120 — strict VNDB-only variant. Use in API routes that talk
 * directly to VNDB (link-vndb, vndb-status, series link, etc.)
 * where a synthetic `egs_*` id has no upstream record to operate
 * on. Splitting from `VN_ID_RE` keeps the EGS-id surfaces
 * separate so a one-letter copy-paste can't widen the contract
 * silently.
 */
export const VNDB_VN_ID_RE = /^v\d+$/i;

export function isVndbVnId(id: string | null | undefined): id is string {
  return typeof id === 'string' && VNDB_VN_ID_RE.test(id);
}
