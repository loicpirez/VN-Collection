import 'server-only';
import { resolve4 as dnsResolve4 } from 'node:dns/promises';

/**
 * Shared SSRF allowlist. Every server-side outbound HTTP fetch that
 * builds its URL from data the user can influence (uploaded URLs,
 * VNDB extlinks, EGS shop ids, settings) MUST go through
 * `isAllowedHttpTarget` before issuing the request.
 *
 * Hosts that legitimately serve images / metadata to us:
 *   • VNDB CDN family (s2 / s / t / cdn / api.vndb.org)
 *   • ErogameScape (.dyndns.org / .org mirrors)
 *   • DMM, DLsite, Suruga-ya, Gyutto — EGS shop CDNs
 *   • Steam image CDNs
 *   • A few community mirrors (itch, steamgriddb, lemmasoft)
 *
 * Everything else (especially private IPs, loopback, link-local, IP
 * literals, IPv6) is rejected.
 */
export const ALLOWED_HTTP_HOSTS: ReadonlySet<string> = new Set([
  's2.vndb.org',
  's.vndb.org',
  't.vndb.org',
  'cdn.vndb.org',
  'api.vndb.org',
  'vndb.org',
  // VNDB community mirror — accepted as the default `vndb_backup_url`.
  'api.yorhel.org',
  'erogamescape.dyndns.org',
  'erogamescape.org',
  'api.steampowered.com',
  'pics.dmm.co.jp',
  'pics.dmm.com',
  'img.dlsite.jp',
  'www.suruga-ya.jp',
  'www.suruga-ya.com',
  'gyutto.com',
  'gyutto.jp',
  'image.itch.zone',
  'cdn.steamgriddb.com',
  'shared.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'media.steampowered.com',
  'cdn.akamai.steamstatic.com',
  'lemmasoft.renai.us',
]);

/**
 * Strict SSRF gate. Returns true only when the URL is an
 * `http(s)://` request to a hostname on the allowlist with no
 * sign of an IP literal or loopback shenanigans.
 *
 * NOTE: this does not protect against redirect-to-private-IP. The
 * `redirect: 'manual'` option on fetch + a re-check on every hop
 * would be the next step; today we trust upstream not to chain.
 */
export function isAllowedHttpTarget(target: string): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  if (host.startsWith('[') || host.includes(':')) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  return ALLOWED_HTTP_HOSTS.has(host);
}

/**
 * Returns true when an IPv4 address string falls in loopback (127.x.x.x),
 * link-local (169.254.x.x), or RFC-1918 private ranges.
 * Used by assertNoPrivateIpRebind to close the DNS-rebinding gap.
 */
export function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * AUD-SEC-016: DNS rebinding defence. Resolves `hostname` via DNS and
 * throws if any returned IPv4 address falls in a private / loopback range.
 * Call this before issuing an outbound fetch to a user-influenced hostname
 * (e.g. `vndb_backup_url`) to prevent a rebind from reaching internal services.
 *
 * The function is best-effort — a hostile DNS server that rotates between
 * a public IP (returned here) and a private IP (used by the OS resolver at
 * fetch time) can still win a race. Combined with `isAllowedHttpTarget` the
 * attack surface is limited to DNS servers of allowlisted domains.
 */
export async function assertNoPrivateIpRebind(hostname: string): Promise<void> {
  let addrs: string[];
  try {
    addrs = await dnsResolve4(hostname);
  } catch {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }
  for (const addr of addrs) {
    if (isPrivateIpv4(addr)) {
      throw new Error(`DNS rebind blocked: ${hostname} resolved to private IP ${addr}`);
    }
  }
}
