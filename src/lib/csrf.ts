import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Minimal CSRF gate for state-mutating API routes.
 *
 * Same-origin checks rely on browsers honestly setting either
 * `Sec-Fetch-Site` (Chrome/Edge/Safari/Firefox all set this on
 * fetch + form submissions) or `Origin` (always set on cross-origin
 * fetch). Both surfaces are stripped from `<form>` submissions when
 * the body is `application/x-www-form-urlencoded`, so we also require
 * `Content-Type: application/json` on POST/PATCH bodies — pure HTML
 * `<form>` posts can't reach the route at all.
 *
 * The gate is intentionally generous about local-dev edge cases
 * (`Origin: null` is allowed for browser-extension flows; missing
 * `Sec-Fetch-Site` falls back to the Origin/Referer host match).
 *
 * Returns a 403 NextResponse to reject, or null to continue.
 */
export function csrfGuard(req: Request): NextResponse | null {
  const method = req.method.toUpperCase();
  // Safe methods don't need the guard.
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  // Reject form-encoded bodies entirely — those are the CSRF surface
  // because browsers send them cross-origin without preflight.
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (
    ct.startsWith('application/x-www-form-urlencoded') ||
    ct.startsWith('text/plain')
  ) {
    return NextResponse.json(
      { error: 'unsupported content-type for state-mutating request' },
      { status: 415 },
    );
  }

  // Multipart uploads carry an `Origin` header in every browser, so
  // we let them fall through to the Origin/Referer check below.

  // Fetch metadata header (preferred when present).
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite) {
    // `same-origin` and `same-site` are fine. `none` means the user
    // navigated directly (e.g. via address bar) — also safe.
    if (fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none') {
      return null;
    }
    return NextResponse.json({ error: 'cross-site request denied' }, { status: 403 });
  }

  // Fallback for older clients: compare Origin/Referer to the
  // request URL's origin.
  const expected = new URL(req.url).origin;
  const origin = req.headers.get('origin');
  if (origin) {
    if (origin === 'null') return null; // browser extensions / sandboxed iframes
    if (origin === expected) return null;
    return NextResponse.json({ error: 'cross-site request denied' }, { status: 403 });
  }
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      if (new URL(referer).origin === expected) return null;
    } catch {
      // Malformed referer; fall through to deny.
    }
    return NextResponse.json({ error: 'cross-site request denied' }, { status: 403 });
  }

  // No Origin AND no Referer AND no Sec-Fetch-Site — almost certainly
  // a programmatic client. Allow only if it identifies itself with a
  // JSON body; that's what every fetch from our own UI does, but no
  // browser will send it cross-origin without one of the headers
  // above.
  if (ct.startsWith('application/json')) return null;
  return NextResponse.json({ error: 'cross-site request denied' }, { status: 403 });
}
