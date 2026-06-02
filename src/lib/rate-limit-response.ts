import { NextResponse } from 'next/server';
import { clientIp, rateLimit, type RateLimitOptions } from './rate-limit';

/**
 * R5-SEC-006 route-facing wrapper around {@link rateLimit}. Composes the
 * caller-supplied `route` label with the client IP into the limiter key,
 * and on rejection returns the shared `{ error }` body with a `Retry-After`
 * header (whole seconds, rounded up). Returns `null` when the request is
 * within budget so a route can short-circuit:
 *
 *   const limited = tooManyRequests(req, 'search', { limit: 30, windowMs: 10_000 });
 *   if (limited) return limited;
 *
 * `opts.now` is forwarded so tests can drive deterministic windows.
 */
export function tooManyRequests(
  req: Request,
  route: string,
  opts: Pick<RateLimitOptions, 'limit' | 'windowMs'> & { now?: number },
): NextResponse | null {
  const result = rateLimit(`${route}:${clientIp(req)}`, opts);
  if (result.ok) return null;
  const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return NextResponse.json(
    { error: 'rate limit exceeded' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
