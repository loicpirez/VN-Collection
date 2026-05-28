import 'server-only';
import { type Agent } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { ProviderId, ProxyConfig } from './proxy-config';
import { buildProxyUrl, resolveProxyConfig, resolveStockProviderProxy } from './proxy-config';

/**
 * Execute an HTTP/HTTPS request through a Node.js HTTP agent (proxy agent),
 * returning a Web-compatible Response. Handles AbortSignal and string bodies.
 */
async function nodeAgentFetch(
  url: string,
  init: RequestInit,
  agent: Agent,
): Promise<Response> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const requester = isHttps ? httpsRequest : httpRequest;

  const headerMap: Record<string, string> = {};
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => {
      headerMap[k] = v;
    });
  }

  const bodyStr = typeof init.body === 'string' ? init.body : null;
  if (bodyStr && !headerMap['content-length']) {
    headerMap['content-length'] = String(Buffer.byteLength(bodyStr));
  }

  return new Promise<Response>((resolve, reject) => {
    const req = requester(
      {
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
        path: parsed.pathname + parsed.search,
        method: (init.method ?? 'GET').toUpperCase(),
        headers: headerMap,
        agent,
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
          if (aborted) return;
          const body = Buffer.concat(chunks).toString('utf8');
          const responseHeaders = new Headers();
          for (const [key, val] of Object.entries(res.headers)) {
            if (val != null) {
              if (Array.isArray(val)) {
                for (const v of val) responseHeaders.append(key, v);
              } else {
                responseHeaders.set(key, val);
              }
            }
          }
          resolve(
            new Response(body, {
              status: res.statusCode ?? 0,
              headers: responseHeaders,
            }),
          );
        });
        res.on('error', (e) => {
          if (!aborted) reject(e);
        });
      },
    );

    if (init.signal) {
      const sig = init.signal as AbortSignal;
      if (sig.aborted) {
        req.destroy();
        reject(new DOMException('Signal aborted', 'AbortError'));
        return;
      }
      sig.addEventListener(
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

/**
 * Provider-scoped fetch wrapper. When a proxy is configured for the provider
 * (via env vars or DB settings), the request is tunnelled through it.
 * Falls back to native fetch() when no proxy is configured.
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
  if (!config) return fetch(url, init);
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
  const config = resolveStockProviderProxy(providerId);
  if (!config) return fetch(url, init);
  const agent = await buildAgent(config);
  return nodeAgentFetch(url, init, agent);
}
