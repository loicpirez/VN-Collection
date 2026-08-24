import { decodeApiErrorBody } from './api-error-shape';

/** Structured client result for one failed API response. */
export interface ApiErrorReadResult {
  /** Local fallback or sanitized server message selected for display. */
  message: string;
  /** Stable machine-readable error code when supplied by the route. */
  code: string | null;
  /** Stable route or operation context when supplied by the route. */
  context: string | null;
  /** HTTP response status. */
  status: number;
  /** Whether malformed, missing, or protected server text forced the fallback. */
  usedFallback: boolean;
}

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
export async function readApiErrorDetails(r: Response, fallback: string): Promise<ApiErrorReadResult> {
  try {
    const value: unknown = await r.json();
    const body = decodeApiErrorBody(value);
    if (!body) return { message: fallback, code: null, context: null, status: r.status, usedFallback: true };
    const protectedMessage = body.code?.startsWith('db_') ?? false;
    return {
      message: protectedMessage ? fallback : body.error,
      code: body.code,
      context: body.context,
      status: r.status,
      usedFallback: protectedMessage,
    };
  } catch {
    // The response body isn't valid JSON (e.g. an HTML error page
    // from the platform proxy). Fall back to the caller-supplied
    // string — never let a parse error mask the original failure.
  }
  return { message: fallback, code: null, context: null, status: r.status, usedFallback: true };
}

/**
 * Read a failed API response while preserving the historical string contract.
 *
 * @param r Failed fetch response whose JSON body may be canonical or legacy.
 * @param fallback Localized message used for malformed or protected payloads.
 * @returns Sanitized server text when safe, otherwise `fallback`.
 */
export async function readApiError(r: Response, fallback: string): Promise<string> {
  return (await readApiErrorDetails(r, fallback)).message;
}

/**
 * Stable machine-readable error codes emitted by the API routes that
 * surface user-reachable failures (see the `code` slot on
 * `ApiErrorBody`). Clients map these to localized dictionary strings so
 * the same failure reads in the active UI locale instead of leaking the
 * route's verbatim English `error` text into a toast.
 */
export type KnownApiErrorCode =
  | 'collection_unavailable'
  | 'vndb_malformed_payload'
  | 'vndb_rate_limited'
  | 'vndb_token_required'
  | 'vndb_unavailable'
  | 'steam_sync_failed'
  | 'steam_not_configured'
  | 'egs_game_not_found'
  | 'needs_mapping'
  | 'already_exists'
  | 'queue_full'
  | 'invalid_operation'
  | 'run_unavailable'
  | 'db_unique_conflict'
  | 'db_reference_conflict'
  | 'db_retryable_conflict'
  | 'db_timeout'
  | 'db_unavailable'
  | 'db_internal'
  | 'upstream_unavailable'
  | 'internal_error'
  | 'alicenet_dns_failure'
  | 'alicenet_timeout'
  | 'alicenet_connection_refused'
  | 'alicenet_rate_limited'
  | 'alicenet_upstream_unavailable'
  | 'alicenet_forbidden'
  | 'alicenet_not_found'
  | 'alicenet_parse_failed'
  | 'alicenet_operation_failed';

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
  const result = await readApiErrorDetails(r, fallback);
  if (result.code) {
    const localized = messages[result.code as KnownApiErrorCode];
    if (typeof localized === 'string' && localized.length > 0) return localized;
  }
  return fallback;
}
