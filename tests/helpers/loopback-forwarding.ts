/**
 * Build the complete forwarding metadata synthesized for a direct loopback
 * request while retaining a deterministic client bucket for rate-limit tests.
 *
 * @param clientKey Stable key identifying one synthetic local client.
 * @returns Forwarding headers accepted only by the direct-loopback contract.
 */
export function loopbackForwardingHeaders(clientKey: string): Record<string, string> {
  let hash = 0;
  for (const character of clientKey) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  const forwardedFor = `127.${(hash >>> 16) & 255}.${(hash >>> 8) & 255}.${hash & 255}`;
  return {
    'x-forwarded-for': forwardedFor,
    'x-forwarded-host': '127.0.0.1',
    'x-forwarded-port': '80',
    'x-forwarded-proto': 'http',
  };
}
