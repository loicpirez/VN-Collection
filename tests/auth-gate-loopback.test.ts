/**
 * NEW-TCO-004 / R5-130 behavioral: `0.0.0.0` is NOT loopback.
 *
 * Calls requireLocalhostOrToken directly with requests whose Host header
 * is set to `0.0.0.0` and asserts the gate returns 403. A parallel
 * sub-suite confirms real loopback addresses are still allowed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { NextRequest } from 'next/server';

describe('auth-gate — 0.0.0.0 is not loopback (R5-130)', () => {
  const saved = { VN_ADMIN_TOKEN: process.env.VN_ADMIN_TOKEN };

  beforeEach(() => {
    delete process.env.VN_ADMIN_TOKEN;
  });

  afterEach(() => {
    if (saved.VN_ADMIN_TOKEN !== undefined) process.env.VN_ADMIN_TOKEN = saved.VN_ADMIN_TOKEN;
    else delete process.env.VN_ADMIN_TOKEN;
  });

  it('request with Host: 0.0.0.0 is denied with 403', () => {
    const req = new NextRequest('http://0.0.0.0/api/settings', { method: 'GET' });
    const result = requireLocalhostOrToken(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('request with Host: 127.0.0.1 is allowed (returns null)', () => {
    const req = new NextRequest('http://127.0.0.1/api/settings', { method: 'GET' });
    expect(requireLocalhostOrToken(req)).toBeNull();
  });

  it('request with Host: localhost is allowed (returns null)', () => {
    const req = new NextRequest('http://localhost/api/settings', { method: 'GET' });
    expect(requireLocalhostOrToken(req)).toBeNull();
  });

  it('request with Host: ::1 is allowed (returns null)', () => {
    const req = new NextRequest('http://[::1]/api/settings', { method: 'GET' });
    expect(requireLocalhostOrToken(req)).toBeNull();
  });

  it('external IP without token is denied with 403', () => {
    const req = new NextRequest('http://93.184.216.34/api/settings', { method: 'GET' });
    const result = requireLocalhostOrToken(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
