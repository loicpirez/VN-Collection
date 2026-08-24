import { timingSafeEqual } from 'node:crypto';

const FORWARDING_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
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

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  const ipv4 = normalized.replace(/^(?:::ffff:|0:0:0:0:0:ffff:)/, '');
  const octets = ipv4.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return false;
  const numbers = octets.map(Number);
  return numbers[0] === 127 && numbers.every((octet) => octet <= 255);
}

function isLoopbackForwardedHost(value: string): boolean {
  if (value.includes(',')) return false;
  try {
    const hostname = new URL(`http://${value.trim()}`).hostname;
    return hostname.toLowerCase() === 'localhost' || isLoopbackAddress(hostname);
  } catch {
    return false;
  }
}

/**
 * Recognize forwarding metadata synthesized by Next.js for a direct HTTP
 * loopback connection without accepting client-supplied proxy metadata.
 *
 * @param request Incoming request whose forwarding headers are inspected.
 * @returns True only for a complete, loopback-only Next.js header set.
 */
export function hasSyntheticLoopbackForwarding(request: Request): boolean {
  if (request.headers.has('forwarded') || request.headers.has('x-proxy-secret')) return false;
  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedPort = request.headers.get('x-forwarded-port');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (!forwardedFor || !forwardedHost || !forwardedPort || forwardedProto !== 'http') return false;
  const port = Number(forwardedPort);
  if (!/^\d{1,5}$/.test(forwardedPort) || port < 1 || port > 65_535) return false;
  const hops = forwardedFor.split(',').map((hop) => hop.trim());
  return hops.length > 0 && hops.every((hop) => isLoopbackAddress(hop)) && isLoopbackForwardedHost(forwardedHost);
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
