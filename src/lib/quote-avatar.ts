/**
 * Helpers for rendering a small character avatar next to a quote.
 *
 * Quote rows carry an optional `character_id` (VNDB cNNNN). When a
 * downloaded character image is available we surface it as a 32×32
 * round avatar; otherwise the consumer is expected to render a
 * `<UserCircle>` lucide icon as the fallback.
 *
 * Pure, side-effect free, no React imports — safe for server, client,
 * and node-environment Vitest tests.
 */

/**
 * Minimal shape of a quote row carried through the various rendering
 * surfaces. We accept either `character_local_image` (the column name
 * used by `listAllQuotes` after the LEFT JOIN) or `character.image`
 * (a nested object, used by the VNDB-shaped quote payload).
 */
export interface QuoteAvatarSource {
  character_id?: string | null;
  character_local_image?: string | null;
  character?: {
    id: string;
    image?: { local_path?: string | null } | null;
  } | null;
}

/**
 * Resolve the avatar `src` for a given quote, or return `null` when
 * either the character id is missing OR no local image has been
 * downloaded for that character. Returns a public path served by
 * `/api/files/<rel>` so consumers can drop it straight into an
 * `<img src>` / `<SafeImage src>` attribute.
 *
 * The function is intentionally tolerant of both flat and nested
 * shapes so it can serve as a single source of truth for QuotesSection
 * (nested VNDB quote), QuoteFooter (random quote with optional
 * `character_local_image` echo from the API), and `/quotes` (flat
 * `QuoteWithVn` rows joined against `character_image`).
 */
export function quoteAvatarSrc(quote: QuoteAvatarSource | null | undefined): string | null {
  if (!quote) return null;
  const id = quote.character_id ?? quote.character?.id ?? null;
  if (!id) return null;
  // Look at every candidate field — flat first (it's the cheaper SQL
  // join path), then nested (used by the VNDB-shaped payloads).
  const localPath =
    quote.character_local_image ?? quote.character?.image?.local_path ?? null;
  if (!localPath) return null;
  return `/api/files/${localPath}`;
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
