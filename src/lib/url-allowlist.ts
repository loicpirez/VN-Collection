import 'server-only';
import { resolve4 as dnsResolve4, resolve6 as dnsResolve6 } from 'node:dns/promises';

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
  'a.sofmap.com',
  'www.sofmap.com',
  'eroge-price.com',
  'www.hgame1.com',
  'www.melonbooks.co.jp',
  'order.mandarake.co.jp',
  'www.mandarake.co.jp',
  'www.wonder.co.jp',
  'trader.co.jp',
  'www.chuko-tsuhan.com',
  'chuko-tsuhan.com',
  'www.trader.co.jp',
  'www.animate-onlineshop.jp',
  'store.kadokawa.co.jp',
  'www.getchu.com',
  'www.gamers.co.jp',
  'shop.gamecity.ne.jp',
  'shopping.yahoo.co.jp',
  'www.amazon.co.jp',
  'www.amiami.jp',
  'slist.amiami.jp',
  'www.ec.otakarasouko.com',
  'ec.geo-online.co.jp',
  'joshinweb.jp',
  'www.neowing.co.jp',
  'www.yodobashi.com',
  'beak-takarajima.celosia.co.jp',
  'www.entergram.co.jp',
  'entergram.co.jp',
  'gyutto.com',
  'gyutto.jp',
  'image.itch.zone',
  'cdn.steamgriddb.com',
  'shared.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'media.steampowered.com',
  'cdn.akamai.steamstatic.com',
  'lemmasoft.renai.us',
  'www.alice-kobe.com',
]);

/**
 * Strict SSRF gate. Returns true only when the URL is an
 * `http(s)://` request to a hostname on the allowlist with no
 * sign of an IP literal or loopback shenanigans.
 *
 * This is the hostname-level gate only. Network-level protection
 * (resolving the host, rejecting private IPs, and pinning the socket to the
 * validated IP so DNS cannot rebind between check and connect) lives in
 * `safeFetch` (`safe-fetch.ts`), which also re-runs this gate plus the
 * resolve-and-pin step on every redirect hop so a `Location` to a
 * private IP or off-allowlist host is rejected mid-chain.
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
 * Returns true when an IPv6 address string is NOT a globally routable
 * unicast address: loopback (`::1`), unspecified (`::`), link-local
 * (`fe80::/10`), unique-local / ULA (`fc00::/7`), site-local (`fec0::/10`),
 * multicast (`ff00::/8`), documentation (`2001:db8::/32`), NAT64
 * (`64:ff9b::/96`), and IPv4-mapped / IPv4-compatible forms whose embedded
 * IPv4 is itself private. The embedded-v4 check stops an attacker pinning
 * `::ffff:127.0.0.1` or `::ffff:10.x` past the guard.
 */
export function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fec') || lower.startsWith('fed') || lower.startsWith('fee') || lower.startsWith('fef')) return true;
  if (lower.startsWith('ff')) return true;
  if (lower.startsWith('2001:db8')) return true;
  if (lower.startsWith('64:ff9b:')) return true;
  const mapped = lower.match(/(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/**
 * Returns true when an IPv4 address string is NOT a globally routable
 * public address. Covers loopback (`127/8`), RFC-1918 private
 * (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`),
 * "this host" (`0/8`), carrier-grade NAT (`100.64/10`), IETF protocol
 * assignments (`192.0.0/24`), TEST-NET docs (`192.0.2/24`,
 * `198.51.100/24`, `203.0.113/24`), benchmarking (`198.18/15`),
 * multicast (`224/4`), reserved (`240/4`), and broadcast
 * (`255.255.255.255`). A malformed string returns true (treated as
 * unsafe) so a caller can never pin to something it could not parse.
 */
export function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * AUD-SEC-016: DNS rebinding defence. Resolves `hostname` via DNS (both IPv4
 * and IPv6) and throws if any address falls in a private / loopback / link-local
 * range. Call this before issuing an outbound fetch to a user-influenced hostname
 * (e.g. `vndb_backup_url`) to prevent a rebind from reaching internal services.
 *
 * This is a standalone pre-check: on its own a hostile DNS server that rotates
 * between a public IP (returned here) and a private IP (used by the OS resolver
 * at fetch time) can win a race. The actual outbound fetch closes that race by
 * going through `safeFetch` (`safe-fetch.ts`), which resolves and pins the
 * socket to the validated IP so no second resolution happens; combined with
 * `isAllowedHttpTarget` the attack surface is limited to allowlisted domains.
 */
export async function assertNoPrivateIpRebind(hostname: string): Promise<void> {
  await resolveAndCheckHostname(hostname);
}

/**
 * A single DNS answer that survived the private-range filter, carrying the
 * IP family so a caller can hand it straight to a Node `lookup` callback.
 */
export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Resolves `hostname` ONCE, rejects any answer in a private / loopback /
 * link-local / ULA / reserved range, and returns the surviving public IPs.
 *
 * The returned addresses are the contract that closes the TOCTOU / DNS-rebind
 * race: a caller pins them into the outbound socket (via a custom `lookup`
 * callback on a Node HTTP agent), so the OS resolver is never consulted a
 * second time and the IP cannot flip between check and connect. `safeFetch`
 * in `safe-fetch.ts` is the canonical consumer.
 *
 * Returns `{ ipv4, ipv6, pinned }` where `pinned` is the flat, family-tagged
 * list ready for a `lookup` shim. Throws on private-range hits, NODATA on
 * both record families, or any other DNS failure.
 */
export async function resolveAndCheckHostname(
  hostname: string,
): Promise<{ ipv4: string[]; ipv6: string[]; pinned: PinnedAddress[] }> {
  let v4addrs: string[] = [];
  let v6addrs: string[] = [];
  try {
    v4addrs = await dnsResolve4(hostname);
  } catch {
    // NODATA for A records is normal for IPv6-only hosts — continue to v6 check.
  }
  try {
    v6addrs = await dnsResolve6(hostname);
  } catch {
    // NODATA for AAAA records is normal — continue.
  }
  if (v4addrs.length === 0 && v6addrs.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }
  for (const addr of v4addrs) {
    if (isPrivateIpv4(addr)) {
      throw new Error(`DNS rebind blocked: ${hostname} resolved to private IPv4 ${addr}`);
    }
  }
  for (const addr of v6addrs) {
    if (isPrivateIpv6(addr)) {
      throw new Error(`DNS rebind blocked: ${hostname} resolved to private IPv6 ${addr}`);
    }
  }
  const pinned: PinnedAddress[] = [
    ...v4addrs.map((address) => ({ address, family: 4 as const })),
    ...v6addrs.map((address) => ({ address, family: 6 as const })),
  ];
  return { ipv4: v4addrs, ipv6: v6addrs, pinned };
}
