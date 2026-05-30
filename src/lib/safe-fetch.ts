import 'server-only';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { LookupAddress } from 'node:dns';
import { isAllowedHttpTarget, resolveAndCheckHostname, type PinnedAddress } from './url-allowlist';
import { nodeAgentFetch } from './proxy-fetch';

/**
 * Builds a Node `lookup` callback that always answers with `pinned` and never
 * consults the OS resolver. Feeding this into an HTTP/HTTPS agent forces the
 * socket to connect to the exact IP(s) that `resolveAndCheckHostname` already
 * cleared, which is what closes the TOCTOU / DNS-rebind window: there is no
 * second resolution that a hostile DNS server could flip to a private IP.
 */
function pinnedLookup(pinned: PinnedAddress[]) {
  const all: LookupAddress[] = pinned.map(({ address, family }) => ({ address, family }));
  return (
    _hostname: string,
    options: { all?: boolean } | number,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ): void => {
    if (typeof options === 'object' && options.all) {
      callback(null, all);
      return;
    }
    const first = all[0];
    callback(null, first.address, first.family);
  };
}

/**
 * Resolves and IP-pins one hop. Rejects the hop unless it is `http(s)` to an
 * allowlisted hostname whose every resolved address is public, then returns an
 * agent whose socket is pinned to those addresses plus the `servername` so TLS
 * still verifies against the real hostname rather than the IP literal.
 */
async function resolvePinnedHop(hopUrl: string): Promise<{ agent: HttpAgent | HttpsAgent; servername?: string }> {
  if (!isAllowedHttpTarget(hopUrl)) {
    throw new Error(`safe-fetch: blocked by host allowlist: ${hopUrl}`);
  }
  const { hostname, protocol } = new URL(hopUrl);
  const { pinned } = await resolveAndCheckHostname(hostname);
  const lookup = pinnedLookup(pinned);
  if (protocol === 'https:') {
    return { agent: new HttpsAgent({ lookup }), servername: hostname };
  }
  return { agent: new HttpAgent({ lookup }) };
}

/**
 * SSRF-hardened drop-in for `fetch` on server-side outbound requests whose URL
 * is influenced by user data. Validates the host against the shared allowlist,
 * resolves it up front, rejects any private / loopback / link-local / ULA /
 * reserved address, and pins the connection to the validated IP so the socket
 * connects to the IP that was checked (no DNS rebind between check and
 * connect). Redirects are followed with the same guarantees re-applied per
 * hop, so a `Location` pointing at a private IP or an off-allowlist host is
 * rejected mid-chain. Returns a standard `Response`.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return nodeAgentFetch(url, init, undefined, resolvePinnedHop);
}
