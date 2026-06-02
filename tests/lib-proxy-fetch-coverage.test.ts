/**
 * Hermetic coverage for `src/lib/proxy-fetch.ts` focused on the surfaces
 * the existing `safe-fetch.test.ts` does NOT exercise:
 *   - `providerFetch` routing (no proxy -> safeFetch fallback; proxy
 *     configured -> agent build + nodeAgentFetch),
 *   - `stockProviderFetch` two-tier routing + `runStockFetchDirect`
 *     bypass,
 *   - `buildAgent` failure surfacing a sanitised error,
 *   - `nodeAgentFetch` body decompression per Content-Encoding, HEAD /
 *     304 bodyless responses, redirect method downgrade (303 and
 *     301-on-POST), redirect cap, and AbortSignal rejection.
 *
 * The raw `node:http`/`node:https` `request` is stubbed (no socket opens)
 * and `node:dns/promises` is mocked so `createProxyHopResolver` clears the
 * allowlisted host without a real lookup.
 */
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/proxy-config', () => ({
  resolveProxyConfig: vi.fn(),
  resolveStockProviderProxy: vi.fn(),
  buildProxyUrl: vi.fn(() => 'socks5h://proxy.invalid:1080'),
}));

interface QueuedResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: Buffer | null;
}
interface CapturedRequest {
  options: { method?: string; path?: string; headers?: Record<string, string> };
}

const captured: CapturedRequest[] = [];
const responseQueue: QueuedResponse[] = [];

function fakeRequest(
  options: CapturedRequest['options'],
  cb: (res: EventEmitter & { statusCode: number; headers: Record<string, string | string[]> }) => void,
) {
  const queued = responseQueue.shift() ?? { statusCode: 200, headers: {}, body: null };
  captured.push({ options });
  const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: () => void };
  req.write = () => {};
  req.destroy = () => {};
  req.end = () => {
    const res = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string | string[]>;
      destroy: () => void;
    };
    res.statusCode = queued.statusCode;
    res.headers = queued.headers;
    res.destroy = () => {};
    cb(res);
    if (queued.body && queued.body.length > 0) res.emit('data', queued.body);
    res.emit('end');
  };
  return req;
}

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return { ...actual, request: vi.fn(fakeRequest), default: { ...actual, request: vi.fn(fakeRequest) } };
});
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, request: vi.fn(fakeRequest), default: { ...actual, request: vi.fn(fakeRequest) } };
});

import { resolve4, resolve6 } from 'node:dns/promises';
import { Agent } from 'node:http';
import { safeFetch } from '@/lib/safe-fetch';
import { resolveProxyConfig, resolveStockProviderProxy } from '@/lib/proxy-config';
import type { ProxyConfig } from '@/lib/proxy-config';

const mResolve4 = vi.mocked(resolve4);
const mResolve6 = vi.mocked(resolve6);
const mSafeFetch = vi.mocked(safeFetch);
const mResolveProxy = vi.mocked(resolveProxyConfig);
const mResolveStockProxy = vi.mocked(resolveStockProviderProxy);

const PROXY: ProxyConfig = { protocol: 'socks5h', host: 'proxy.invalid', port: 1080, username: null, password: null };

beforeEach(() => {
  captured.length = 0;
  responseQueue.length = 0;
  mResolve4.mockReset();
  mResolve6.mockReset();
  mSafeFetch.mockReset();
  mResolveProxy.mockReset();
  mResolveStockProxy.mockReset();
  // Default DNS: allowlisted host resolves to a public IP.
  mResolve4.mockResolvedValue(['82.192.72.172']);
  mResolve6.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('providerFetch routing', () => {
  it('falls back to safeFetch when no proxy is configured for the provider', async () => {
    mResolveProxy.mockReturnValue(null);
    const sentinel = new Response('direct', { status: 200 });
    mSafeFetch.mockResolvedValue(sentinel);
    const { providerFetch } = await import('@/lib/proxy-fetch');
    const res = await providerFetch('https://api.vndb.org/kana/vn', { method: 'GET' }, 'vndb');
    expect(res).toBe(sentinel);
    expect(mSafeFetch).toHaveBeenCalledWith('https://api.vndb.org/kana/vn', { method: 'GET' });
    expect(captured).toHaveLength(0);
  });

  it('tunnels through a built proxy agent when a config is present', async () => {
    mResolveProxy.mockReturnValue(PROXY);
    responseQueue.push({ statusCode: 200, headers: {}, body: Buffer.from('ok') });
    const { providerFetch } = await import('@/lib/proxy-fetch');
    const res = await providerFetch('https://api.vndb.org/kana/vn', { method: 'GET' }, 'egs');
    expect(res.status).toBe(200);
    expect(mSafeFetch).not.toHaveBeenCalled();
    expect(captured).toHaveLength(1);
  });
});

describe('stockProviderFetch routing', () => {
  it('uses safeFetch directly inside runStockFetchDirect even when a proxy exists', async () => {
    mResolveStockProxy.mockReturnValue(PROXY);
    const sentinel = new Response('forced-direct', { status: 200 });
    mSafeFetch.mockResolvedValue(sentinel);
    const { stockProviderFetch, runStockFetchDirect } = await import('@/lib/proxy-fetch');
    const res = await runStockFetchDirect(() =>
      stockProviderFetch('https://www.suruga-ya.jp/x', { method: 'GET' }, 'surugaya'),
    );
    expect(res).toBe(sentinel);
    expect(captured).toHaveLength(0);
  });

  it('falls back to safeFetch when no stock proxy is configured', async () => {
    mResolveStockProxy.mockReturnValue(null);
    const sentinel = new Response('direct', { status: 200 });
    mSafeFetch.mockResolvedValue(sentinel);
    const { stockProviderFetch } = await import('@/lib/proxy-fetch');
    const res = await stockProviderFetch('https://www.suruga-ya.jp/x', {}, 'surugaya');
    expect(res).toBe(sentinel);
  });

  it('tunnels through the resolved stock proxy when present', async () => {
    mResolveStockProxy.mockReturnValue(PROXY);
    responseQueue.push({ statusCode: 200, headers: {}, body: Buffer.from('shop') });
    const { stockProviderFetch } = await import('@/lib/proxy-fetch');
    const res = await stockProviderFetch('https://www.suruga-ya.jp/x', {}, 'surugaya');
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
  });
});

describe('buildAgent failure', () => {
  it('throws a sanitised error (never the proxy URL) when the agent constructor fails', async () => {
    mResolveProxy.mockReturnValue({ ...PROXY, protocol: 'http' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('https-proxy-agent', () => ({
      HttpsProxyAgent: class {
        constructor() {
          throw new Error('contains socks5h://user:pass@proxy.invalid:1080');
        }
      },
    }));
    const { providerFetch } = await import('@/lib/proxy-fetch');
    await expect(
      providerFetch('https://api.vndb.org/kana/vn', {}, 'egs'),
    ).rejects.toThrow('proxy agent init failed');
    expect(errSpy).toHaveBeenCalled();
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).not.toContain('user:pass');
    vi.doUnmock('https-proxy-agent');
  });
});

describe('nodeAgentFetch — body decoding and method handling', () => {
  it('gunzips a gzip-encoded body', async () => {
    responseQueue.push({
      statusCode: 200,
      headers: { 'content-encoding': 'gzip' },
      body: zlib.gzipSync(Buffer.from('hello-gzip')),
    });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch('https://api.vndb.org/x', {}, undefined, createProxyHopResolver(new Agent()));
    expect(await res.text()).toBe('hello-gzip');
    // The content-encoding header is stripped from the synthesised Response.
    expect(res.headers.get('content-encoding')).toBeNull();
  });

  it('brotli-decompresses a br-encoded body', async () => {
    responseQueue.push({
      statusCode: 200,
      headers: { 'content-encoding': 'br' },
      body: zlib.brotliCompressSync(Buffer.from('hello-brotli')),
    });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch('https://api.vndb.org/x', {}, undefined, createProxyHopResolver(new Agent()));
    expect(await res.text()).toBe('hello-brotli');
  });

  it('inflates a deflate-encoded body', async () => {
    responseQueue.push({
      statusCode: 200,
      headers: { 'content-encoding': 'deflate' },
      body: zlib.deflateSync(Buffer.from('hello-deflate')),
    });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch('https://api.vndb.org/x', {}, undefined, createProxyHopResolver(new Agent()));
    expect(await res.text()).toBe('hello-deflate');
  });

  it('passes an identity body through unchanged and preserves array + scalar headers', async () => {
    responseQueue.push({
      statusCode: 200,
      headers: { 'set-cookie': ['a=1', 'b=2'], 'x-trace': 'abc' },
      body: Buffer.from('plain'),
    });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch('https://api.vndb.org/x', {}, undefined, createProxyHopResolver(new Agent()));
    expect(await res.text()).toBe('plain');
    expect(res.headers.get('x-trace')).toBe('abc');
  });

  it('returns a null body for a HEAD request and sets content-length on a string body', async () => {
    responseQueue.push({ statusCode: 200, headers: {}, body: Buffer.from('IGNORED') });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch(
      'https://api.vndb.org/x',
      { method: 'HEAD', body: 'with-body' },
      undefined,
      createProxyHopResolver(new Agent()),
    );
    expect(await res.text()).toBe('');
    expect(captured[0].options.headers?.['content-length']).toBe(String(Buffer.byteLength('with-body')));
  });

  it('returns a bodyless Response for a 304 status', async () => {
    responseQueue.push({ statusCode: 304, headers: {}, body: Buffer.from('IGNORED') });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch('https://api.vndb.org/x', {}, undefined, createProxyHopResolver(new Agent()));
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
  });

  it('downgrades a 303 redirect to GET and drops the request body', async () => {
    responseQueue.push({ statusCode: 303, headers: { location: 'https://api.vndb.org/after' }, body: null });
    responseQueue.push({ statusCode: 200, headers: {}, body: Buffer.from('done') });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch(
      'https://api.vndb.org/submit',
      { method: 'POST', body: JSON.stringify({ a: 1 }), headers: { 'content-type': 'application/json' } },
      undefined,
      createProxyHopResolver(new Agent()),
    );
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(2);
    expect(captured[0].options.method).toBe('POST');
    expect(captured[1].options.method).toBe('GET');
    expect(captured[1].options.headers?.['content-length']).toBeUndefined();
  });

  it('downgrades a 301-on-POST redirect to GET', async () => {
    responseQueue.push({ statusCode: 301, headers: { location: 'https://api.vndb.org/moved' }, body: null });
    responseQueue.push({ statusCode: 200, headers: {}, body: Buffer.from('ok') });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    const res = await nodeAgentFetch(
      'https://api.vndb.org/old',
      { method: 'POST', body: 'x' },
      undefined,
      createProxyHopResolver(new Agent()),
    );
    expect(res.status).toBe(200);
    expect(captured[1].options.method).toBe('GET');
  });

  it('rejects when a single response chunk exceeds the 50 MiB hard cap', async () => {
    responseQueue.push({ statusCode: 200, headers: {}, body: Buffer.alloc(50 * 1024 * 1024 + 1) });
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    await expect(
      nodeAgentFetch('https://api.vndb.org/x', {}, undefined, createProxyHopResolver(new Agent())),
    ).rejects.toThrow(/exceeded 52428800 bytes/);
  });

  it('rejects with an AbortError when the AbortSignal is already aborted', async () => {
    const { nodeAgentFetch, createProxyHopResolver } = await import('@/lib/proxy-fetch');
    await expect(
      nodeAgentFetch(
        'https://api.vndb.org/x',
        { signal: AbortSignal.abort() },
        undefined,
        createProxyHopResolver(new Agent()),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
