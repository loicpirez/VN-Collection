import { describe, expect, it } from 'vitest';
import { normalizeVndbHref } from '@/lib/vndb-link-normalize';

/**
 * Pin the VNDB internal-link rewrite table. The function powers
 * the BBCode `[url=…]` resolution inside <VndbMarkup> and the bare
 * autolinker, so a regression here would re-introduce broken internal
 * routes (a `[url=c8646]` would link at `/c8646` instead of
 * `/character/c8646`).
 *
 * Route table mirrors `src/app/<route>/[id]`:
 *   v  → /vn          c → /character   r → /release
 *   p  → /producer    g → /tag         i → /trait    s → /staff
 * Other prefixes (`d`, `u`, `t`, `w`) keep the external URL.
 */
describe('normalizeVndbHref — absolute vndb.org URLs', () => {
  it('rewrites character pages to /character/cNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/c8646')).toBe('/character/c8646');
  });
  it('rewrites VN pages to /vn/vNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/v17')).toBe('/vn/v17');
  });
  it('rewrites release pages to /release/rNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/r123')).toBe('/release/r123');
  });
  it('rewrites producer pages to /producer/pNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/p4768')).toBe('/producer/p4768');
  });
  it('rewrites tag pages to /tag/gNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/g99')).toBe('/tag/g99');
  });
  it('rewrites trait pages to /trait/iNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/i735')).toBe('/trait/i735');
  });
  it('rewrites staff pages to /staff/sNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/s11')).toBe('/staff/s11');
  });
  it('accepts http:// scheme too', () => {
    expect(normalizeVndbHref('http://vndb.org/c8646')).toBe('/character/c8646');
  });
  it('accepts www.vndb.org subdomain', () => {
    expect(normalizeVndbHref('https://www.vndb.org/v17')).toBe('/vn/v17');
  });
});

describe('normalizeVndbHref — prefixes without internal route', () => {
  it('keeps user pages external (u prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/u123')).toBe('https://vndb.org/u123');
  });
  it('keeps docs external (d prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/d5')).toBe('https://vndb.org/d5');
  });
  it('keeps threads external (t prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/t1')).toBe('https://vndb.org/t1');
  });
  it('keeps reviews external (w prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/w99')).toBe('https://vndb.org/w99');
  });
});

describe('normalizeVndbHref — bare refs and relative paths', () => {
  it('maps a bare character ref to /character/cNNN', () => {
    expect(normalizeVndbHref('c8646')).toBe('/character/c8646');
  });
  it('maps a bare VN ref to /vn/vNNN', () => {
    expect(normalizeVndbHref('v17')).toBe('/vn/v17');
  });
  it('maps an already-broken /cNNN relative path', () => {
    expect(normalizeVndbHref('/c8646')).toBe('/character/c8646');
  });
  it('keeps a bare ref with unknown prefix unchanged', () => {
    expect(normalizeVndbHref('u123')).toBe('u123');
  });
});

describe('normalizeVndbHref — already-normalized routes', () => {
  it('passes /character/cNNN through unchanged', () => {
    expect(normalizeVndbHref('/character/c8646')).toBe('/character/c8646');
  });
  it('passes /vn/vNNN through unchanged', () => {
    expect(normalizeVndbHref('/vn/v17')).toBe('/vn/v17');
  });
});

describe('normalizeVndbHref — unrelated URLs', () => {
  it('passes through generic external URLs untouched', () => {
    expect(normalizeVndbHref('https://example.com/x')).toBe('https://example.com/x');
  });
  it('passes through mailto: links untouched', () => {
    expect(normalizeVndbHref('mailto:nobody@example.com')).toBe('mailto:nobody@example.com');
  });
  it('passes through a non-VNDB host that happens to share a path shape', () => {
    expect(normalizeVndbHref('https://impostor.com/c8646')).toBe('https://impostor.com/c8646');
  });
});

describe('normalizeVndbHref — null-safe edge cases', () => {
  it('returns empty string for null', () => {
    expect(normalizeVndbHref(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(normalizeVndbHref(undefined)).toBe('');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeVndbHref('')).toBe('');
  });
  it('trims surrounding whitespace before matching', () => {
    expect(normalizeVndbHref('  https://vndb.org/c8646  ')).toBe('/character/c8646');
  });
  it('handles trailing query / fragment on absolute URLs', () => {
    expect(normalizeVndbHref('https://vndb.org/v17?ref=foo')).toBe('/vn/v17');
    expect(normalizeVndbHref('https://vndb.org/c8646#bio')).toBe('/character/c8646');
  });
});
