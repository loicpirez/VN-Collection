/**
 * Sanitise an arbitrary `Error.message` string for inclusion in a client
 * response. Strips embedded URLs that carry userinfo (proxy credentials),
 * long opaque token-shaped substrings (API keys), and clamps the length
 * so a verbose Node error doesn't blow the response budget.
 *
 * Used by every route that surfaces upstream/network error detail to the
 * UI. The point is NOT to keep an attacker from learning that a fetch
 * failed — the routes themselves are loopback-gated. The point is to
 * make a future regression in error-construction (e.g. a fetch library
 * stringifying a proxy URL into its message) non-fatal: the credential
 * never lands in JSON or `console.log`.
 */
export function sanitizeErrorMessage(input: string | undefined | null, maxLen = 500): string {
  if (!input) return '';
  return String(input)
    // URL with userinfo (proxy URL with credentials)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^/\s]*@[^\s]+/gi, '[REDACTED_URL]')
    // Long opaque token-shaped substrings (≥ 32 alphanumeric chars)
    .replace(/\b[A-Za-z0-9]{32,}\b/g, '[REDACTED_TOKEN]')
    // Strip CR/LF so a malicious response body can't inject log lines
    .replace(/[\r\n]+/g, ' ')
    .slice(0, maxLen);
}

/**
 * Pull the most useful textual representation out of an unknown thrown
 * value. Falls back to `String(e)` when there's no `message` property
 * (and `'unknown error'` when even that returns the literal `'[object
 * Object]'`). Always passes the result through `sanitizeErrorMessage`.
 */
export function sanitizeUnknownError(e: unknown, maxLen = 500): string {
  let msg: string;
  if (e instanceof Error) {
    msg = e.message;
  } else if (typeof e === 'string') {
    msg = e;
  } else {
    const s = String(e);
    msg = s === '[object Object]' ? 'unknown error' : s;
  }
  return sanitizeErrorMessage(msg, maxLen);
}
