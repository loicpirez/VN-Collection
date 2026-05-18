/**
 * R5-124 — `safeHref` is the client-safe URL-rendering gate for the
 * `href` attribute of `<a>` tags built from data the user can
 * influence (VNDB extlinks, producer/release/staff metadata, any
 * payload merged from upstream JSON). Returns the canonical URL
 * string for `http:` / `https:` URLs; returns `null` for anything
 * else — `javascript:`, `data:`, `vbscript:`, `file:`, relative
 * URLs without a scheme, malformed URLs, etc. — so the caller can
 * skip rendering the link (or render plain text instead).
 *
 * This module deliberately does NOT enforce the SSRF host
 * allowlist that `isAllowedHttpTarget` does — that gate is for
 * SERVER-SIDE FETCH, not for displaying user-facing links. An
 * operator who clicks through to `https://example.com` does so in
 * their own browser; we just need to make sure we never put a
 * non-http(s) scheme into the DOM as a clickable link.
 *
 * Safe to import from client components — no `server-only` here.
 */
export function safeHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.toString();
}
