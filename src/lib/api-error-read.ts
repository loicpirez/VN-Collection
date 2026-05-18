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
