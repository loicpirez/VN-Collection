import { NextResponse } from 'next/server';

/**
 * R5-129: standard upstream-error response for API route catch
 * blocks. The previous pattern in every `/api/*` route was:
 *
 *   } catch (err) {
 *     return NextResponse.json(
 *       { error: (err as Error).message },
 *       { status: 502 },
 *     );
 *   }
 *
 * That leaks the raw upstream error message to the client. Two
 * problems with that:
 *
 *   1. Defence-in-depth. Some VNDB / EGS / Steam error strings
 *      include URL fragments, internal stack traces, or — worst
 *      case — pieces of the request body we just sent (which can
 *      contain the operator's token if the upstream echoed it).
 *      Surfacing the raw text to whatever called us is the kind
 *      of low-level leak we should not be one bug away from.
 *
 *   2. Usability. The raw upstream message is meaningless to the
 *      end user ("ECONNRESET", "Throttled by api.vndb.org", etc.).
 *      A generic "upstream service unavailable" + the route name
 *      is both safer AND clearer.
 *
 * `upstreamError(route, err)` logs the original message
 * server-side (so the operator can still diagnose from the dev
 * console / production log) and returns a sanitized 502 to the
 * client.
 */
export function upstreamError(route: string, err: unknown): NextResponse {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[upstream:${route}] ${detail}`);
  return NextResponse.json(
    { error: 'upstream service unavailable' },
    { status: 502 },
  );
}

/**
 * Round 5 audit (DBA-006 / DBA-007 / DBA-008): standard catch-block
 * response for an unexpected DB / runtime error in an API route.
 * Mirrors `upstreamError` but returns 500 with a sanitised body so
 * the raw SQLite / driver message never reaches the network.
 *
 *   } catch (err) {
 *     return internalError('reading-queue', err);
 *   }
 */
export function internalError(route: string, err: unknown): NextResponse {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[internal:${route}] ${detail}`);
  return NextResponse.json(
    { error: 'internal error' },
    { status: 500 },
  );
}
