import 'server-only';

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
  'erogamescape.dyndns.org',
  'erogamescape.org',
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
