import 'server-only';
import { type Agent } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import zlib from 'node:zlib';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ProviderId, ProxyConfig } from './proxy-config';
import { buildProxyUrl, resolveProxyConfig, resolveStockProviderProxy } from './proxy-config';
import { safeFetch } from './safe-fetch';

const directFetchStore = new AsyncLocalStorage<boolean>();

/**
 * Run `fn` with proxying disabled for every `stockProviderFetch` call made
 * inside it (including nested awaits). The stock-refresh fallback uses this
 * to retry a provider over a direct connection when the proxied attempt
 * errored or returned zero offers.
 */
export function runStockFetchDirect<T>(fn: () => Promise<T>): Promise<T> {
  return directFetchStore.run(true, fn);
}

/**
 * Decompress a proxied HTTP body per its `Content-Encoding`. Node's raw
 * `http`/`https` request API never auto-decompresses (unlike the WHATWG
 * `fetch`), so a gzip / brotli / zstd / deflate response arrives as
 * compressed bytes. Returns the decoded bytes so the caller can apply the
 * correct charset itself (Shift_JIS, EUC-JP, …). Never force UTF-8 here —
 * that corrupts every non-UTF-8 shop page (Sofmap, GEO, Suruga-ya, Kobe).
 */
function decodeProxyBody(raw: Buffer, contentEncoding: string): ArrayBuffer {
  const enc = contentEncoding.toLowerCase().trim();
  let out = raw;
  try {
    if (enc === 'gzip' || enc === 'x-gzip') out = zlib.gunzipSync(raw);
    else if (enc === 'br') out = zlib.brotliDecompressSync(raw);
    else if (enc === 'zstd' && typeof zlib.zstdDecompressSync === 'function') out = zlib.zstdDecompressSync(raw);
    else if (enc === 'deflate') {
      try {
        out = zlib.inflateSync(raw);
      } catch {
        out = zlib.inflateRawSync(raw);
      }
    }
  } catch {
    out = raw;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

interface RawProxyResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  raw: Buffer;
}

/**
 * Issue a single HTTP/HTTPS request through the proxy agent and buffer the
 * raw response bytes (no decompression, no redirect following — that is the
 * caller's job). Honours an AbortSignal and an optional string body.
 */
function performProxyRequest(
  url: string,
  method: string,
  headerMap: Record<string, string>,
  bodyStr: string | null,
  agent: Agent,
  signal: AbortSignal | null | undefined,
  servername?: string,
): Promise<RawProxyResponse> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const requester = isHttps ? httpsRequest : httpRequest;
  return new Promise<RawProxyResponse>((resolve, reject) => {
    const req = requester(
      {
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
        path: parsed.pathname + parsed.search,
        method,
        headers: headerMap,
        agent,
        ...(servername && isHttps ? { servername } : {}),
      },
      (res) => {
        const MAX_BYTES = 50 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let total = 0;
        let aborted = false;
        res.on('data', (chunk: Buffer) => {
          if (aborted) return;
          total += chunk.length;
          if (total > MAX_BYTES) {
            aborted = true;
            res.destroy();
            reject(new Error(`proxy response exceeded ${MAX_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (!aborted) resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, raw: Buffer.concat(chunks) });
        });
        res.on('error', (e) => {
          if (!aborted) reject(e);
        });
      },
    );

    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new DOMException('Signal aborted', 'AbortError'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          req.destroy();
          reject(new DOMException('Signal aborted', 'AbortError'));
        },
        { once: true },
      );
    }

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_PROXY_REDIRECTS = 20;

/**
 * Resolves the connection details for one hop of {@link nodeAgentFetch}. The
 * implementation MUST validate `hopUrl` (allowlist + private-IP guard) and
 * throw to reject it; on success it returns the Node agent the socket should
 * use plus the TLS `servername` for SNI / certificate verification. Used by
 * `safeFetch` to re-resolve and re-pin every redirect hop to a validated IP.
 */
export type HopResolver = (hopUrl: string) => Promise<{ agent: Agent; servername?: string }>;

/**
 * Execute an HTTP/HTTPS request through a Node.js HTTP agent (proxy agent),
 * returning a Web-compatible Response. Follows redirects (the WHATWG `fetch`
 * default) since the raw `http`/`https` API never does, decompresses the body
 * per `Content-Encoding`, and preserves the original bytes for the caller to
 * decode. Handles AbortSignal and string bodies.
 *
 * When `resolveHop` is supplied the static `agent` is ignored and each hop is
 * resolved through the callback instead, which lets `safeFetch` validate and
 * IP-pin the redirect target rather than reusing the original hop's pinned
 * socket against a new host.
 */
export async function nodeAgentFetch(
  url: string,
  init: RequestInit,
  agent: Agent | undefined,
  resolveHop?: HopResolver,
): Promise<Response> {
  const headerMap: Record<string, string> = {};
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => {
      headerMap[k] = v;
    });
  }

  let bodyStr = typeof init.body === 'string' ? init.body : null;
  if (bodyStr && !headerMap['content-length']) {
    headerMap['content-length'] = String(Buffer.byteLength(bodyStr));
  }

  const redirectMode = init.redirect ?? 'follow';
  let currentUrl = url;
  let method = (init.method ?? 'GET').toUpperCase();

  for (let hop = 0; ; hop++) {
    let hopAgent = agent;
    let hopServername: string | undefined;
    if (resolveHop) {
      const resolved = await resolveHop(currentUrl);
      hopAgent = resolved.agent;
      hopServername = resolved.servername;
    }
    if (!hopAgent) throw new Error('nodeAgentFetch: no agent resolved for hop');
    const res = await performProxyRequest(currentUrl, method, headerMap, bodyStr, hopAgent, init.signal as AbortSignal | null | undefined, hopServername);
    const locationRaw = res.headers['location'];
    const location = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw;
    if (redirectMode === 'follow' && REDIRECT_STATUSES.has(res.statusCode) && location && hop < MAX_PROXY_REDIRECTS) {
      currentUrl = new URL(location, currentUrl).toString();
      if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method !== 'GET' && method !== 'HEAD')) {
        method = 'GET';
        bodyStr = null;
        delete headerMap['content-length'];
        delete headerMap['content-type'];
      }
      continue;
    }

    const body = decodeProxyBody(res.raw, String(res.headers['content-encoding'] ?? ''));
    const responseHeaders = new Headers();
    for (const [key, val] of Object.entries(res.headers)) {
      if (val == null) continue;
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'content-encoding' || lowerKey === 'content-length') continue;
      if (Array.isArray(val)) {
        for (const v of val) responseHeaders.append(key, v);
      } else {
        responseHeaders.set(key, val);
      }
    }
    return new Response(body, { status: res.statusCode, headers: responseHeaders });
  }
}

/**
 * Provider-scoped fetch wrapper. When a proxy is configured for the provider
 * (via env vars or DB settings), the request is tunnelled through it.
 * Falls back to `safeFetch` (allowlist + private-IP reject + IP-pinned socket)
 * when no proxy is configured.
 *
 * Apply only to outbound requests for the named provider — never globally.
 */
/**
 * Builds the proxy agent and swallows any constructor error in a sanitised
 * wrapper. `socks-proxy-agent`/`https-proxy-agent` sometimes embed the proxy
 * URL (with credentials) in thrown Error messages; catching here ensures the
 * raw URL is never re-thrown.
 */
async function buildAgent(config: ProxyConfig): Promise<Agent> {
  const proxyUrl = buildProxyUrl(config);
  try {
    if (config.protocol === 'socks5' || config.protocol === 'socks5h') {
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      return new SocksProxyAgent(proxyUrl) as unknown as Agent;
    }
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl) as unknown as Agent;
  } catch (_e) {
    // Log a sanitised diagnostic line; never include `proxyUrl` itself.
    console.error('[proxy-fetch] agent init failed', { protocol: config.protocol, host: config.host });
    throw new Error('proxy agent init failed');
  }
}

export async function providerFetch(
  url: string,
  init: RequestInit,
  provider: ProviderId,
): Promise<Response> {
  const config = resolveProxyConfig(provider);
  if (!config) return safeFetch(url, init);
  const agent = await buildAgent(config);
  return nodeAgentFetch(url, init, agent);
}

/**
 * Two-tier shop fetch: tries the per-shop proxy first, falls back to the
 * generic `stock` proxy, then to direct connection. Use this from
 * `fetchShopText` so each shop provider can be routed independently.
 */
export async function stockProviderFetch(
  url: string,
  init: RequestInit,
  providerId: string,
): Promise<Response> {
  if (directFetchStore.getStore() === true) return safeFetch(url, init);
  const config = resolveStockProviderProxy(providerId);
  if (!config) return safeFetch(url, init);
  const agent = await buildAgent(config);
  return nodeAgentFetch(url, init, agent);
}
