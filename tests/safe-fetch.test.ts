import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R5-SEC-012: proves `safeFetch` closes the DNS-rebind / TOCTOU SSRF gap.
 * `node:dns/promises` is mocked so each test controls what the host resolves
 * to, and `node:http`/`node:https` `request` is stubbed so no real socket
 * opens — the stub captures the connect options (so we can read back the
 * `servername`) and drives the agent's `lookup` to assert the socket would
 * pin to the pre-validated public IP rather than re-resolving.
 */

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

interface CapturedRequest {
  options: {
    hostname?: string;
    servername?: string;
    agent?: { options?: { lookup?: unknown } };
  };
  statusCode: number;
  headers: Record<string, string>;
}

const captured: CapturedRequest[] = [];
const responseQueue: Array<{ statusCode: number; headers: Record<string, string> }> = [];

function fakeRequest(options: CapturedRequest['options'], cb: (res: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void) {
  const queued = responseQueue.shift() ?? { statusCode: 200, headers: {} };
  captured.push({ options, statusCode: queued.statusCode, headers: queued.headers });
  const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: () => void };
  req.write = () => {};
  req.destroy = () => {};
  req.end = () => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
    res.statusCode = queued.statusCode;
    res.headers = queued.headers;
    cb(res);
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
import type { LookupAddress } from 'node:dns';
import { Agent } from 'node:http';

const mockResolve4 = vi.mocked(resolve4);
const mockResolve6 = vi.mocked(resolve6);

/**
 * Drive an agent's pinned `lookup` (both call shapes) and return what the
 * socket layer would receive as connect targets.
 */
function runLookup(agent: { options?: { lookup?: unknown } } | undefined): { all: LookupAddress[]; firstAddress: string; firstFamily: number } {
  const lookup = agent?.options?.lookup as
    | ((host: string, opts: { all?: boolean }, cb: (e: unknown, addr: string | LookupAddress[], fam?: number) => void) => void)
    | undefined;
  if (!lookup) throw new Error('agent has no pinned lookup');
  let all: LookupAddress[] = [];
  lookup('whatever.invalid', { all: true }, (_e, addr) => {
    all = addr as LookupAddress[];
  });
  let firstAddress = '';
  let firstFamily = 0;
  lookup('whatever.invalid', { all: false }, (_e, addr, fam) => {
    firstAddress = addr as string;
    firstFamily = fam ?? 0;
  });
  return { all, firstAddress, firstFamily };
}

beforeEach(() => {
  captured.length = 0;
  responseQueue.length = 0;
  mockResolve4.mockReset();
  mockResolve6.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('safeFetch — SSRF pinning (R5-SEC-012)', () => {
  it('rejects an off-allowlist host before opening any socket', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue([]);
    const { safeFetch } = await import('@/lib/safe-fetch');
    await expect(safeFetch('https://evil.example.com/x')).rejects.toThrow(/host allowlist/);
    expect(captured).toHaveLength(0);
  });

  it('rejects an allowlisted host that resolves to a private IPv4 (rebind) before connecting', async () => {
    mockResolve4.mockResolvedValue(['169.254.169.254']);
    mockResolve6.mockResolvedValue([]);
    const { safeFetch } = await import('@/lib/safe-fetch');
    await expect(safeFetch('https://api.vndb.org/kana/vn')).rejects.toThrow(/private IPv4 169\.254\.169\.254/);
    expect(captured).toHaveLength(0);
  });

  it('rejects an allowlisted host that resolves to a private IPv6 (rebind) before connecting', async () => {
    mockResolve4.mockRejectedValue(new Error('NODATA'));
    mockResolve6.mockResolvedValue(['fd00::1']);
    const { safeFetch } = await import('@/lib/safe-fetch');
    await expect(safeFetch('https://api.vndb.org/kana/vn')).rejects.toThrow(/private IPv6 fd00::1/);
    expect(captured).toHaveLength(0);
  });

  it('pins the socket to the pre-validated public IP and sets TLS servername to the hostname', async () => {
    mockResolve4.mockResolvedValue(['82.192.72.172']);
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 200, headers: {} });
    const { safeFetch } = await import('@/lib/safe-fetch');
    const res = await safeFetch('https://api.vndb.org/kana/vn');
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    const { options } = captured[0];
    expect(options.hostname).toBe('api.vndb.org');
    expect(options.servername).toBe('api.vndb.org');
    const pinned = runLookup(options.agent);
    expect(pinned.all).toEqual([{ address: '82.192.72.172', family: 4 }]);
    expect(pinned.firstAddress).toBe('82.192.72.172');
    expect(pinned.firstFamily).toBe(4);
  });

  it('re-validates a redirect hop and rejects a Location that resolves to a private IP', async () => {
    mockResolve4.mockImplementation(async (host: string) => {
      if (host === 'api.vndb.org') return ['82.192.72.172'];
      if (host === 'cdn.vndb.org') return ['10.0.0.5'];
      throw new Error(`unexpected host ${host}`);
    });
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 302, headers: { location: 'https://cdn.vndb.org/evil' } });
    const { safeFetch } = await import('@/lib/safe-fetch');
    await expect(safeFetch('https://api.vndb.org/kana/vn')).rejects.toThrow(/private IPv4 10\.0\.0\.5/);
    expect(captured).toHaveLength(1);
    expect(captured[0].options.hostname).toBe('api.vndb.org');
  });

  it('follows a redirect to another allowlisted host, re-pinning to that host new IP', async () => {
    mockResolve4.mockImplementation(async (host: string) => {
      if (host === 'api.vndb.org') return ['82.192.72.172'];
      if (host === 'cdn.vndb.org') return ['104.18.0.7'];
      throw new Error(`unexpected host ${host}`);
    });
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 302, headers: { location: 'https://cdn.vndb.org/cv/1.jpg' } });
    responseQueue.push({ statusCode: 200, headers: {} });
    const { safeFetch } = await import('@/lib/safe-fetch');
    const res = await safeFetch('https://api.vndb.org/kana/vn');
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(2);
    expect(captured[0].options.hostname).toBe('api.vndb.org');
    expect(runLookup(captured[0].options.agent).firstAddress).toBe('82.192.72.172');
    expect(captured[1].options.hostname).toBe('cdn.vndb.org');
    expect(runLookup(captured[1].options.agent).firstAddress).toBe('104.18.0.7');
  });
});

describe('proxy hop validation', () => {
  it('rejects an off-allowlist initial proxy target before opening a socket', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue([]);
    const { createProxyHopResolver, nodeAgentFetch } = await import('@/lib/proxy-fetch');
    const proxyAgent = new Agent();
    await expect(
      nodeAgentFetch('https://evil.example.com/x', {}, undefined, createProxyHopResolver(proxyAgent)),
    ).rejects.toThrow(/host allowlist/);
    expect(captured).toHaveLength(0);
  });

  it('rejects an allowlisted initial proxy target resolving to a private IP before opening a socket', async () => {
    mockResolve4.mockResolvedValue(['10.0.0.5']);
    mockResolve6.mockResolvedValue([]);
    const { createProxyHopResolver, nodeAgentFetch } = await import('@/lib/proxy-fetch');
    const proxyAgent = new Agent();
    await expect(
      nodeAgentFetch('https://api.vndb.org/kana/vn', {}, undefined, createProxyHopResolver(proxyAgent)),
    ).rejects.toThrow(/private IPv4 10\.0\.0\.5/);
    expect(captured).toHaveLength(0);
  });

  it('rejects an off-allowlist redirect before sending the second proxy request', async () => {
    mockResolve4.mockResolvedValue(['82.192.72.172']);
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 302, headers: { location: 'https://evil.example.com/redirected' } });
    const { createProxyHopResolver, nodeAgentFetch } = await import('@/lib/proxy-fetch');
    const proxyAgent = new Agent();
    await expect(
      nodeAgentFetch('https://api.vndb.org/kana/vn', {}, undefined, createProxyHopResolver(proxyAgent)),
    ).rejects.toThrow(/host allowlist/);
    expect(captured).toHaveLength(1);
  });

  it('rejects an allowlisted redirect resolving to a private IP before sending the second proxy request', async () => {
    mockResolve4.mockImplementation(async (host: string) => {
      if (host === 'api.vndb.org') return ['82.192.72.172'];
      if (host === 'cdn.vndb.org') return ['10.0.0.5'];
      throw new Error(`unexpected host ${host}`);
    });
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 302, headers: { location: 'https://cdn.vndb.org/redirected' } });
    const { createProxyHopResolver, nodeAgentFetch } = await import('@/lib/proxy-fetch');
    const proxyAgent = new Agent();
    await expect(
      nodeAgentFetch('https://api.vndb.org/kana/vn', {}, undefined, createProxyHopResolver(proxyAgent)),
    ).rejects.toThrow(/private IPv4 10\.0\.0\.5/);
    expect(captured).toHaveLength(1);
  });

  it('follows validated redirects through the same proxy agent', async () => {
    mockResolve4.mockImplementation(async (host: string) => {
      if (host === 'api.vndb.org') return ['82.192.72.172'];
      if (host === 'cdn.vndb.org') return ['104.18.0.7'];
      throw new Error(`unexpected host ${host}`);
    });
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 302, headers: { location: 'https://cdn.vndb.org/cv/1.jpg' } });
    responseQueue.push({ statusCode: 200, headers: {} });
    const { createProxyHopResolver, nodeAgentFetch } = await import('@/lib/proxy-fetch');
    const proxyAgent = new Agent();
    const res = await nodeAgentFetch(
      'https://api.vndb.org/kana/vn',
      {},
      undefined,
      createProxyHopResolver(proxyAgent),
    );
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(2);
    expect(captured[0].options.agent).toBe(proxyAgent);
    expect(captured[1].options.agent).toBe(proxyAgent);
  });

  it('returns a bodyless Response for successful 204 mutations', async () => {
    mockResolve4.mockResolvedValue(['82.192.72.172']);
    mockResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 204, headers: {} });
    const { createProxyHopResolver, nodeAgentFetch } = await import('@/lib/proxy-fetch');
    const proxyAgent = new Agent();
    const res = await nodeAgentFetch(
      'https://api.vndb.org/kana/ulist/v50956',
      { method: 'PATCH', body: JSON.stringify({ labels_set: [5] }) },
      undefined,
      createProxyHopResolver(proxyAgent),
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});
