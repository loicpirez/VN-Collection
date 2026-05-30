import { sanitizeUnknownError } from './error-sanitize';

/**
 * Replacement token emitted in place of a full http(s) URL whose host
 * could not be parsed. A parseable URL collapses to its origin instead
 * (scheme + host), so this literal only appears for malformed URLs.
 */
const URL_PLACEHOLDER = '[url]';

/**
 * Matches an http(s) URL run. Userinfo-bearing URLs are already redacted
 * to `[REDACTED_URL]` by `sanitizeUnknownError` before this pass, so the
 * runs reaching here carry no credentials; this pass strips their path
 * and query, keeping only scheme + host.
 */
const HTTP_URL = /https?:\/\/[^\s'"]+/gi;

/**
 * Matches an absolute POSIX or Windows filesystem path so a leaked
 * `Error.stack` frame or `ENOENT: ... '/Users/.../db.sqlite'` message
 * does not expose the server's directory layout.
 */
const ABSOLUTE_PATH =
  /(?:[A-Za-z]:\\|\/)(?:[\w.\-+@ ]+[\\/])+[\w.\-+@]+/g;

/**
 * Matches a `Bearer <token>` / `token <token>` / `apikey=<token>` style
 * credential so an Authorization header echoed into an error message is
 * redacted regardless of the surrounding URL.
 */
const BEARER_TOKEN = /\b(bearer|token|apikey|api[_-]?key)[=:\s]+\S+/gi;

/**
 * Reduce an http(s) URL to its origin (scheme + host), discarding the
 * path, query string, and fragment. Falls back to `[url]` when the URL
 * cannot be parsed.
 */
function urlToOrigin(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return URL_PLACEHOLDER;
  }
}

/**
 * Produce a user-safe message from an arbitrary thrown value. Builds on
 * the shared `sanitizeUnknownError` baseline (unknown -> string,
 * proxy-credential URLs, long opaque tokens, CR/LF), then additionally:
 *
 *   - reduces every remaining http(s) URL to scheme + host (drops the
 *     path, query string, and fragment);
 *   - redacts `Bearer` / `token` / `apikey=` credentials;
 *   - strips absolute filesystem paths;
 *   - drops everything from the first ` at ` stack-frame marker onward.
 *
 * Dependency-free aside from the in-repo `error-sanitize` helpers.
 */
export function sanitizeErrorMessage(e: unknown): string {
  const base = sanitizeUnknownError(e);
  const noStack = base.split(/\s+at\s+/)[0];
  return noStack
    .replace(BEARER_TOKEN, (m) => `${m.split(/[=:\s]/, 1)[0]} [REDACTED_TOKEN]`)
    .replace(HTTP_URL, (m) => urlToOrigin(m))
    .replace(ABSOLUTE_PATH, '[path]')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Log the FULL error server-side (with a caller-supplied context label)
 * and return the client-facing body carrying only the sanitized message.
 * Use inside an API route catch block:
 *
 *   } catch (e) {
 *     return NextResponse.json(loggedApiError(e, 'steam-sync'), { status: 500 });
 *   }
 *
 * The raw value — including any stack trace — reaches the server console;
 * the network only ever sees the sanitized `{ error }`.
 */
export function loggedApiError(e: unknown, context: string): { error: string } {
  const full = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(`[${context}] ${full}`);
  return { error: sanitizeErrorMessage(e) };
}
