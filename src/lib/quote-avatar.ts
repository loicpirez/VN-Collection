/**
 * Helpers for rendering a small avatar next to a quote.
 *
 * Fallback chain (top-of-list wins):
 *   1. Local character portrait (via `character_image.local_path` JOIN,
 *      or the nested VNDB shape `character.image.local_path`).
 *   2. Local VN cover thumb / cover image (via `vn.local_image_thumb`
 *      or `vn.local_image`, or the nested VNDB shape
 *      `vn.image.url` / `vn.image_thumb` as a remote URL).
 *   3. `null` — consumer renders a `<UserCircle>` lucide fallback.
 *
 * The chain exists because not every quote has a character row (some
 * VNs only ship narrator quotes), and even when they do the local
 * portrait may not be downloaded yet. Falling back to the VN cover
 * keeps the row visually anchored without showing the generic icon.
 *
 * Pure, side-effect free, no React imports — safe for server, client,
 * and node-environment Vitest tests.
 */

/**
 * Minimal shape of a quote row carried through the various rendering
 * surfaces. Accepts either the flat columns produced by SQL JOINs
 * (`listAllQuotes`, `getRandomLocalQuote`) or the nested object shape
 * used by the VNDB quote endpoint.
 */
export interface QuoteAvatarSource {
  character_id?: string | null;
  character_local_image?: string | null;
  character?: {
    id: string;
    image?: { local_path?: string | null } | null;
  } | null;
  /**
   * Local VN cover thumbnail, surfaced by JOIN against `vn.local_image_thumb`.
   * Used as a richer fallback when no character portrait is available.
   */
  vn_local_image_thumb?: string | null;
  /** Full-size local cover; tried after the thumb. */
  vn_local_image?: string | null;
  /** Remote VN cover URL; used when no local mirror is present. */
  vn_image_url?: string | null;
  /** Nested VNDB-shaped VN payload (random-quote endpoint). */
  vn?: {
    id?: string;
    title?: string;
    image_url?: string | null;
    image_thumb?: string | null;
    local_image?: string | null;
    local_image_thumb?: string | null;
  } | null;
}

/** Discriminated result of the resolution chain. */
export type QuoteAvatarResolution =
  | { kind: 'character'; src: string }
  | { kind: 'vnCover'; src: string }
  | { kind: 'none'; src: null };

function fileSrc(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  return `/api/files/${localPath}`;
}

function vnCoverFor(quote: QuoteAvatarSource): string | null {
  // Prefer the cheaper SQL flat columns first.
  const flatLocalThumb = quote.vn_local_image_thumb ?? quote.vn?.local_image_thumb ?? null;
  if (flatLocalThumb) return fileSrc(flatLocalThumb);
  const flatLocalFull = quote.vn_local_image ?? quote.vn?.local_image ?? null;
  if (flatLocalFull) return fileSrc(flatLocalFull);
  // Remote URL fallbacks — `image_thumb` is the smaller crop when VNDB
  // exposes it, otherwise the full `image_url`.
  const remoteThumb = quote.vn?.image_thumb ?? null;
  if (remoteThumb) return remoteThumb;
  const remoteFull = quote.vn_image_url ?? quote.vn?.image_url ?? null;
  if (remoteFull) return remoteFull;
  return null;
}

/**
 * Resolve the avatar `src` for a given quote, or return `null` when
 * neither a character portrait nor a VN cover is available.
 *
 * Returns a string the consumer can drop straight into an `<img src>`
 * attribute (either `/api/files/<rel>` for local mirrors or a raw URL
 * for the remote VNDB cover fallback).
 */
export function quoteAvatarSrc(quote: QuoteAvatarSource | null | undefined): string | null {
  return resolveQuoteAvatar(quote).src;
}

/**
 * Full resolution — exposes both the chosen source AND which tier of
 * the fallback chain produced it. The `QuoteAvatar` component uses
 * `kind` to switch frame sizing (covers are 2:3, characters are 1:1).
 */
export function resolveQuoteAvatar(
  quote: QuoteAvatarSource | null | undefined,
): QuoteAvatarResolution {
  if (!quote) return { kind: 'none', src: null };
  // Tier 1 — character portrait. Requires both a character id and a
  // downloaded local_path; the flat SQL column wins over the nested
  // copy when both are present (the JOIN is authoritative).
  const charId = quote.character_id ?? quote.character?.id ?? null;
  if (charId) {
    const localPath =
      quote.character_local_image ?? quote.character?.image?.local_path ?? null;
    const src = fileSrc(localPath);
    if (src) return { kind: 'character', src };
  }
  // Tier 2 — VN cover. Any of the local-thumb / local-full / remote
  // URL columns is enough to render a cover at 2:3.
  const coverSrc = vnCoverFor(quote);
  if (coverSrc) return { kind: 'vnCover', src: coverSrc };
  return { kind: 'none', src: null };
}

/**
 * Resolve the navigation href for the character. Returns `null` when
 * the character id is missing — callers should render the name as
 * plain text in that case.
 *
 * Centralised here (not inlined at the call sites) so the path format
 * is identical across every surface and the unit test below pins it.
 */
export function quoteCharacterHref(quote: QuoteAvatarSource | null | undefined): string | null {
  if (!quote) return null;
  const id = quote.character_id ?? quote.character?.id ?? null;
  if (!id) return null;
  return `/character/${id}`;
}
