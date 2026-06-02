/**
 * AUD-SEC-015 — ALLOW_TRUSTED_PROXY requires TRUSTED_PROXY_SECRET.
 *
 * Before this fix, ALLOW_TRUSTED_PROXY=1 unconditionally trusted any
 * X-Forwarded-For header, so any client could forge
 * `X-Forwarded-For: 127.0.0.1` and bypass the loopback gate.
 *
 * After the fix, X-Forwarded-For is only trusted when:
 *   1. ALLOW_TRUSTED_PROXY=1 is set, AND
 *   2. TRUSTED_PROXY_SECRET is set, AND
 *   3. X-Proxy-Secret header matches TRUSTED_PROXY_SECRET exactly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { NextRequest } from 'next/server';

const EXTERNAL_ORIGIN = 'http://93.184.216.34';
const TEST_SECRET = 'super-secret-proxy-token';

function makeExternalReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${EXTERNAL_ORIGIN}/api/settings`, {
    method: 'GET',
    headers,
  });
}

function makeLoopbackReq(): NextRequest {
  return new NextRequest('http://127.0.0.1/api/settings', { method: 'GET' });
}

describe('AUD-SEC-015 — trusted proxy secret gate', () => {
  const saved = {
    ALLOW_TRUSTED_PROXY: process.env.ALLOW_TRUSTED_PROXY,
    TRUSTED_PROXY_SECRET: process.env.TRUSTED_PROXY_SECRET,
    VN_ADMIN_TOKEN: process.env.VN_ADMIN_TOKEN,
  };

  beforeEach(() => {
    delete process.env.VN_ADMIN_TOKEN;
    delete process.env.ALLOW_TRUSTED_PROXY;
    delete process.env.TRUSTED_PROXY_SECRET;
  });

  afterEach(() => {
    if (saved.ALLOW_TRUSTED_PROXY !== undefined) process.env.ALLOW_TRUSTED_PROXY = saved.ALLOW_TRUSTED_PROXY;
    else delete process.env.ALLOW_TRUSTED_PROXY;
    if (saved.TRUSTED_PROXY_SECRET !== undefined) process.env.TRUSTED_PROXY_SECRET = saved.TRUSTED_PROXY_SECRET;
    else delete process.env.TRUSTED_PROXY_SECRET;
    if (saved.VN_ADMIN_TOKEN !== undefined) process.env.VN_ADMIN_TOKEN = saved.VN_ADMIN_TOKEN;
    else delete process.env.VN_ADMIN_TOKEN;
  });

  it('direct loopback request is always allowed regardless of proxy flags', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    expect(requireLocalhostOrToken(makeLoopbackReq())).toBeNull();
  });

  it('forged X-Forwarded-For: 127.0.0.1 without ALLOW_TRUSTED_PROXY is denied', () => {
    const res = requireLocalhostOrToken(
      makeExternalReq({ 'x-forwarded-for': '127.0.0.1' }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it('forged X-Forwarded-For: 127.0.0.1 with ALLOW_TRUSTED_PROXY=1 but no secret is denied', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    // TRUSTED_PROXY_SECRET not set — secret check fails
    const res = requireLocalhostOrToken(
      makeExternalReq({ 'x-forwarded-for': '127.0.0.1' }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it('X-Forwarded-For with wrong X-Proxy-Secret is denied', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    const res = requireLocalhostOrToken(
      makeExternalReq({
        'x-forwarded-for': '127.0.0.1',
        'x-proxy-secret': 'wrong-secret',
      }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it('X-Forwarded-For without X-Proxy-Secret is denied when a secret is configured', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    const res = requireLocalhostOrToken(
      makeExternalReq({ 'x-forwarded-for': '127.0.0.1' }),
    );
    expect(res?.status).toBe(403);
  });

  it('X-Forwarded-For with correct X-Proxy-Secret is allowed', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    const res = requireLocalhostOrToken(
      makeExternalReq({
        'x-forwarded-for': '127.0.0.1',
        'x-proxy-secret': TEST_SECRET,
      }),
    );
    expect(res).toBeNull();
  });

  it('ALLOW_TRUSTED_PROXY=0 ignores X-Forwarded-For even with correct secret', () => {
    process.env.ALLOW_TRUSTED_PROXY = '0';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    const res = requireLocalhostOrToken(
      makeExternalReq({
        'x-forwarded-for': '127.0.0.1',
        'x-proxy-secret': TEST_SECRET,
      }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it('X-Forwarded-For with non-loopback IP is denied even with correct secret', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    const res = requireLocalhostOrToken(
      makeExternalReq({
        'x-forwarded-for': '192.168.1.1',
        'x-proxy-secret': TEST_SECRET,
      }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it('accepts the loopback 127 subnet with a correct proxy secret', () => {
    process.env.ALLOW_TRUSTED_PROXY = '1';
    process.env.TRUSTED_PROXY_SECRET = TEST_SECRET;
    expect(requireLocalhostOrToken(
      makeExternalReq({
        'x-forwarded-for': '127.0.0.2',
        'x-proxy-secret': TEST_SECRET,
      }),
    )).toBeNull();
  });
});
