/**
 * Extends `tests/url-allowlist.test.ts` with coverage for the IPv6
 * branch of the DNS-rebinding defence (`isPrivateIpv6` + the v6
 * resolve path inside `resolveAndCheckHostname`).
 *
 * The pre-existing test only mocked `resolve4`; the v6 path stayed
 * uncovered. This file mocks BOTH so we can exercise:
 *   - link-local fe80::
 *   - ULA fc00::/7 (fc-/fd- prefixes)
 *   - loopback ::1
 *   - mixed-family resolves (public v4 + private v6, or vice versa)
 *   - NODATA on both families (DNS failure)
 *   - resolveAndCheckHostname returns the validated tuple
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

import { resolve4, resolve6 } from 'node:dns/promises';
import {
  assertNoPrivateIpRebind,
  isPrivateIpv6,
  resolveAndCheckHostname,
} from '@/lib/url-allowlist';

const mockResolve4 = vi.mocked(resolve4);
const mockResolve6 = vi.mocked(resolve6);

describe('isPrivateIpv6 — categorical buckets', () => {
  it('returns true for IPv6 loopback ::1', () => {
    expect(isPrivateIpv6('::1')).toBe(true);
    expect(isPrivateIpv6('::1'.toUpperCase())).toBe(true);
  });

  it('returns true for link-local fe80::', () => {
    expect(isPrivateIpv6('fe80::1')).toBe(true);
    expect(isPrivateIpv6('FE80::1')).toBe(true);
    expect(isPrivateIpv6('fe80::abcd:1234:5678:90ab')).toBe(true);
  });

  it('returns true for unique-local fc00::/7 (fc + fd prefixes)', () => {
    expect(isPrivateIpv6('fc00::1')).toBe(true);
    expect(isPrivateIpv6('fd12:3456:789a::1')).toBe(true);
    expect(isPrivateIpv6('FD::')).toBe(true);
  });

  it('returns true for reserved IPv6 ranges and mapped private IPv4', () => {
    expect(isPrivateIpv6('fec0::1')).toBe(true);
    expect(isPrivateIpv6('ff00::1')).toBe(true);
    expect(isPrivateIpv6('2001:db8::1')).toBe(true);
    expect(isPrivateIpv6('64:ff9b::1')).toBe(true);
    expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIpv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('returns false for public IPv6 addresses', () => {
    expect(isPrivateIpv6('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateIpv6('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIpv6('2400:cb00::1')).toBe(false);
  });

  it('returns false for malformed / empty input', () => {
    expect(isPrivateIpv6('')).toBe(false);
    expect(isPrivateIpv6('not-an-ip')).toBe(false);
    // String slicing is naive — `fcc` happens to start with `fc`
    // so the helper rejects a request to ANY hostname that starts
    // with those two bytes. This is intentional and documented;
    // we pin the behaviour rather than introducing parsing.
    expect(isPrivateIpv6('fcc0::1')).toBe(true);
  });
});

describe('resolveAndCheckHostname — IPv6 branches', () => {
  beforeEach(() => {
    mockResolve4.mockReset();
    mockResolve6.mockReset();
  });

  it('throws when AAAA resolves to ::1', async () => {
    mockResolve4.mockRejectedValue(new Error('NODATA')); // IPv6-only host
    mockResolve6.mockResolvedValue(['::1']);
    await expect(resolveAndCheckHostname('evil6.example.com')).rejects.toThrow(
      /DNS rebind blocked.*IPv6.*::1/i,
    );
  });

  it('throws when AAAA resolves to fe80:: link-local', async () => {
    mockResolve4.mockRejectedValue(new Error('NODATA'));
    mockResolve6.mockResolvedValue(['fe80::1']);
    await expect(resolveAndCheckHostname('linklocal.example.com')).rejects.toThrow(
      /DNS rebind blocked.*fe80/i,
    );
  });

  it('throws when AAAA resolves to fc00:: ULA', async () => {
    mockResolve4.mockRejectedValue(new Error('NODATA'));
    mockResolve6.mockResolvedValue(['fd12:3456:789a::1']);
    await expect(resolveAndCheckHostname('ula.example.com')).rejects.toThrow(
      /DNS rebind blocked.*fd12/i,
    );
  });

  it('throws when A returns public but AAAA returns private (mixed)', async () => {
    // The classic rebind attack: an attacker controls a DNS server
    // that returns a benign IPv4 plus a private IPv6 that the OS
    // prefers. The check must fail fast on either family.
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue(['fc00::1']);
    await expect(resolveAndCheckHostname('mixed-v6.example.com')).rejects.toThrow(
      /DNS rebind blocked.*fc00/i,
    );
  });

  it('throws when A returns private but AAAA returns public (mixed)', async () => {
    mockResolve4.mockResolvedValue(['10.0.0.1']);
    mockResolve6.mockResolvedValue(['2001:4860:4860::8888']);
    await expect(resolveAndCheckHostname('mixed-v4.example.com')).rejects.toThrow(
      /DNS rebind blocked.*10\.0\.0\.1/,
    );
  });

  it('returns the validated tuple when both families resolve public', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue(['2001:4860:4860::8888']);
    const result = await resolveAndCheckHostname('happy.example.com');
    expect(result.ipv4).toEqual(['93.184.216.34']);
    expect(result.ipv6).toEqual(['2001:4860:4860::8888']);
  });

  it('throws fail-closed when BOTH families return NODATA', async () => {
    mockResolve4.mockRejectedValue(new Error('NODATA'));
    mockResolve6.mockRejectedValue(new Error('NODATA'));
    await expect(resolveAndCheckHostname('nodata.example.com')).rejects.toThrow(
      /DNS resolution failed/,
    );
  });

  it('returns when only IPv6 resolves successfully (IPv6-only host)', async () => {
    mockResolve4.mockRejectedValue(new Error('NODATA'));
    mockResolve6.mockResolvedValue(['2001:4860:4860::8888']);
    const result = await resolveAndCheckHostname('v6only.example.com');
    expect(result.ipv4).toEqual([]);
    expect(result.ipv6).toEqual(['2001:4860:4860::8888']);
  });

  it('assertNoPrivateIpRebind delegates to resolveAndCheckHostname', async () => {
    mockResolve4.mockResolvedValue(['1.1.1.1']);
    mockResolve6.mockResolvedValue([]);
    await expect(assertNoPrivateIpRebind('api.yorhel.org')).resolves.toBeUndefined();
  });
});
