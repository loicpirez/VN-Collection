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
  'www.trader.co.jp',
  'www.animate-onlineshop.jp',
  'store.kadokawa.co.jp',
  'www.getchu.com',
  'www.gamers.co.jp',
  'shop.gamecity.ne.jp',
  'shopping.yahoo.co.jp',
  'www.amazon.co.jp',
  'www.amiami.jp',
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
 * ACCEPTED RISK (LIB-011): this does not protect against redirect-to-private-IP.
 * A `redirect: 'manual'` approach with re-checking every hop Location header
 * would close this gap, but adds significant complexity to all callers. Mitigating
 * factors: (a) all allowed hosts are well-known CDNs/APIs unlikely to be
 * compromised into redirect chaining; (b) `assertNoPrivateIpRebind` already
 * blocks DNS rebinding on user-supplied URLs before they reach `isAllowedHttpTarget`;
 * (c) the fetch layer enforces the allowlist so only white-listed origins can
 * initiate a chain in the first place. Accepted as low residual risk.
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
export function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  return false;
}

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
 * AUD-SEC-016: DNS rebinding defence. Resolves `hostname` via DNS (both IPv4
 * and IPv6) and throws if any address falls in a private / loopback / link-local
 * range. Call this before issuing an outbound fetch to a user-influenced hostname
 * (e.g. `vndb_backup_url`) to prevent a rebind from reaching internal services.
 *
 * The function is best-effort — a hostile DNS server that rotates between
 * a public IP (returned here) and a private IP (used by the OS resolver at
 * fetch time) can still win a race. Combined with `isAllowedHttpTarget` the
 * attack surface is limited to DNS servers of allowlisted domains.
 */
export async function assertNoPrivateIpRebind(hostname: string): Promise<void> {
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
}
