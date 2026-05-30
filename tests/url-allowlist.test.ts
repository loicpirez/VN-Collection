import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAllowedHttpTarget, isPrivateIpv4, assertNoPrivateIpRebind } from '@/lib/url-allowlist';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
}));

import { resolve4 } from 'node:dns/promises';
const mockResolve4 = vi.mocked(resolve4);

/**
 * SSRF gate. Every server-side outbound fetch that builds its URL
 * from data the user can influence MUST go through this helper. The
 * test pins both the allowlist membership and the categorical
 * rejections (IP literals, loopback, IPv6, non-http schemes).
 *
 * AUD-SEC-014: backup URL allowlist validation.
 * AUD-SEC-016: DNS rebinding defense (isPrivateIpv4 + assertNoPrivateIpRebind).
 */

describe('isAllowedHttpTarget', () => {
  // -- positive cases ----------------------------------------------
  it.each([
    'https://s2.vndb.org/cv/12.jpg',
    'https://s.vndb.org/cv/12.jpg',
    'https://t.vndb.org/cv/12.jpg',
    'https://cdn.vndb.org/cv/12.jpg',
    'https://api.vndb.org/kana/vn',
    'https://vndb.org/p123',
    'https://api.yorhel.org/kana/vn',
    'https://erogamescape.dyndns.org/path',
    'https://erogamescape.org/path',
    'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/',
    'https://pics.dmm.co.jp/digital/pcgame/foo/bar.jpg',
    'https://img.dlsite.jp/modpub/images2/work/foo.jpg',
    'https://www.suruga-ya.jp/database/pics/game/1.jpg',
    'https://gyutto.com/i/item1/package.jpg',
    'https://image.itch.zone/foo.jpg',
    'https://cdn.steamgriddb.com/foo.jpg',
    'https://shared.cloudflare.steamstatic.com/foo.jpg',
    'https://lemmasoft.renai.us/foo.png',
  ])('allows %s', (url) => {
    expect(isAllowedHttpTarget(url)).toBe(true);
  });

  // -- categorical rejections -------------------------------------
  it('rejects malformed URLs', () => {
    expect(isAllowedHttpTarget('not a url')).toBe(false);
    expect(isAllowedHttpTarget('')).toBe(false);
    expect(isAllowedHttpTarget('://missing-scheme')).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isAllowedHttpTarget('javascript:alert(1)')).toBe(false);
    expect(isAllowedHttpTarget('data:text/html,<script>x</script>')).toBe(false);
    expect(isAllowedHttpTarget('file:///etc/passwd')).toBe(false);
    expect(isAllowedHttpTarget('ftp://api.vndb.org/file')).toBe(false);
  });

  it('rejects IPv4 literals even when "host" technically matches', () => {
    expect(isAllowedHttpTarget('http://127.0.0.1')).toBe(false);
    expect(isAllowedHttpTarget('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedHttpTarget('https://192.168.1.1/admin')).toBe(false);
    expect(isAllowedHttpTarget('https://10.0.0.1')).toBe(false);
  });

  it('rejects IPv6 literals', () => {
    expect(isAllowedHttpTarget('http://[::1]')).toBe(false);
    expect(isAllowedHttpTarget('http://[fd00::1]')).toBe(false);
  });

  it('rejects localhost variants', () => {
    expect(isAllowedHttpTarget('http://localhost')).toBe(false);
    expect(isAllowedHttpTarget('http://localhost:5432')).toBe(false);
    expect(isAllowedHttpTarget('http://api.localhost')).toBe(false);
    expect(isAllowedHttpTarget('http://api.local')).toBe(false);
  });

  it('rejects hosts not on the allowlist', () => {
    expect(isAllowedHttpTarget('https://evil.example.com')).toBe(false);
    expect(isAllowedHttpTarget('https://random-cdn.com')).toBe(false);
    expect(isAllowedHttpTarget('https://vndb-org.evil.com')).toBe(false);
  });

  // AUD-SEC-014: backup URL validation uses this gate at settings-save time
  it('AUD-SEC-014: rejects private/loopback backup URL targets', () => {
    expect(isAllowedHttpTarget('http://127.0.0.1/kana')).toBe(false);
    expect(isAllowedHttpTarget('http://localhost/kana')).toBe(false);
    expect(isAllowedHttpTarget('http://192.168.0.1/kana')).toBe(false);
    expect(isAllowedHttpTarget('http://10.0.0.1/kana')).toBe(false);
    expect(isAllowedHttpTarget('http://172.16.0.1/kana')).toBe(false);
    expect(isAllowedHttpTarget('file:///etc/passwd')).toBe(false);
    expect(isAllowedHttpTarget('not-a-url')).toBe(false);
    expect(isAllowedHttpTarget('https://random-host.com/kana')).toBe(false);
  });

  it('AUD-SEC-014: accepts the intended safe backup URL (api.yorhel.org)', () => {
    expect(isAllowedHttpTarget('https://api.yorhel.org/kana')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AUD-SEC-016: isPrivateIpv4 — DNS rebinding helper
// ---------------------------------------------------------------------------
describe('isPrivateIpv4', () => {
  it('returns true for loopback 127.x.x.x', () => {
    expect(isPrivateIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateIpv4('127.1.2.3')).toBe(true);
  });

  it('returns true for RFC-1918 10.x.x.x', () => {
    expect(isPrivateIpv4('10.0.0.1')).toBe(true);
    expect(isPrivateIpv4('10.255.255.255')).toBe(true);
  });

  it('returns true for RFC-1918 172.16-31.x.x', () => {
    expect(isPrivateIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateIpv4('172.31.255.255')).toBe(true);
  });

  it('returns false for 172.15.x.x and 172.32.x.x (outside range)', () => {
    expect(isPrivateIpv4('172.15.0.1')).toBe(false);
    expect(isPrivateIpv4('172.32.0.1')).toBe(false);
  });

  it('returns true for RFC-1918 192.168.x.x', () => {
    expect(isPrivateIpv4('192.168.0.1')).toBe(true);
    expect(isPrivateIpv4('192.168.255.255')).toBe(true);
  });

  it('returns true for link-local 169.254.x.x', () => {
    expect(isPrivateIpv4('169.254.0.1')).toBe(true);
    expect(isPrivateIpv4('169.254.169.254')).toBe(true);
  });

  it('returns false for public IPs', () => {
    expect(isPrivateIpv4('1.1.1.1')).toBe(false);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('93.184.216.34')).toBe(false);
  });

  it('returns true for reserved / non-global ranges (TEST-NET, CGNAT, multicast, this-host)', () => {
    expect(isPrivateIpv4('0.0.0.0')).toBe(true);
    expect(isPrivateIpv4('100.64.0.1')).toBe(true);
    expect(isPrivateIpv4('192.0.2.1')).toBe(true);
    expect(isPrivateIpv4('198.51.100.1')).toBe(true);
    expect(isPrivateIpv4('203.0.113.1')).toBe(true);
    expect(isPrivateIpv4('198.18.0.1')).toBe(true);
    expect(isPrivateIpv4('224.0.0.1')).toBe(true);
    expect(isPrivateIpv4('255.255.255.255')).toBe(true);
  });

  it('returns true for malformed input (fail-closed so a caller never pins an unparsable target)', () => {
    expect(isPrivateIpv4('not-an-ip')).toBe(true);
    expect(isPrivateIpv4('256.0.0.1')).toBe(true);
    expect(isPrivateIpv4('1.2.3')).toBe(true);
    expect(isPrivateIpv4('')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AUD-SEC-016: assertNoPrivateIpRebind — DNS resolution + private IP check
// ---------------------------------------------------------------------------
describe('assertNoPrivateIpRebind', () => {
  beforeEach(() => {
    mockResolve4.mockReset();
  });

  it('throws when hostname resolves to loopback 127.0.0.1', async () => {
    mockResolve4.mockResolvedValue(['127.0.0.1']);
    await expect(assertNoPrivateIpRebind('evil.example.com')).rejects.toThrow(
      /DNS rebind blocked.*127\.0\.0\.1/,
    );
  });

  it('throws when hostname resolves to RFC-1918 192.168.x.x', async () => {
    mockResolve4.mockResolvedValue(['192.168.1.100']);
    await expect(assertNoPrivateIpRebind('rebind.example.com')).rejects.toThrow(
      /DNS rebind blocked.*192\.168\.1\.100/,
    );
  });

  it('throws when hostname resolves to link-local 169.254.x.x', async () => {
    mockResolve4.mockResolvedValue(['169.254.169.254']);
    await expect(assertNoPrivateIpRebind('metadata.example.com')).rejects.toThrow(
      /DNS rebind blocked.*169\.254\.169\.254/,
    );
  });

  it('resolves without error when hostname resolves to a public IP', async () => {
    mockResolve4.mockResolvedValue(['1.1.1.1']);
    await expect(assertNoPrivateIpRebind('api.yorhel.org')).resolves.toBeUndefined();
  });

  it('throws (fail-closed) when DNS resolution fails', async () => {
    mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertNoPrivateIpRebind('unreachable.example.com')).rejects.toThrow(
      /DNS resolution failed/,
    );
  });

  it('throws when any of multiple resolved addresses is private', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34', '10.0.0.1']);
    await expect(assertNoPrivateIpRebind('mixed.example.com')).rejects.toThrow(
      /DNS rebind blocked.*10\.0\.0\.1/,
    );
  });
});
