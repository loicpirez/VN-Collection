import 'server-only';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  hasForwardingHeaders,
  hasSyntheticLoopbackForwarding,
  hasTrustedProxyProof,
} from './trusted-proxy';

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
 *   1. A direct request may use a loopback URL. This includes the complete,
 *      loopback-only forwarding set synthesized by Next.js. Other forwarded
 *      requests require ALLOW_TRUSTED_PROXY=1 and a matching private proof.
 *   2. Optional shared secret. When `VN_ADMIN_TOKEN` is configured,
 *      requests that include `Authorization: Bearer <token>` OR the
 *      `x-admin-token` header equal to the secret are also allowed —
 *      lets the user reach these routes from another device they
 *      control without exposing them to the LAN.
 *
 * The default (no env vars) is "direct loopback only". This matches the
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
  const adminToken = process.env.VN_ADMIN_TOKEN?.trim();
  if (adminToken) {
    const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const header = req.headers.get('x-admin-token')?.trim();
    if (bearer && timingSafeStrEqual(bearer, adminToken)) return null;
    if (header && timingSafeStrEqual(header, adminToken)) return null;
  }

  // Next.js synthesizes forwarding metadata even for direct connections, so
  // the local shortcut accepts only its complete loopback-only shape.
  const url = new URL(req.url);
  const forwarded = hasForwardingHeaders(req);
  if (isLoopbackHost(url.hostname) && (!forwarded || hasSyntheticLoopbackForwarding(req))) return null;

  // The proxy proof authenticates the reverse proxy itself. The forwarded
  // client address may be public and is used for logging, not authorization.
  if (forwarded && hasTrustedProxyProof(req)) return null;

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
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]'
  );
}
