import { NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '@/lib/csrf';

/**
 * CSRF gate applied to every state-mutating `/api/*` request in one
 * place so individual route handlers don't have to remember the
 * check. Idempotent / safe methods short-circuit inside `csrfGuard`.
 *
 * Renamed from `middleware` to `proxy` for Next.js 16 — the
 * `middleware` convention was deprecated. The `proxy` runtime is
 * Node.js (not Edge); `csrfGuard` only uses standard Web APIs so it
 * works in either.
 *
 * Only `/api/*` is intercepted; pages and static assets bypass.
 */
export function proxy(req: NextRequest) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
