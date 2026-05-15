import { describe, expect, it } from 'vitest';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';

/**
 * SSRF gate. Every server-side outbound fetch that builds its URL
 * from data the user can influence MUST go through this helper. The
 * test pins both the allowlist membership and the categorical
 * rejections (IP literals, loopback, IPv6, non-http schemes).
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
});
