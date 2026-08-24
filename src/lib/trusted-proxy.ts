import { timingSafeEqual } from 'node:crypto';

const FORWARDING_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
] as const;

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

/** Return whether a request carries evidence that it passed through a proxy. */
export function hasForwardingHeaders(request: Request): boolean {
  return FORWARDING_HEADERS.some((header) => request.headers.has(header));
}

/**
 * Verify the private proof injected by the deployment's trusted reverse proxy.
 *
 * @param request Incoming request whose proof header must be checked.
 * @param environment Environment containing the opt-in flag and shared secret.
 * @returns True only when trusted-proxy mode is enabled and the proof matches.
 */
export function hasTrustedProxyProof(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (environment.ALLOW_TRUSTED_PROXY !== '1') return false;
  const expected = environment.TRUSTED_PROXY_SECRET?.trim();
  const supplied = request.headers.get('x-proxy-secret')?.trim();
  if (!expected || !supplied) return false;
  return timingSafeStringEqual(supplied, expected);
}

/**
 * Resolve the public request origin only after trusted-proxy proof succeeds.
 *
 * @param request Proxied request containing forwarded host and protocol.
 * @param environment Environment containing trusted-proxy configuration.
 * @returns A normalized public origin, or null for untrusted/malformed input.
 */
export function trustedForwardedOrigin(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  if (!hasTrustedProxyProof(request, environment)) return null;
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if ((protocol !== 'http' && protocol !== 'https') || !host) return null;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}
