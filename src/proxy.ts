import { NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '@/lib/csrf';

/**
 * CSRF gate for every state-mutating `/api/*` request.
 *
 * Idempotent / safe methods (GET/HEAD/OPTIONS) short-circuit inside
 * `csrfGuard`. Mutating requests require either:
 *   - `Sec-Fetch-Site: same-origin` (modern browsers), OR
 *   - a matching `Origin` header, OR
 *   - `Content-Type: application/json` as the last-resort check
 *     for programmatic callers that don't set Origin/Referer.
 *
 * Next.js 16 renamed the middleware convention: the file must be
 * `proxy.ts` and the export must be named `proxy` (SECA-023).
 */
export function proxy(req: NextRequest): NextResponse {
  const denied = csrfGuard(req);
  if (denied) return denied;
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
