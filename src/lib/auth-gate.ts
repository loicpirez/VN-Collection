import 'server-only';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * R5-131 — constant-time comparison for the admin-token check.
 *
 * Plain `===` on user-supplied input leaks the token byte-by-byte
 * via response timing. Use `crypto.timingSafeEqual` so two strings
 * of equal length compare in O(length) wall-clock time regardless
 * of where they first diverge. Returns `false` immediately when
 * the lengths differ (timing-safe by design — the attacker only
 * learns the expected length, not the contents).
 */
function timingSafeStrEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Self-hosted single-user app gate. The destructive / sensitive
 * routes (backup download, DB restore, export, import, settings,
 * cache wipe, raw file serving) were previously reachable from any
 * device on the LAN with no auth at all. That meant anyone who
 * could resolve the hostname could:
 *   - download the SQLite file and steal the VNDB token /
 *     Steam API key out of `app_setting`,
 *   - upload a malicious .db that fully overwrites the user's
 *     collection,
 *   - replace the VNDB token with their own and silently re-route
 *     list mutations,
 *   - wipe the VNDB cache to grind subsequent navigation.
 *
 * The gate checks two signals:
 *
 *   1. Request origin is loopback (`127.0.0.1`, `::1`, `localhost`).
 *      X-Forwarded-For is consulted only when ALLOW_TRUSTED_PROXY=1
 *      is set, so a misconfigured reverse proxy can't bypass.
 *   2. Optional shared secret. When `VN_ADMIN_TOKEN` is configured,
 *      requests that include `Authorization: Bearer <token>` OR the
 *      `x-admin-token` header equal to the secret are also allowed —
 *      lets the user reach these routes from another device they
 *      control without exposing them to the LAN.
 *
 * The default (no env vars) is "loopback only". This matches the
 * self-hosted single-user posture and breaks nothing for the local
 * dev / `localhost:3000` case.
 *
 * Returns `null` when the request is allowed; returns a 403
 * NextResponse otherwise. Call as the first line in a route:
 *
 *   const denied = requireLocalhostOrToken(req);
 *   if (denied) return denied;
 */
export function requireLocalhostOrToken(req: Request): NextResponse | null {
  // 1) Admin token override (when configured). Compares via
  //    timing-safe equality (R5-131) so the response time doesn't
  //    leak the token byte-by-byte to a network attacker who can
  //    measure request timing.
  const adminToken = process.env.VN_ADMIN_TOKEN?.trim();
  if (adminToken) {
    const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const header = req.headers.get('x-admin-token')?.trim();
    if (bearer && timingSafeStrEqual(bearer, adminToken)) return null;
    if (header && timingSafeStrEqual(header, adminToken)) return null;
  }

  // 2) Loopback check. Inspect the URL host (set by Next from the
  // incoming Host header) and, when the proxy override is on, also
  // accept x-forwarded-for from a trusted proxy whose forwarded
  // address is itself loopback.
  const url = new URL(req.url);
  if (isLoopbackHost(url.hostname)) return null;

  // AUD-SEC-015: Only trust X-Forwarded-For when ALLOW_TRUSTED_PROXY=1
  // AND the request carries X-Proxy-Secret matching TRUSTED_PROXY_SECRET.
  // Without the shared secret, any client can forge X-Forwarded-For: 127.0.0.1
  // and bypass the loopback gate. The reverse proxy (nginx/Caddy) must be
  // configured to inject the secret header on every forwarded request.
  if (process.env.ALLOW_TRUSTED_PROXY === '1') {
    const secret = process.env.TRUSTED_PROXY_SECRET?.trim();
    const proofHeader = req.headers.get('x-proxy-secret')?.trim();
    const secretOk = secret ? (proofHeader === secret) : false;
    if (secretOk) {
      const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded && isLoopbackIp(forwarded)) return null;
    }
  }

  // Deny.
  return NextResponse.json(
    {
      error:
        'Forbidden — this endpoint is restricted to localhost. Set VN_ADMIN_TOKEN to allow remote access from a known client.',
    },
    { status: 403 },
  );
}

function isLoopbackHost(host: string): boolean {
  // Strip optional port; URL.hostname already drops the port but
  // future call sites may pass a raw Host header. R5-130 dropped
  // `0.0.0.0` from the allowlist — `0.0.0.0` is the "any
  // interface" / "unspecified" address, NOT loopback. Treating it
  // as loopback would let a future deployment that listens on
  // 0.0.0.0 and forwards `Host: 0.0.0.0` accidentally bypass the
  // auth gate.
  const h = host.split(':')[0].toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]'
  );
}

function isLoopbackIp(ip: string): boolean {
  // R5-130: same fix here. `0.0.0.0` is not loopback.
  const v = ip.replace(/^\[|\]$/g, '');
  if (v === '127.0.0.1' || v === '::1') return true;
  if (v.startsWith('127.')) return true;
  return false;
}
