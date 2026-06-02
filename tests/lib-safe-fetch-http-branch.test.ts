/**
 * Supplemental coverage for `src/lib/safe-fetch.ts` — the non-TLS
 * (`http:`) hop branch of `resolvePinnedHop`, which returns an
 * `http.Agent` with NO `servername`, and the IPv6-only pin path. The
 * existing `safe-fetch.test.ts` only drives `https://` hops, so the
 * `http:` arm and the `family: 6` pin remain otherwise unexercised.
 *
 * Same hermetic harness as `safe-fetch.test.ts`: `node:dns/promises` is
 * mocked and `node:http`/`node:https` `request` is stubbed so no socket
 * opens; the agent's pinned `lookup` is invoked to confirm the connect
 * target.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LookupAddress } from 'node:dns';

vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }));

interface CapturedRequest {
  options: {
    hostname?: string;
    servername?: string;
    agent?: { options?: { lookup?: unknown } };
  };
}

const captured: CapturedRequest[] = [];
const responseQueue: Array<{ statusCode: number; headers: Record<string, string> }> = [];

function fakeRequest(
  options: CapturedRequest['options'],
  cb: (res: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void,
) {
  const queued = responseQueue.shift() ?? { statusCode: 200, headers: {} };
  captured.push({ options });
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

const mResolve4 = vi.mocked(resolve4);
const mResolve6 = vi.mocked(resolve6);

function firstLookup(agent: { options?: { lookup?: unknown } } | undefined): { address: string; family: number } {
  const lookup = agent?.options?.lookup as
    | ((host: string, opts: { all?: boolean }, cb: (e: unknown, addr: string | LookupAddress[], fam?: number) => void) => void)
    | undefined;
  if (!lookup) throw new Error('agent has no pinned lookup');
  let address = '';
  let family = 0;
  lookup('whatever.invalid', { all: false }, (_e, addr, fam) => {
    address = addr as string;
    family = fam ?? 0;
  });
  return { address, family };
}

beforeEach(() => {
  captured.length = 0;
  responseQueue.length = 0;
  mResolve4.mockReset();
  mResolve6.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('safeFetch — http (non-TLS) hop', () => {
  it('pins an http:// request without setting a TLS servername', async () => {
    mResolve4.mockResolvedValue(['82.192.72.172']);
    mResolve6.mockResolvedValue([]);
    responseQueue.push({ statusCode: 200, headers: {} });
    const { safeFetch } = await import('@/lib/safe-fetch');
    const res = await safeFetch('http://api.vndb.org/kana/vn');
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].options.servername).toBeUndefined();
    expect(firstLookup(captured[0].options.agent).address).toBe('82.192.72.172');
  });

  it('pins to an IPv6 answer (family 6) when only AAAA records resolve', async () => {
    mResolve4.mockRejectedValue(new Error('NODATA'));
    mResolve6.mockResolvedValue(['2606:4700::1111']);
    responseQueue.push({ statusCode: 200, headers: {} });
    const { safeFetch } = await import('@/lib/safe-fetch');
    const res = await safeFetch('https://api.vndb.org/kana/vn');
    expect(res.status).toBe(200);
    const pinned = firstLookup(captured[0].options.agent);
    expect(pinned.address).toBe('2606:4700::1111');
    expect(pinned.family).toBe(6);
  });
});
