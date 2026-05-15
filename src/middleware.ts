import { NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '@/lib/csrf';

/**
 * Edge-runtime CSRF gate applied to every state-mutating `/api/*`
 * request in one place, so individual route handlers don't have to
 * remember the check. Idempotent / safe methods short-circuit
 * inside `csrfGuard`.
 *
 * Only `/api/*` is intercepted; pages and static assets bypass.
 */
export function middleware(req: NextRequest) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
