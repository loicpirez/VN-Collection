import { NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '@/lib/csrf';
import { requireOptionalPublicReadAuth } from '@/lib/api-route-meta';
import { contentSecurityPolicy } from '@/lib/content-security-policy';

function noncePolicy(): { nonce: string; policy: string } {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  return { nonce, policy: contentSecurityPolicy(nonce) };
}

function securedResponse(response: NextResponse, policy: string): NextResponse {
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

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
  const { nonce, policy } = noncePolicy();
  const readDenied = requireOptionalPublicReadAuth(req);
  if (readDenied) return securedResponse(readDenied, policy);
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const denied = csrfGuard(req);
    if (denied) return securedResponse(denied, policy);
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  return securedResponse(NextResponse.next({ request: { headers: requestHeaders } }), policy);
}

export const config = {
  matcher: ['/:path*'],
};
