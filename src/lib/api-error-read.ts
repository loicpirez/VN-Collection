/**
 * R5-147 client-side companion to `lib/api-error.ts`. The server
 * returns `{ error: string }` on every non-2xx response (see
 * `upstreamError`); this helper reads that field with full type
 * safety so callers can stop dereferencing `.error` on an `any`-typed
 * `Response.json()` result.
 *
 * Usage:
 *
 *   if (!r.ok) throw new Error(await readApiError(r, t.common.error));
 *
 * Returns the server-supplied `error` string when present and
 * non-empty, otherwise the caller-supplied `fallback` (typically
 * an i18n-localized "Something went wrong" string). Errors thrown
 * during JSON parsing are swallowed silently — `fallback` wins.
 */
export async function readApiError(r: Response, fallback: string): Promise<string> {
  try {
    const body = (await r.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // The response body isn't valid JSON (e.g. an HTML error page
    // from the platform proxy). Fall back to the caller-supplied
    // string — never let a parse error mask the original failure.
  }
  return fallback;
}

/**
 * Stable machine-readable error codes emitted by the API routes that
 * surface user-reachable failures (see the `code` slot on
 * `ApiErrorBody`). Clients map these to localized dictionary strings so
 * the same failure reads in the active UI locale instead of leaking the
 * route's verbatim English `error` text into a toast.
 */
export type KnownApiErrorCode =
  | 'vndb_token_required'
  | 'vndb_unavailable'
  | 'steam_sync_failed'
  | 'steam_not_configured'
  | 'egs_game_not_found';

/**
 * Localized companion to {@link readApiError}. Reads the response's
 * machine-readable `code`; when it matches one of the supplied
 * `messages`, returns that localized string. Any unrecognized code,
 * missing code, or unparseable body yields the caller-supplied
 * (already localized) `fallback`. The server's raw English `error`
 * string is intentionally never surfaced, so fr/ja toasts stay in
 * locale.
 */
export async function readApiErrorLocalized(
  r: Response,
  messages: Partial<Record<KnownApiErrorCode, string>>,
  fallback: string,
): Promise<string> {
  try {
    const body = (await r.json()) as { code?: unknown };
    if (typeof body.code === 'string' && body.code.length > 0) {
      const localized = messages[body.code as KnownApiErrorCode];
      if (typeof localized === 'string' && localized.length > 0) {
        return localized;
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}
